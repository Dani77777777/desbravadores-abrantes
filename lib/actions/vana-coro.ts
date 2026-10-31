'use server'

import { revalidatePath } from 'next/cache'
import { FORBIDDEN, requireCoordinator, type ServiceClient } from '@/lib/vana-coro/auth'
import { NORMAL_RHYTHM, TURBO_RHYTHM, closingFor, questionStatus, scheduleQueue } from '@/utils/vana-coro/schedule'
import type { VanaCoroQuestion, VanaCoroQuestionWithStats, VanaCoroSettings } from '@/types/vana-coro'

// Admin do VanaCoro (só coordenação): a fila de perguntas da "Pergunta da Semana",
// o ritmo e o link de convite. A revisão dos grupos está em vana-coro-review.ts.

export type ActionResult = { error?: string }

const QUESTIONS = 'vanacoro_questions'
const SETTINGS = 'vanacoro_settings'
const PROMPT_MIN = 5
const PROMPT_MAX = 140

function done() {
  revalidatePath('/admin/vana-coro')
}

function cleanPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim()
}

function promptError(prompt: string): string | null {
  const len = [...prompt].length
  if (len < PROMPT_MIN) return `A pergunta tem de ter pelo menos ${PROMPT_MIN} caracteres.`
  if (len > PROMPT_MAX) return `A pergunta pode ter até ${PROMPT_MAX} caracteres.`
  return null
}

/** 8 caracteres base62 aleatórios (sem viés: rejeita os bytes acima de 247). */
function randomToken(length = 8): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let out = ''
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < 248 && out.length < length) out += alphabet[b % 62]
    }
  }
  return out
}

// ── Leitura ───────────────────────────────────────────────────

export interface VanaCoroAdminData {
  settings: VanaCoroSettings
  questions: VanaCoroQuestionWithStats[]
}

/** null = sem permissão; 'missing' = tabelas por criar (SQL por correr). */
export async function getVanaCoroAdminData(): Promise<VanaCoroAdminData | null | 'missing'> {
  const ctx = await requireCoordinator()
  if (!ctx) return null
  const { service } = ctx

  const [settingsRes, questionsRes, statsRes] = await Promise.all([
    service.from(SETTINGS).select('invite_token, invite_rotated_at, cadence_days, open_days, turbo').eq('id', 1).maybeSingle(),
    service
      .from(QUESTIONS)
      .select('id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, created_at')
      .order('created_at', { ascending: true }),
    service.rpc('vanacoro_question_stats'),
  ])
  if (settingsRes.error || questionsRes.error || !settingsRes.data) return 'missing'

  const stats = new Map<string, { respondents: number; answers: number; guest_respondents: number }>()
  for (const s of (statsRes.data ?? []) as { question_id: string; respondents: number; answers: number; guest_respondents: number }[]) {
    stats.set(s.question_id, {
      respondents: Number(s.respondents),
      answers: Number(s.answers),
      guest_respondents: Number(s.guest_respondents),
    })
  }

  return {
    settings: settingsRes.data as VanaCoroSettings,
    questions: ((questionsRes.data ?? []) as VanaCoroQuestion[]).map((q) => ({
      ...q,
      ...(stats.get(q.id) ?? { respondents: 0, answers: 0, guest_respondents: 0 }),
    })),
  }
}

async function answerCount(service: ServiceClient, questionId: string): Promise<number> {
  const { count } = await service
    .from('vanacoro_answers')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)
  return count ?? 0
}

async function loadQuestion(service: ServiceClient, id: string) {
  const { data } = await service
    .from(QUESTIONS)
    .select('id, opens_at, closes_at, review_status, used_at')
    .eq('id', id)
    .maybeSingle()
  return data
}

// ── Perguntas ─────────────────────────────────────────────────

/** Cria uma pergunta por linha, todas na fila (sem data). */
export async function createQuestions(text: string, allowGuests: boolean): Promise<ActionResult & { created?: number }> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const prompts = text.split('\n').map(cleanPrompt).filter(Boolean)
  if (prompts.length === 0) return { error: 'Escreve pelo menos uma pergunta.' }
  if (prompts.length > 30) return { error: 'No máximo 30 perguntas de cada vez.' }
  for (const p of prompts) {
    const err = promptError(p)
    if (err) return { error: `"${p.slice(0, 40)}": ${err}` }
  }

  // created_at a subir 1 ms por linha, para "Agendar fila" respeitar a ordem escrita.
  const base = Date.now()
  const { error } = await ctx.service.from(QUESTIONS).insert(
    prompts.map((prompt, i) => ({
      prompt,
      allow_guests: allowGuests,
      created_by: ctx.user.id,
      created_at: new Date(base + i).toISOString(),
    })),
  )
  if (error) return { error: 'Não foi possível criar as perguntas.' }
  done()
  return { created: prompts.length }
}

export async function updateQuestion(id: string, input: { prompt: string; allow_guests: boolean }): Promise<ActionResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const prompt = cleanPrompt(input.prompt)
  const err = promptError(prompt)
  if (err) return { error: err }

  const { data: current } = await ctx.service.from(QUESTIONS).select('prompt').eq('id', id).maybeSingle()
  if (!current) return { error: 'Pergunta não encontrada.' }
  // Mudar o texto depois de haver respostas misturava respostas a perguntas diferentes.
  if (current.prompt !== prompt && (await answerCount(ctx.service, id)) > 0) {
    return { error: 'Esta pergunta já tem respostas: o texto já não se pode mudar.' }
  }

  const { error } = await ctx.service.from(QUESTIONS).update({ prompt, allow_guests: input.allow_guests }).eq('id', id)
  if (error) return { error: 'Não foi possível guardar.' }
  done()
  return {}
}

/** Sem respostas apaga-se logo; com respostas é preciso escrever APAGAR. */
export async function deleteQuestion(id: string, confirmation?: string): Promise<ActionResult & { needsConfirmation?: number }> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const answers = await answerCount(ctx.service, id)
  if (answers > 0 && confirmation?.trim().toUpperCase() !== 'APAGAR') {
    return { needsConfirmation: answers }
  }
  const { error } = await ctx.service.from(QUESTIONS).delete().eq('id', id)
  if (error) return { error: 'Não foi possível apagar.' }
  done()
  return {}
}

// ── Ritmo ─────────────────────────────────────────────────────

/** Dá data às perguntas da fila: de `cadence_days` em `cadence_days`, às 18:00 de Lisboa. */
export async function scheduleQueueAction(): Promise<ActionResult & { scheduled?: number }> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const [{ data: settings }, { data: questions }] = await Promise.all([
    ctx.service.from(SETTINGS).select('cadence_days, open_days').eq('id', 1).maybeSingle(),
    ctx.service.from(QUESTIONS).select('id, opens_at, created_at'),
  ])
  if (!settings || !questions) return { error: 'Não foi possível ler a fila.' }

  const slots = scheduleQueue(questions, settings)
  for (const slot of slots) {
    // .is('opens_at', null): não estraga uma pergunta que outra aba agendou entretanto.
    const { error } = await ctx.service
      .from(QUESTIONS)
      .update({ opens_at: slot.opens_at, closes_at: slot.closes_at })
      .eq('id', slot.id)
      .is('opens_at', null)
    if (error) return { error: 'Não foi possível agendar todas as perguntas.' }
  }
  done()
  return { scheduled: slots.length }
}

/** Abre já (fica aberta `open_days`, até às 18:00 de Lisboa desse dia). */
export async function openQuestionNow(id: string): Promise<ActionResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const q = await loadQuestion(ctx.service, id)
  if (!q) return { error: 'Pergunta não encontrada.' }
  const status = questionStatus(q)
  if (status !== 'queued' && status !== 'scheduled') return { error: 'Esta pergunta já abriu.' }

  const { data: settings } = await ctx.service.from(SETTINGS).select('open_days').eq('id', 1).maybeSingle()
  const now = new Date()
  const { error } = await ctx.service
    .from(QUESTIONS)
    .update({ opens_at: now.toISOString(), closes_at: closingFor(now, settings?.open_days ?? NORMAL_RHYTHM.open_days).toISOString() })
    .eq('id', id)
  if (error) return { error: 'Não foi possível abrir.' }
  done()
  return {}
}

/** Fecha já uma pergunta aberta. */
export async function closeQuestionNow(id: string): Promise<ActionResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const q = await loadQuestion(ctx.service, id)
  if (!q || questionStatus(q) !== 'open') return { error: 'Esta pergunta não está aberta.' }
  const { error } = await ctx.service.from(QUESTIONS).update({ closes_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: 'Não foi possível fechar.' }
  done()
  return {}
}

/** Tira a data a uma pergunta agendada que ainda não abriu (volta para a fila). */
export async function unscheduleQuestion(id: string): Promise<ActionResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const q = await loadQuestion(ctx.service, id)
  if (!q || questionStatus(q) !== 'scheduled') return { error: 'Só dá para tirar a data a uma pergunta que ainda não abriu.' }
  const { error } = await ctx.service.from(QUESTIONS).update({ opens_at: null, closes_at: null }).eq('id', id)
  if (error) return { error: 'Não foi possível tirar a data.' }
  done()
  return {}
}

/** Modo turbo: de 3 em 3 dias e abertas 5 (só conta para as próximas a agendar). */
export async function setTurbo(on: boolean): Promise<ActionResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const rhythm = on ? TURBO_RHYTHM : NORMAL_RHYTHM
  const { error } = await ctx.service.from(SETTINGS).update({ turbo: on, ...rhythm }).eq('id', 1)
  if (error) return { error: 'Não foi possível mudar o ritmo.' }
  done()
  return {}
}

// ── Link de convite ───────────────────────────────────────────

/** Gera um link novo; o antigo deixa de funcionar na hora. */
export async function rotateInviteToken(): Promise<ActionResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const { error } = await ctx.service
    .from(SETTINGS)
    .update({ invite_token: randomToken(), invite_rotated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { error: 'Não foi possível gerar um link novo.' }
  done()
  return {}
}
