'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import { isHiddenFromRanking } from '@/utils/ranking'
import { cleanPrize, prizeLabel, type RafflePrize, type RaffleQuestion } from '@/utils/raffle'

// Sorteio entre quem respondeu à Pergunta da Semana. As respostas só se leem com a
// service role, por isso o cargo e a secção são confirmados aqui. Só saem os ids das
// pessoas: o texto das respostas nunca vai para o browser.

const QUESTIONS_SHOWN = 8
const MAX_WINNERS = 50

type Service = ReturnType<typeof createServiceClient>

/** Mesmo âmbito da página do Sorteador: o dirigente (ou ajudante de secção) só vê a sua secção. */
async function requireRaffleHost() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, section, leadership_section, helper_role, helper_section')
    .eq('id', user.id)
    .maybeSingle()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) return null
  const section: string | null = role === 'dirigente' ? effectiveLeadershipSection(profile) || profile.section : null
  return { userId: user.id, section, service: createServiceClient() }
}

type Host = NonNullable<Awaited<ReturnType<typeof requireRaffleHost>>>

/** Quem pode sair: membros do ranking, na secção de quem sorteia, sem a própria pessoa. */
async function eligibleIds({ service, section, userId }: Host): Promise<Set<string> | null> {
  let query = service.from('profiles').select('id, full_name').in('role', ['desbravador', 'dirigente'])
  if (section) query = query.eq('section', section)
  const { data, error } = await query
  if (error) return null
  return new Set((data ?? []).filter((p) => !isHiddenFromRanking(p.full_name) && p.id !== userId).map((p) => p.id as string))
}

async function loadWinners(service: Service, questionIds: string[]) {
  const { data, error } = await service
    .from('question_raffle_prizes')
    .select('question_id, profile_id, prize')
    .in('question_id', questionIds)
  // Sem a migração o sorteio continua a mostrar quem respondeu; só falha ao dar o prémio.
  if (error) console.error('Sorteador: erro a ler os prémios', error)
  return data ?? []
}

export async function getQuestionRaffleData(): Promise<RaffleQuestion[] | null> {
  const host = await requireRaffleHost()
  if (!host) return null
  const { service } = host
  const now = new Date().toISOString()

  const [eligible, questionsRes] = await Promise.all([
    eligibleIds(host),
    service
      .from('vanacoro_questions')
      .select('id, prompt, closes_at')
      .not('opens_at', 'is', null)
      .lte('opens_at', now)
      .order('opens_at', { ascending: false })
      .limit(QUESTIONS_SHOWN),
  ])
  if (!eligible || questionsRes.error) return null

  const questions = questionsRes.data ?? []
  if (questions.length === 0) return []
  const ids = questions.map((q) => q.id as string)

  const [answersRes, prizes] = await Promise.all([
    service.from('vanacoro_answers').select('question_id, profile_id').in('question_id', ids).not('profile_id', 'is', null),
    loadWinners(service, ids),
  ])
  if (answersRes.error) return null

  const respondents = new Map<string, Set<string>>()
  for (const a of answersRes.data ?? []) {
    if (!eligible.has(a.profile_id)) continue
    if (!respondents.has(a.question_id)) respondents.set(a.question_id, new Set())
    respondents.get(a.question_id)!.add(a.profile_id)
  }

  return questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    closes_at: q.closes_at,
    open: !!q.closes_at && q.closes_at > now,
    respondentIds: [...(respondents.get(q.id) ?? [])],
    winners: prizes.filter((p) => p.question_id === q.id && eligible.has(p.profile_id)).map((p) => ({ id: p.profile_id, prize: p.prize })),
  }))
}

/**
 * Regista o prémio e, se for XP e Gold, escreve no points_log. Tranca PRIMEIRO (chave
 * primária em question_raffle_prizes): dois cliques ao mesmo tempo não pagam duas vezes.
 */
export async function awardQuestionPrize(
  questionId: string,
  profileIds: string[],
  rawPrize: RafflePrize,
): Promise<{ awarded: number; already: number } | { error: string }> {
  const host = await requireRaffleHost()
  if (!host) return { error: 'Não tens permissão para dar prémios.' }
  const { service, userId } = host

  const prize = cleanPrize(rawPrize)
  if (!prize) return { error: 'O prémio não é válido.' }
  const ids = [...new Set(profileIds)]
  if (ids.length === 0 || ids.length > MAX_WINNERS) return { error: 'Não há ninguém para receber o prémio.' }

  const [eligible, answersRes] = await Promise.all([
    eligibleIds(host),
    service.from('vanacoro_answers').select('profile_id').eq('question_id', questionId).in('profile_id', ids),
  ])
  if (!eligible || answersRes.error) return { error: 'Não foi possível confirmar quem respondeu.' }
  const answered = new Set((answersRes.data ?? []).map((a) => a.profile_id as string))
  if (!ids.every((id) => eligible.has(id) && answered.has(id))) {
    return { error: 'Só quem respondeu a esta pergunta pode receber o prémio.' }
  }

  const label = prizeLabel(prize)
  const { data: locked, error: lockError } = await service
    .from('question_raffle_prizes')
    .upsert(
      ids.map((id) => ({ question_id: questionId, profile_id: id, prize: label, awarded_by: userId })),
      { onConflict: 'question_id,profile_id', ignoreDuplicates: true },
    )
    .select('profile_id')
  if (lockError) {
    console.error('Sorteador: erro a registar o prémio', lockError)
    return { error: 'Não foi possível registar o prémio.' }
  }

  const awardedIds = (locked ?? []).map((r) => r.profile_id as string)

  if (prize.kind === 'points' && awardedIds.length > 0) {
    const { error } = await service.from('points_log').insert(
      awardedIds.map((id) => ({
        target_user_id: id,
        awarded_by_user_id: userId,
        amount_xp: prize.xp,
        amount_gold: prize.gold,
        description: 'Pergunta da Semana — prémio do sorteio',
      })),
    )
    if (error) {
      console.error('Sorteador: erro a dar os pontos', error)
      await service.from('question_raffle_prizes').delete().eq('question_id', questionId).in('profile_id', awardedIds)
      return { error: 'Não foi possível dar o XP e o Gold.' }
    }
  }

  return { awarded: awardedIds.length, already: ids.length - awardedIds.length }
}
