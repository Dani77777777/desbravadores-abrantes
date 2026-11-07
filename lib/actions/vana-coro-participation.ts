'use server'

import { requireCoordinator } from '@/lib/vana-coro/auth'
import { isHiddenFromRanking } from '@/utils/ranking'

// Quem já respondeu à "Pergunta da Semana" (só coordenação). Conta os membros do
// ranking (desbravadores e dirigentes, sem contas de teste nem contas só com email);
// os convidados não têm nome, por isso só entram como número.

const HISTORY_SIZE = 8

export interface ParticipationMember {
  id: string
  name: string
  avatar_url: string | null
  section: string
  is_leader: boolean
}

export interface ParticipationQuestion {
  id: string
  prompt: string
  opens_at: string
  closes_at: string
  /** Ainda está aberta agora? */
  open: boolean
}

export interface WeeklyParticipation {
  /** A pergunta aberta (ou, se não houver, a última que fechou). */
  question: ParticipationQuestion | null
  answered: ParticipationMember[]
  missing: ParticipationMember[]
  guests: number
  totalMembers: number
  /** Últimas perguntas já abertas, a mais recente primeiro: quantos membros responderam. */
  history: { id: string; prompt: string; closes_at: string; open: boolean; members: number }[]
}

export async function getWeeklyParticipation(): Promise<WeeklyParticipation | null> {
  const ctx = await requireCoordinator()
  if (!ctx) return null
  const { service } = ctx
  const now = new Date().toISOString()

  const [profilesRes, questionsRes] = await Promise.all([
    service
      .from('profiles')
      .select('id, full_name, avatar_url, role, section, leadership_section')
      .in('role', ['desbravador', 'dirigente']),
    service
      .from('vanacoro_questions')
      .select('id, prompt, opens_at, closes_at')
      .not('opens_at', 'is', null)
      .lte('opens_at', now)
      .order('opens_at', { ascending: false })
      .limit(HISTORY_SIZE),
  ])
  if (profilesRes.error || questionsRes.error) return null

  const members: ParticipationMember[] = (profilesRes.data ?? [])
    .filter((p) => !isHiddenFromRanking(p.full_name))
    .map((p) => ({
      id: p.id,
      name: p.full_name!.trim(),
      avatar_url: p.avatar_url || null,
      section: (p.role === 'dirigente' ? p.leadership_section ?? p.section : p.section) as string,
      is_leader: p.role === 'dirigente',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
  const memberIds = new Set(members.map((m) => m.id))

  const questions = (questionsRes.data ?? []).map((q) => ({
    ...q,
    opens_at: q.opens_at as string,
    open: !!q.closes_at && q.closes_at > now,
  }))

  // Pessoas distintas por pergunta (membros do ranking e convidados).
  const membersBy = new Map<string, Set<string>>()
  const guestsBy = new Map<string, Set<string>>()
  if (questions.length) {
    const { data: answers, error } = await service
      .from('vanacoro_answers')
      .select('question_id, profile_id, guest_id')
      .in('question_id', questions.map((q) => q.id))
    if (error) return null
    for (const a of answers ?? []) {
      if (a.profile_id && memberIds.has(a.profile_id)) {
        if (!membersBy.has(a.question_id)) membersBy.set(a.question_id, new Set())
        membersBy.get(a.question_id)!.add(a.profile_id)
      } else if (a.guest_id) {
        if (!guestsBy.has(a.question_id)) guestsBy.set(a.question_id, new Set())
        guestsBy.get(a.question_id)!.add(a.guest_id)
      }
    }
  }

  const current = questions.find((q) => q.open) ?? questions[0] ?? null
  const answeredIds = current ? membersBy.get(current.id) ?? new Set<string>() : new Set<string>()

  return {
    question: current
      ? { id: current.id, prompt: current.prompt, opens_at: current.opens_at, closes_at: current.closes_at, open: current.open }
      : null,
    answered: members.filter((m) => answeredIds.has(m.id)),
    missing: members.filter((m) => !answeredIds.has(m.id)),
    guests: current ? guestsBy.get(current.id)?.size ?? 0 : 0,
    totalMembers: members.length,
    history: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      closes_at: q.closes_at,
      open: q.open,
      members: membersBy.get(q.id)?.size ?? 0,
    })),
  }
}
