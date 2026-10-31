'use server'

import { revalidatePath } from 'next/cache'
import { FORBIDDEN, requireCoordinator, type ServiceClient } from '@/lib/vana-coro/auth'
import { isAiEnabled } from '@/lib/vana-coro/ai'
import { buildItems, clusterItems, type ClusteredGroup, type ClusterItem } from '@/lib/vana-coro/cluster'
import { autoGroup, capitalize, isTypoOf, normalizeAnswer } from '@/utils/vana-coro/normalize'
import { checkBoard, type BoardGroupInput } from '@/utils/vana-coro/board'
import { questionStatus } from '@/utils/vana-coro/schedule'
import type {
  VanaCoroBoardEntryRow,
  VanaCoroGroup,
  VanaCoroQuestion,
  VanaCoroReviewAnswer,
  VanaCoroReviewData,
} from '@/types/vana-coro'

// Revisão das respostas de uma pergunta (§6): agrupar sem IA ou com IA, ajustar à
// mão e congelar o quadro. Só coordenação; tudo pela service role.
//
// Regra: qualquer mudança feita à mão num grupo (nome, emoji, esconder, juntar,
// receber uma resposta) passa-o a 'manual'. Voltar a agrupar só substitui os grupos
// 'auto'/'ai', por isso o trabalho da coordenação nunca se perde.

export type ReviewResult = { error?: string; message?: string }

const QUESTIONS = 'vanacoro_questions'
const GROUPS = 'vanacoro_groups'
const ANSWERS = 'vanacoro_answers'

function done(questionId: string) {
  revalidatePath(`/admin/vana-coro/perguntas/${questionId}`)
  revalidatePath('/admin/vana-coro')
}

const LABEL_MAX = 40

function cleanLabel(label: string): string {
  return capitalize(label.replace(/\s+/g, ' ').trim()).slice(0, LABEL_MAX)
}

function cleanEmoji(emoji: string | null | undefined): string | null {
  const e = [...(emoji ?? '').trim()].slice(0, 4).join('')
  return e || null
}

// ── Leitura ───────────────────────────────────────────────────

interface AnswerRow {
  id: string
  raw_text: string
  normalized_text: string
  group_id: string | null
  hidden: boolean
  respondent_key: string
  created_at: string
}

async function loadAnswers(service: ServiceClient, questionId: string): Promise<AnswerRow[]> {
  const { data } = await service
    .from(ANSWERS)
    .select('id, raw_text, normalized_text, group_id, hidden, respondent_key, created_at')
    .eq('question_id', questionId)
    .order('created_at')
  return (data ?? []) as AnswerRow[]
}

async function loadGroups(service: ServiceClient, questionId: string): Promise<VanaCoroGroup[]> {
  const { data } = await service
    .from(GROUPS)
    .select('id, label, emoji, hidden, source')
    .eq('question_id', questionId)
    .order('created_at')
  return (data ?? []) as VanaCoroGroup[]
}

/** null = sem permissão ou pergunta inexistente; 'missing' = migração dos grupos por correr. */
export async function getQuestionReview(questionId: string): Promise<VanaCoroReviewData | null | 'missing'> {
  const ctx = await requireCoordinator()
  if (!ctx) return null
  const { service } = ctx

  const { data: question } = await service
    .from(QUESTIONS)
    .select('id, prompt, allow_guests, opens_at, closes_at, review_status, ready_at, used_at, created_at')
    .eq('id', questionId)
    .maybeSingle()
  if (!question) return null

  const groupsRes = await service.from(GROUPS).select('id').limit(1)
  if (groupsRes.error) return 'missing'

  const [answers, groups, boardRes] = await Promise.all([
    loadAnswers(service, questionId),
    loadGroups(service, questionId),
    service
      .from('vanacoro_board_entries')
      .select('rank, label, emoji, respondents, points')
      .eq('question_id', questionId)
      .order('rank'),
  ])

  // Pseudónimos da página: contam-se pessoas sem mandar ao browser quem respondeu.
  const alias = new Map<string, string>()
  const reviewAnswers: VanaCoroReviewAnswer[] = answers.map((a) => {
    if (!alias.has(a.respondent_key)) alias.set(a.respondent_key, `p${alias.size + 1}`)
    return {
      id: a.id,
      text: a.raw_text,
      group_id: a.group_id,
      hidden: a.hidden,
      person: alias.get(a.respondent_key)!,
      created_at: a.created_at,
    }
  })

  return {
    question: question as VanaCoroQuestion,
    groups,
    answers: reviewAnswers,
    board: (boardRes.data ?? []) as VanaCoroBoardEntryRow[],
    aiEnabled: isAiEnabled(),
  }
}

// ── Agrupar ───────────────────────────────────────────────────

interface ApplyGroup {
  label: string
  emoji: string | null
  hidden: boolean
  source: 'auto' | 'ai'
  existing_group_id: string | null
  answer_ids: string[]
}

async function applyGroups(service: ServiceClient, questionId: string, groups: ApplyGroup[], replace: boolean) {
  const { data, error } = await service.rpc('vanacoro_apply_groups', {
    p_question_id: questionId,
    p_groups: groups,
    p_replace: replace,
  })
  if (error) {
    console.error('VanaCoro: erro a gravar grupos', error)
    return { error: 'Não foi possível gravar os grupos.' }
  }
  return { created: (data as number) ?? 0 }
}

/** Respostas que um agrupamento automático pode mexer: não escondidas e fora de grupos manuais. */
function groupable(answers: AnswerRow[], groups: VanaCoroGroup[], onlyUngrouped: boolean) {
  const manual = new Set(groups.filter((g) => g.source === 'manual').map((g) => g.id))
  return answers.filter(
    (a) => !a.hidden && (onlyUngrouped ? !a.group_id : !a.group_id || !manual.has(a.group_id)),
  )
}

const toGroupable = (a: AnswerRow) => ({ id: a.id, text: a.raw_text, normalized: a.normalized_text })

function fromClustered(groups: ClusteredGroup[], items: ClusterItem[]): ApplyGroup[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  return groups.map((g) => ({
    label: cleanLabel(g.label) || '?',
    emoji: cleanEmoji(g.emoji),
    hidden: g.inappropriate,
    source: 'ai',
    existing_group_id: g.existingGroupId ?? null,
    answer_ids: g.itemIds.flatMap((id) => byId.get(id)?.answerIds ?? []),
  }))
}

/** Camada 1 (sem IA): junta iguais e erros de escrita. Substitui os grupos auto/IA. */
export async function autoGroupQuestion(questionId: string): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  const [answers, groups] = await Promise.all([loadAnswers(ctx.service, questionId), loadGroups(ctx.service, questionId)])

  const auto = autoGroup(groupable(answers, groups, false).map(toGroupable))
  const result = await applyGroups(
    ctx.service,
    questionId,
    auto.map((g) => ({ label: g.label, emoji: null, hidden: false, source: 'auto', existing_group_id: null, answer_ids: g.answerIds })),
    true,
  )
  if ('error' in result) return result
  done(questionId)
  return { message: `${result.created} grupos criados.` }
}

/** Camadas 1 + 2: normalização e depois IA. Substitui os grupos auto/IA. */
export async function clusterQuestion(questionId: string): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  if (!isAiEnabled()) return { error: 'A IA não está configurada (falta VANACORO_AI_API_KEY).' }

  const [{ data: question }, answers, groups] = await Promise.all([
    ctx.service.from(QUESTIONS).select('prompt').eq('id', questionId).maybeSingle(),
    loadAnswers(ctx.service, questionId),
    loadGroups(ctx.service, questionId),
  ])
  if (!question) return { error: 'Pergunta não encontrada.' }

  const items = buildItems(groupable(answers, groups, false).map(toGroupable))
  if (items.length === 0) return { error: 'Não há respostas para agrupar.' }

  let clustered: ClusteredGroup[]
  try {
    clustered = await clusterItems(question.prompt, items)
  } catch (e) {
    console.error('VanaCoro: erro da IA', e)
    return { error: e instanceof Error && e.message.startsWith('A IA') ? e.message : 'A IA falhou. Os grupos ficaram como estavam.' }
  }

  const result = await applyGroups(ctx.service, questionId, fromClustered(clustered, items), true)
  if ('error' in result) return result
  done(questionId)
  return { message: `A IA fez ${result.created} grupos. Revê-os antes de marcar como pronta.` }
}

/**
 * Respostas que chegaram depois de agrupar (sem grupo): põe cada uma num grupo que
 * já existe ou num novo. Com IA usa a IA; sem IA, só junta erros de escrita.
 */
export async function clusterNewAnswers(questionId: string): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const [{ data: question }, answers, groups] = await Promise.all([
    ctx.service.from(QUESTIONS).select('prompt').eq('id', questionId).maybeSingle(),
    loadAnswers(ctx.service, questionId),
    loadGroups(ctx.service, questionId),
  ])
  if (!question) return { error: 'Pergunta não encontrada.' }

  const fresh = groupable(answers, groups, true)
  if (fresh.length === 0) return { message: 'Não há respostas novas sem grupo.' }
  const items = buildItems(fresh.map(toGroupable))

  let payload: ApplyGroup[]
  if (isAiEnabled()) {
    const existing = groups.map((g, i) => ({ alias: `g${i + 1}`, id: g.id, label: g.label }))
    try {
      payload = fromClustered(await clusterItems(question.prompt, items, existing), items)
    } catch (e) {
      console.error('VanaCoro: erro da IA', e)
      return { error: 'A IA falhou. As respostas novas ficaram sem grupo.' }
    }
  } else {
    // Sem IA: um item novo entra num grupo que já tenha uma resposta igual (ou com um erro de escrita).
    const keysByGroup = new Map<string, string[]>()
    for (const a of answers) {
      if (a.group_id) keysByGroup.set(a.group_id, [...(keysByGroup.get(a.group_id) ?? []), a.normalized_text])
    }
    for (const g of groups) keysByGroup.set(g.id, [...(keysByGroup.get(g.id) ?? []), normalizeAnswer(g.label)])
    payload = items.map((item) => {
      const key = normalizeAnswer(item.text)
      const match = [...keysByGroup].find(([, keys]) => keys.some((k) => isTypoOf(k, key)))
      return {
        label: item.text,
        emoji: null,
        hidden: false,
        source: 'auto',
        existing_group_id: match?.[0] ?? null,
        answer_ids: item.answerIds,
      }
    })
  }

  const result = await applyGroups(ctx.service, questionId, payload, false)
  if ('error' in result) return result
  done(questionId)
  return { message: `${fresh.length} respostas novas arrumadas (${result.created} grupos novos).` }
}

// ── Ajustes à mão ─────────────────────────────────────────────

async function groupOf(service: ServiceClient, groupId: string) {
  const { data } = await service.from(GROUPS).select('id, question_id').eq('id', groupId).maybeSingle()
  return data
}

async function answerOf(service: ServiceClient, answerId: string) {
  const { data } = await service.from(ANSWERS).select('id, question_id, raw_text, group_id').eq('id', answerId).maybeSingle()
  return data
}

/** Apaga um grupo que ficou sem respostas. */
async function dropIfEmpty(service: ServiceClient, groupId: string | null) {
  if (!groupId) return
  const { count } = await service.from(ANSWERS).select('id', { count: 'exact', head: true }).eq('group_id', groupId)
  if (count === 0) await service.from(GROUPS).delete().eq('id', groupId)
}

/** Junta 2+ grupos no primeiro da lista; o grupo final fica 'manual'. */
export async function mergeGroups(questionId: string, groupIds: string[]): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  const ids = [...new Set(groupIds)]
  if (ids.length < 2) return { error: 'Escolhe pelo menos 2 grupos.' }

  const { data: found } = await ctx.service.from(GROUPS).select('id').eq('question_id', questionId).in('id', ids)
  if ((found ?? []).length !== ids.length) return { error: 'Grupos não encontrados.' }

  const [target, ...others] = ids
  const moved = await ctx.service.from(ANSWERS).update({ group_id: target }).in('group_id', others)
  if (moved.error) return { error: 'Não foi possível juntar.' }
  await ctx.service.from(GROUPS).delete().in('id', others)
  await ctx.service.from(GROUPS).update({ source: 'manual' }).eq('id', target)
  done(questionId)
  return {}
}

export async function renameGroup(groupId: string, label: string, emoji: string | null): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  const group = await groupOf(ctx.service, groupId)
  if (!group) return { error: 'Grupo não encontrado.' }
  const clean = cleanLabel(label)
  if (!clean) return { error: 'O nome não pode ficar vazio.' }

  const { error } = await ctx.service
    .from(GROUPS)
    .update({ label: clean, emoji: cleanEmoji(emoji), source: 'manual' })
    .eq('id', groupId)
  if (error) return { error: 'Não foi possível guardar.' }
  done(group.question_id)
  return {}
}

/** Esconder um grupo inteiro (impróprio ou lixo): não conta para o quadro. */
export async function setGroupHidden(groupId: string, hidden: boolean): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  const group = await groupOf(ctx.service, groupId)
  if (!group) return { error: 'Grupo não encontrado.' }
  const { error } = await ctx.service.from(GROUPS).update({ hidden, source: 'manual' }).eq('id', groupId)
  if (error) return { error: 'Não foi possível guardar.' }
  done(group.question_id)
  return {}
}

/** Muda uma resposta para outro grupo, ou para um grupo novo só dela (`'new'`). */
export async function moveAnswer(answerId: string, target: string): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  const answer = await answerOf(ctx.service, answerId)
  if (!answer) return { error: 'Resposta não encontrada.' }

  let targetId = target
  if (target === 'new') {
    const { data, error } = await ctx.service
      .from(GROUPS)
      .insert({ question_id: answer.question_id, label: cleanLabel(answer.raw_text) || '?', source: 'manual' })
      .select('id')
      .single()
    if (error || !data) return { error: 'Não foi possível criar o grupo.' }
    targetId = data.id
  } else {
    const group = await groupOf(ctx.service, target)
    if (!group || group.question_id !== answer.question_id) return { error: 'Grupo não encontrado.' }
    await ctx.service.from(GROUPS).update({ source: 'manual' }).eq('id', target)
  }

  const { error } = await ctx.service.from(ANSWERS).update({ group_id: targetId }).eq('id', answerId)
  if (error) return { error: 'Não foi possível mudar a resposta.' }
  await dropIfEmpty(ctx.service, answer.group_id)
  done(answer.question_id)
  return {}
}

/** Esconder uma resposta (imprópria ou lixo): deixa de contar, mas não se apaga. */
export async function setAnswerHidden(answerId: string, hidden: boolean): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  const answer = await answerOf(ctx.service, answerId)
  if (!answer) return { error: 'Resposta não encontrada.' }
  const { error } = await ctx.service.from(ANSWERS).update({ hidden }).eq('id', answerId)
  if (error) return { error: 'Não foi possível guardar.' }
  done(answer.question_id)
  return {}
}

export async function deleteAnswerAsAdmin(answerId: string): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  const answer = await answerOf(ctx.service, answerId)
  if (!answer) return { error: 'Resposta não encontrada.' }
  const { error } = await ctx.service.from(ANSWERS).delete().eq('id', answerId)
  if (error) return { error: 'Não foi possível apagar.' }
  await dropIfEmpty(ctx.service, answer.group_id)
  done(answer.question_id)
  return {}
}

// ── Quadro ────────────────────────────────────────────────────

/** Congela o quadro (§3.1). O servidor recalcula tudo a partir da BD. */
export async function markReady(questionId: string): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN

  const { data: question } = await ctx.service
    .from(QUESTIONS)
    .select('id, opens_at, closes_at, review_status, used_at')
    .eq('id', questionId)
    .maybeSingle()
  if (!question) return { error: 'Pergunta não encontrada.' }
  const status = questionStatus(question)
  if (status === 'played') return { error: 'Esta pergunta já foi jogada.' }
  if (status !== 'review' && status !== 'ready') return { error: 'Só depois de a pergunta fechar.' }

  const [answers, groups] = await Promise.all([loadAnswers(ctx.service, questionId), loadGroups(ctx.service, questionId)])
  const visible = answers.filter((a) => !a.hidden)
  const input: BoardGroupInput[] = groups.map((g) => ({
    id: g.id,
    label: g.label,
    emoji: g.emoji,
    hidden: g.hidden,
    respondentKeys: visible.filter((a) => a.group_id === g.id).map((a) => a.respondent_key),
  }))
  const { entries, problems } = checkBoard(input, new Set(visible.map((a) => a.respondent_key)).size)
  if (problems.length) return { error: problems.join(' ') }

  const { error } = await ctx.service.rpc('vanacoro_freeze_board', {
    p_question_id: questionId,
    p_entries: entries.map(({ rank, label, emoji, respondents, points }) => ({ rank, label, emoji, respondents, points })),
  })
  if (error) return { error: 'Não foi possível congelar o quadro.' }
  done(questionId)
  return { message: 'Pronta! O quadro ficou congelado.' }
}

export async function unfreezeBoard(questionId: string): Promise<ReviewResult> {
  const ctx = await requireCoordinator()
  if (!ctx) return FORBIDDEN
  const { error } = await ctx.service.rpc('vanacoro_unfreeze_board', { p_question_id: questionId })
  if (error) {
    return { error: error.message.includes('already_played') ? 'Esta pergunta já foi jogada.' : 'Não foi possível descongelar.' }
  }
  done(questionId)
  return {}
}
