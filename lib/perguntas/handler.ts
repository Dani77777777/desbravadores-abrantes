// Responder à "Pergunta da Semana" — lógica da rota /api/perguntas/resposta,
// separada do Next/Supabase para poder ser testada com dependências falsas
// (handler.test.ts).
//
// Quem responde:
//   • membro com sessão → profile_id da sessão (nunca do body); a 1.ª resposta a
//     cada pergunta dá +5 XP (a BD decide se já recebeu);
//   • convidado → link de convite do clube (token) + id anónimo do browser. Sem prémios.
//
// Nunca se devolve nada das respostas dos outros: só as da própria pessoa.

import { z } from 'zod'
import { checkAnswer, MAX_ANSWERS_PER_QUESTION } from '@/utils/vana-coro/normalize'
import { isQuestionOpen } from '@/utils/vana-coro/schedule'

/** Limites de pedidos (contam as respostas gravadas no último minuto). */
export const RATE_WINDOW_MS = 60_000
export const MAX_PER_RESPONDENT_PER_WINDOW = 10
export const MAX_PER_IP_PER_WINDOW = 30

const IdentitySchema = z.object({
  guest_id: z.string().uuid().optional(),
  token: z.string().min(1).max(40).optional(),
})

const PostSchema = IdentitySchema.extend({
  question_id: z.string().uuid(),
  text: z.string().max(200),
})

const DeleteSchema = IdentitySchema.extend({
  answer_id: z.string().uuid(),
})

export type Respondent = { kind: 'member'; profileId: string } | { kind: 'guest'; guestId: string }

export interface QuestionRow {
  id: string
  opens_at: string | null
  closes_at: string | null
  allow_guests: boolean
}

export interface MyAnswer {
  id: string
  raw_text: string
  normalized_text: string
}

export interface AnswerRow {
  question_id: string
  profile_id: string | null
  guest_id: string | null
  ip_hash: string | null
  raw_text: string
  normalized_text: string
}

export type InsertError = 'duplicate' | 'limit' | 'other'

export interface IdentityDeps {
  /** id do utilizador com sessão iniciada, ou null. */
  getUserId(): Promise<string | null>
  /** Tem perfil do clube? */
  isMember(userId: string): Promise<boolean>
  /** Token do link de convite em vigor (null se a tabela não existir). */
  getInviteToken(): Promise<string | null>
}

export interface AnswerDeps extends IdentityDeps {
  getQuestion(id: string): Promise<QuestionRow | null>
  listMyAnswers(questionId: string, respondent: Respondent): Promise<MyAnswer[]>
  countRecent(respondent: Respondent, since: Date): Promise<number>
  countRecentByIp(ipHash: string, since: Date): Promise<number>
  /** sha256(ip + sal) deste pedido, ou null se não se souber o IP. */
  ipHash: string | null
  insert(row: AnswerRow): Promise<{ id: string | null; error: InsertError | null }>
  /** +5 XP da 1.ª resposta (só membros, com a sessão do próprio). */
  award(questionId: string): Promise<{ awarded: boolean; xp?: number } | null>
  getAnswer(id: string): Promise<{ id: string; question_id: string; profile_id: string | null; guest_id: string | null } | null>
  deleteAnswer(id: string): Promise<boolean>
  now?(): Date
}

export type HandlerResponse = { status: number; body: Record<string, unknown> }

const NO_LINK = 'Este link já não funciona. Pede o link novo a alguém do clube.'

/** Quem está a pedir: o membro da sessão, ou um convidado com o link certo. */
export async function resolveRespondent(
  input: { guest_id?: string; token?: string },
  deps: IdentityDeps,
): Promise<{ respondent: Respondent } | { error: HandlerResponse }> {
  const userId = await deps.getUserId()
  if (userId) {
    if (!(await deps.isMember(userId))) return { error: { status: 403, body: { error: 'Conta sem perfil do clube.' } } }
    return { respondent: { kind: 'member', profileId: userId } }
  }
  if (!input.token || !input.guest_id) {
    return { error: { status: 401, body: { error: 'Inicia sessão ou usa o link do clube.' } } }
  }
  const token = await deps.getInviteToken()
  if (!token || token !== input.token) return { error: { status: 403, body: { error: NO_LINK } } }
  return { respondent: { kind: 'guest', guestId: input.guest_id } }
}

/** A pergunta existe, está aberta e esta pessoa pode responder-lhe? */
function questionError(q: QuestionRow | null, respondent: Respondent, now: Date): HandlerResponse | null {
  if (!q || (respondent.kind === 'guest' && !q.allow_guests)) {
    return { status: 404, body: { error: 'Esta pergunta não existe.' } }
  }
  if (!isQuestionOpen(q, now)) return { status: 409, body: { error: 'Esta pergunta já fechou.' } }
  return null
}

export async function handleAnswerPost(rawBody: unknown, deps: AnswerDeps): Promise<HandlerResponse> {
  const parsed = PostSchema.safeParse(rawBody)
  if (!parsed.success) return { status: 400, body: { error: 'Pedido inválido.' } }
  const p = parsed.data
  const now = deps.now?.() ?? new Date()

  // 1. Quem responde
  const who = await resolveRespondent(p, deps)
  if ('error' in who) return who.error
  const { respondent } = who

  // 2. A pergunta
  const qError = questionError(await deps.getQuestion(p.question_id), respondent, now)
  if (qError) return qError

  // 3. A resposta
  const check = checkAnswer(p.text)
  if (!check.ok) return { status: 400, body: { error: check.error } }

  const mine = await deps.listMyAnswers(p.question_id, respondent)
  if (mine.length >= MAX_ANSWERS_PER_QUESTION) {
    return { status: 409, body: { error: `Já deste as ${MAX_ANSWERS_PER_QUESTION} respostas a esta pergunta. Obrigado!` } }
  }
  if (mine.some((a) => a.normalized_text === check.normalized)) {
    return { status: 409, body: { error: 'Já tinhas dado essa resposta. Experimenta outra!' } }
  }

  // 4. Limite de pedidos
  const since = new Date(now.getTime() - RATE_WINDOW_MS)
  if ((await deps.countRecent(respondent, since)) >= MAX_PER_RESPONDENT_PER_WINDOW) {
    return { status: 429, body: { error: 'Estás a responder muito depressa. Espera um minuto.' } }
  }
  if (deps.ipHash && (await deps.countRecentByIp(deps.ipHash, since)) >= MAX_PER_IP_PER_WINDOW) {
    return { status: 429, body: { error: 'Há muitas respostas a sair daqui. Espera um minuto.' } }
  }

  // 5. Gravar
  const { id, error } = await deps.insert({
    question_id: p.question_id,
    profile_id: respondent.kind === 'member' ? respondent.profileId : null,
    guest_id: respondent.kind === 'guest' ? respondent.guestId : null,
    ip_hash: deps.ipHash,
    raw_text: check.text,
    normalized_text: check.normalized,
  })
  if (error === 'duplicate') return { status: 409, body: { error: 'Já tinhas dado essa resposta. Experimenta outra!' } }
  if (error === 'limit') {
    return { status: 409, body: { error: `Já deste as ${MAX_ANSWERS_PER_QUESTION} respostas a esta pergunta. Obrigado!` } }
  }
  if (error || !id) return { status: 500, body: { error: 'Não foi possível guardar a resposta. Tenta outra vez.' } }

  // 6. Prémio da 1.ª resposta (se falhar, a resposta fica gravada na mesma)
  const reward =
    respondent.kind === 'member' && mine.length === 0 ? await deps.award(p.question_id).catch(() => null) : null

  return {
    status: 201,
    body: { ok: true, answer: { id, text: check.text }, reward: reward?.awarded ? { xp: reward.xp ?? 0 } : null },
  }
}

export async function handleAnswerDelete(rawBody: unknown, deps: AnswerDeps): Promise<HandlerResponse> {
  const parsed = DeleteSchema.safeParse(rawBody)
  if (!parsed.success) return { status: 400, body: { error: 'Pedido inválido.' } }
  const p = parsed.data
  const now = deps.now?.() ?? new Date()

  const who = await resolveRespondent(p, deps)
  if ('error' in who) return who.error
  const { respondent } = who

  const answer = await deps.getAnswer(p.answer_id)
  const owns =
    !!answer &&
    (respondent.kind === 'member' ? answer.profile_id === respondent.profileId : answer.guest_id === respondent.guestId)
  if (!answer || !owns) return { status: 404, body: { error: 'Resposta não encontrada.' } }

  const qError = questionError(await deps.getQuestion(answer.question_id), respondent, now)
  if (qError) return qError

  // Os +5 XP ficam: apagar serve para corrigir um erro, não para repetir o prémio.
  if (!(await deps.deleteAnswer(answer.id))) {
    return { status: 500, body: { error: 'Não foi possível apagar a resposta.' } }
  }
  return { status: 200, body: { ok: true } }
}
