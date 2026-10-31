// Acesso à BD da "Pergunta da Semana". Só no servidor: as tabelas não têm
// políticas de leitura, por isso tudo passa pela service role depois de saber
// quem está a pedir (ver handler.ts).

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/utils/supabase/service'
import type { AnswerDeps, IdentityDeps, InsertError, Respondent } from './handler'
import type { PublicQuestion } from './types'

const QUESTIONS = 'vanacoro_questions'
const ANSWERS = 'vanacoro_answers'
const SETTINGS = 'vanacoro_settings'

/** Coluna e valor que identificam as respostas desta pessoa. */
function ownerFilter(r: Respondent): [string, string] {
  return r.kind === 'member' ? ['profile_id', r.profileId] : ['guest_id', r.guestId]
}

export async function getInviteToken(): Promise<string | null> {
  const { data } = await createServiceClient().from(SETTINGS).select('invite_token').eq('id', 1).maybeSingle()
  return data?.invite_token ?? null
}

/** O token do URL é o link de convite em vigor? */
export async function isValidInviteToken(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9]{4,40}$/.test(token)) return false
  return (await getInviteToken()) === token
}

/**
 * Perguntas abertas agora (a mais recente primeiro), com as respostas da própria
 * pessoa. `respondent` null → convidado que ainda não se identificou (sem respostas).
 */
export async function loadOpenQuestions(
  respondent: Respondent | null,
  opts: { guest: boolean },
): Promise<PublicQuestion[]> {
  const service = createServiceClient()
  const now = new Date().toISOString()
  let query = service
    .from(QUESTIONS)
    .select('id, prompt, closes_at')
    .lte('opens_at', now)
    .gt('closes_at', now)
    .order('opens_at', { ascending: false })
    .limit(10)
  if (opts.guest) query = query.eq('allow_guests', true)
  const { data: questions, error } = await query
  if (error || !questions?.length) return []

  const answersByQuestion = new Map<string, { id: string; text: string }[]>()
  if (respondent) {
    const { data: answers } = await service
      .from(ANSWERS)
      .select('id, question_id, raw_text')
      .in('question_id', questions.map((q) => q.id))
      .eq(...ownerFilter(respondent))
      .order('created_at')
    for (const a of answers ?? []) {
      const list = answersByQuestion.get(a.question_id) ?? []
      list.push({ id: a.id, text: a.raw_text })
      answersByQuestion.set(a.question_id, list)
    }
  }

  return questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    closes_at: q.closes_at,
    answers: answersByQuestion.get(q.id) ?? [],
  }))
}

/** Para o cartão do Painel: a pergunta aberta mais recente e quantas respostas o membro já deu. */
export async function latestOpenQuestionFor(profileId: string): Promise<PublicQuestion | null> {
  try {
    const [latest] = await loadOpenQuestions({ kind: 'member', profileId }, { guest: false })
    return latest ?? null
  } catch {
    return null // tabelas por criar (migração por correr)
  }
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const salt = process.env.PERGUNTAS_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex')
}

/** IP do pedido (na Vercel vem no x-forwarded-for). */
export function requestIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip') || null
}

export function identityDeps(supabase: SupabaseClient): IdentityDeps {
  return {
    async getUserId() {
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id ?? null
    },
    async isMember(userId) {
      const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
      return !!data
    },
    getInviteToken,
  }
}

/** Dependências reais do handler: `supabase` é o cliente com a sessão do pedido. */
export function answerDeps(supabase: SupabaseClient, headers: Headers): AnswerDeps {
  const service = createServiceClient()
  return {
    ...identityDeps(supabase),
    async getQuestion(id) {
      const { data } = await service.from(QUESTIONS).select('id, opens_at, closes_at, allow_guests').eq('id', id).maybeSingle()
      return data
    },
    async listMyAnswers(questionId, respondent) {
      const { data } = await service
        .from(ANSWERS)
        .select('id, raw_text, normalized_text')
        .eq('question_id', questionId)
        .eq(...ownerFilter(respondent))
      return data ?? []
    },
    async countRecent(respondent, since) {
      const key = respondent.kind === 'member' ? respondent.profileId : respondent.guestId
      const { count } = await service
        .from(ANSWERS)
        .select('id', { count: 'exact', head: true })
        .eq('respondent_key', key)
        .gte('created_at', since.toISOString())
      return count ?? 0
    },
    async countRecentByIp(ipHash, since) {
      const { count } = await service
        .from(ANSWERS)
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', since.toISOString())
      return count ?? 0
    },
    ipHash: hashIp(requestIp(headers)),
    async insert(row) {
      const { data, error } = await service.from(ANSWERS).insert(row).select('id').single()
      if (!error) return { id: data.id, error: null }
      const kind: InsertError =
        error.code === '23505' ? 'duplicate' : error.message?.includes('max_answers') ? 'limit' : 'other'
      if (kind === 'other') console.error('Pergunta da Semana: erro a gravar resposta', error)
      return { id: null, error: kind }
    },
    async award(questionId) {
      const { data, error } = await supabase.rpc('award_question_answer_reward', { p_question_id: questionId })
      if (error) {
        console.error('Pergunta da Semana: erro no prémio', error)
        return null
      }
      return data as { awarded: boolean; xp?: number }
    },
    async getAnswer(id) {
      const { data } = await service.from(ANSWERS).select('id, question_id, profile_id, guest_id').eq('id', id).maybeSingle()
      return data
    },
    async deleteAnswer(id) {
      const { error } = await service.from(ANSWERS).delete().eq('id', id)
      if (error) console.error('Pergunta da Semana: erro a apagar resposta', error)
      return !error
    },
  }
}
