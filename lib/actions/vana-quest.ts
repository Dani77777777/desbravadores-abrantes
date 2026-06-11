'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { revalidatePath } from 'next/cache'
import { calcPoints } from '@/utils/vana-quest'

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// ── Admin: VanaQuest management ────────────────────────────────────

export async function createVanaQuest(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado')

  const { data, error } = await supabase.from('vana_quests').insert({
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    created_by: user.id,
  }).select().single()

  if (error) throw new Error(error.message)
  revalidatePath('/admin/vana-quest')
  return data
}

export async function updateVanaQuest(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from('vana_quests').update({
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/vana-quest')
}

export async function deleteVanaQuest(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('vana_quests').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/vana-quest')
}

// ── Admin: Question management ─────────────────────────────────────

export async function addQuestion(vanaQuestId: string, formData: FormData) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('vana_quest_questions')
    .select('question_order')
    .eq('vana_quest_id', vanaQuestId)
    .order('question_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (existing?.question_order ?? -1) + 1

  const { error } = await supabase.from('vana_quest_questions').insert({
    vana_quest_id: vanaQuestId,
    question_text: formData.get('question_text') as string,
    option_a: formData.get('option_a') as string,
    option_b: formData.get('option_b') as string,
    option_c: formData.get('option_c') as string,
    option_d: formData.get('option_d') as string,
    correct_option: formData.get('correct_option') as string,
    explanation: ((formData.get('explanation') as string) || '').trim() || null,
    time_seconds: parseInt(formData.get('time_seconds') as string) || 20,
    points_multiplier: parseInt(formData.get('points_multiplier') as string) || 1,
    question_order: nextOrder,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/vana-quest/${vanaQuestId}`)
}

export async function updateQuestion(questionId: string, vanaQuestId: string, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from('vana_quest_questions').update({
    question_text: formData.get('question_text') as string,
    option_a: formData.get('option_a') as string,
    option_b: formData.get('option_b') as string,
    option_c: formData.get('option_c') as string,
    option_d: formData.get('option_d') as string,
    correct_option: formData.get('correct_option') as string,
    explanation: ((formData.get('explanation') as string) || '').trim() || null,
    time_seconds: parseInt(formData.get('time_seconds') as string) || 20,
    points_multiplier: parseInt(formData.get('points_multiplier') as string) || 1,
  }).eq('id', questionId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/vana-quest/${vanaQuestId}`)
}

export async function deleteQuestion(questionId: string, vanaQuestId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('vana_quest_questions').delete().eq('id', questionId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/vana-quest/${vanaQuestId}`)
}

export async function reorderQuestions(
  vanaQuestId: string,
  orderedIds: string[]
) {
  const supabase = await createClient()
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('vana_quest_questions').update({ question_order: index }).eq('id', id)
    )
  )
  revalidatePath(`/admin/vana-quest/${vanaQuestId}`)
}

// ── Session management ─────────────────────────────────────────────

export async function startSession(vanaQuestId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado')

  // Generate unique PIN
  let pin = generatePin()
  let attempts = 0
  while (attempts < 10) {
    const { data: existing } = await supabase
      .from('vana_quest_sessions')
      .select('id')
      .eq('pin', pin)
      .eq('status', 'waiting')
      .single()
    if (!existing) break
    pin = generatePin()
    attempts++
  }

  const { data, error } = await supabase.from('vana_quest_sessions').insert({
    vana_quest_id: vanaQuestId,
    host_id: user.id,
    pin,
    status: 'waiting',
    current_question_index: -1,
  }).select().single()

  if (error) throw new Error(error.message)
  return data.id
}

export async function joinSession(
  pin: string,
  guestName: string | null,
  userId: string | null,
  clientAvatarUrl?: string | null
): Promise<{ participantId: string; sessionId: string; questTitle: string } | { error: string }> {
  const supabase = createServiceClient()

  const { data: session, error: sessionError } = await supabase
    .from('vana_quest_sessions')
    .select('id, status, vana_quests(title)')
    .eq('pin', pin)
    .in('status', ['waiting'])
    .single()

  if (sessionError || !session) {
    return { error: 'PIN inválido ou sessão não encontrada.' }
  }

  const displayName = guestName || 'Jogador'
  const isGuest = !userId

  // Avatar: prioriza o que o cliente passa (tem acesso a profile.avatar_url + user_metadata.avatar_url),
  // senão tenta buscar do profile (fallback para chamadas server-side antigas)
  let avatarUrl: string | null = clientAvatarUrl ?? null
  if (userId) {
    if (!avatarUrl) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .single()
      avatarUrl = prof?.avatar_url || null
    }

    const { data: existing } = await supabase
      .from('vana_quest_participants')
      .select('id, avatar_url')
      .eq('session_id', session.id)
      .eq('user_id', userId)
      .single()

    if (existing) {
      // Backfill the avatar if missing (covers participants who joined before this fix)
      if (!existing.avatar_url && avatarUrl) {
        await supabase.from('vana_quest_participants').update({ avatar_url: avatarUrl }).eq('id', existing.id)
      }
      return {
        participantId: existing.id,
        sessionId: session.id,
        questTitle: (session.vana_quests as any)?.title || 'VanaQuest',
      }
    }
  }

  const { data: participant, error: pError } = await supabase
    .from('vana_quest_participants')
    .insert({
      session_id: session.id,
      user_id: userId || null,
      guest_name: isGuest ? displayName : null,
      is_guest: isGuest,
      display_name: displayName,
      avatar_url: avatarUrl,
    })
    .select()
    .single()

  if (pError) return { error: 'Erro ao entrar na sessão.' }

  return {
    participantId: participant.id,
    sessionId: session.id,
    questTitle: (session.vana_quests as any)?.title || 'VanaQuest',
  }
}

/**
 * Apaga uma sessão e tudo o que está associado (participants, answers).
 * Só admins. ON DELETE CASCADE trata do resto.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'coordenador' && profile.role !== 'dirigente')) {
    throw new Error('Sem permissões')
  }

  const { error } = await supabase
    .from('vana_quest_sessions')
    .delete()
    .eq('id', sessionId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/vana-quest')
}

/**
 * State machine for the live game flow.
 * waiting → question_intro → question_active → question_results → question_leaderboard → (next intro) | finished
 */
export async function nextStage(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado')

  const { data: session } = await supabase
    .from('vana_quest_sessions')
    .select('id, status, current_question_index, vana_quest_id')
    .eq('id', sessionId)
    .single()

  if (!session) throw new Error('Sessão não encontrada')

  const { data: questions } = await supabase
    .from('vana_quest_questions')
    .select('id')
    .eq('vana_quest_id', session.vana_quest_id)
    .order('question_order')

  const totalQuestions = questions?.length || 0
  const nextIndex = session.current_question_index + 1

  switch (session.status) {
    case 'waiting':
      if (totalQuestions === 0) {
        await supabase.from('vana_quest_sessions').update({
          status: 'finished',
          ended_at: new Date().toISOString(),
        }).eq('id', sessionId)
        return
      }
      // Start with the quest intro screen (shown once before the first question)
      await supabase.from('vana_quest_sessions').update({
        status: 'quest_intro',
      }).eq('id', sessionId)
      return

    case 'quest_intro':
      // After quest intro → first question intro
      await supabase.from('vana_quest_sessions').update({
        status: 'question_intro',
        current_question_index: 0,
        question_started_at: null,
      }).eq('id', sessionId)
      return

    case 'question_leaderboard':
      if (nextIndex >= totalQuestions) {
        await supabase.from('vana_quest_sessions').update({
          status: 'finished',
          ended_at: new Date().toISOString(),
        }).eq('id', sessionId)
        return
      }
      await supabase.from('vana_quest_sessions').update({
        status: 'question_intro',
        current_question_index: nextIndex,
        question_started_at: null,
      }).eq('id', sessionId)
      return

    case 'question_intro':
      await supabase.from('vana_quest_sessions').update({
        status: 'question_active',
        question_started_at: new Date().toISOString(),
      }).eq('id', sessionId)
      return

    case 'question_active': {
      // A pergunta acabou. Recalcula stats verdadeiras (streak/max_streak/correct_answers)
      // a partir do histórico de respostas — fonte única de verdade.
      const allQuestionsOrdered = questions || []
      const upToIndex = session.current_question_index

      const { data: allAnswers } = await supabase
        .from('vana_quest_answers')
        .select('participant_id, question_id, is_correct')
        .eq('session_id', sessionId)

      const { data: allParticipants } = await supabase
        .from('vana_quest_participants')
        .select('id')
        .eq('session_id', sessionId)

      // Para cada participante, percorre as perguntas em ordem até à actual,
      // reconstruindo streak/max/correct.
      const updates = (allParticipants || []).map((p) => {
        const answered = new Map<string, boolean>()
        ;(allAnswers || [])
          .filter((a) => a.participant_id === p.id)
          .forEach((a) => answered.set(a.question_id, a.is_correct))

        let streak = 0
        let max = 0
        let correct = 0
        for (let i = 0; i <= upToIndex; i++) {
          const q = allQuestionsOrdered[i]
          if (!q) continue
          const ans = answered.get(q.id)
          if (ans === true) {
            streak += 1
            correct += 1
            if (streak > max) max = streak
          } else {
            // errada ou sem resposta → quebra streak
            streak = 0
          }
        }
        return { id: p.id, current_streak: streak, max_streak: max, correct_answers: correct }
      })

      await Promise.all(
        updates.map((u) =>
          supabase
            .from('vana_quest_participants')
            .update({
              current_streak: u.current_streak,
              max_streak: u.max_streak,
              correct_answers: u.correct_answers,
            })
            .eq('id', u.id)
        )
      )

      await supabase.from('vana_quest_sessions').update({
        status: 'question_results',
      }).eq('id', sessionId)
      return
    }

    case 'question_results': {
      const isLastQuestion = session.current_question_index >= totalQuestions - 1
      if (isLastQuestion) {
        await supabase.from('vana_quest_sessions').update({
          status: 'finished',
          ended_at: new Date().toISOString(),
        }).eq('id', sessionId)
      } else {
        await supabase.from('vana_quest_sessions').update({
          status: 'question_leaderboard',
        }).eq('id', sessionId)
      }
      return
    }
  }
}

// Keep the old name for backwards compat
export const advanceQuestion = nextStage

export async function submitAnswer(
  participantId: string,
  sessionId: string,
  questionId: string,
  chosenOption: string,
  elapsedMs: number
): Promise<{ ok: boolean; isCorrect?: boolean; finalPoints?: number; error?: string }> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('vana_quest_answers')
    .select('id')
    .eq('participant_id', participantId)
    .eq('question_id', questionId)
    .single()

  if (existing) return { ok: false, error: 'Já respondeste a esta pergunta.' }

  const { data: session } = await supabase
    .from('vana_quest_sessions')
    .select('status')
    .eq('id', sessionId)
    .single()

  if (session?.status !== 'question_active') {
    return { ok: false, error: 'A pergunta já não está activa.' }
  }

  const { data: question } = await supabase
    .from('vana_quest_questions')
    .select('correct_option, time_seconds, points_multiplier')
    .eq('id', questionId)
    .single()

  if (!question) return { ok: false, error: 'Pergunta não encontrada.' }

  const { data: participant } = await supabase
    .from('vana_quest_participants')
    .select('current_streak, total_points, correct_answers, max_streak')
    .eq('id', participantId)
    .single()

  if (!participant) return { ok: false, error: 'Participante não encontrado.' }

  const isCorrect = chosenOption === question.correct_option
  const currentStreak = participant?.current_streak || 0
  const newStreak = isCorrect ? currentStreak + 1 : 0

  const { speedPoints, streakBonus, finalPoints } = isCorrect
    ? calcPoints(question.time_seconds, elapsedMs, question.points_multiplier, newStreak)
    : { speedPoints: 0, streakBonus: 0, finalPoints: 0 }

  await supabase.from('vana_quest_answers').insert({
    session_id: sessionId,
    participant_id: participantId,
    question_id: questionId,
    chosen_option: chosenOption,
    elapsed_ms: elapsedMs,
    is_correct: isCorrect,
    speed_points: speedPoints,
    streak_bonus: streakBonus,
    final_points: finalPoints,
    streak_at_answer: isCorrect ? newStreak : currentStreak,
  })

  const prevCorrect = participant?.correct_answers ?? 0
  const prevMax = participant?.max_streak ?? 0

  await supabase.from('vana_quest_participants').update({
    total_points: (participant?.total_points || 0) + finalPoints,
    correct_answers: isCorrect ? prevCorrect + 1 : prevCorrect,
    current_streak: newStreak,
    max_streak: Math.max(newStreak, prevMax),
  }).eq('id', participantId)

  return { ok: true, isCorrect, finalPoints }
}

export async function setRewardsRecipient(
  participantId: string,
  recipientId: string
): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from('vana_quest_participants')
    .update({ rewards_recipient_id: recipientId })
    .eq('id', participantId)
    .eq('is_guest', true)
}

/**
 * XP/Gold awards são baseados nos pontos totais ganhos no jogo.
 * Arredondamento half-up: 15.5 → 16, 15.4 → 15
 * Gold = round(total_points), XP = gold * 2
 *
 * Protecção: se já foi atribuído antes (points_awarded_at != null), não duplica.
 */
export async function awardSessionPoints(sessionId: string): Promise<{ ok: boolean; alreadyAwarded?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado')

  const service = createServiceClient()

  // Verificar se já foi atribuído
  const { data: sessionCheck } = await service
    .from('vana_quest_sessions')
    .select('points_awarded_at')
    .eq('id', sessionId)
    .single()

  if (sessionCheck?.points_awarded_at) {
    return { ok: false, alreadyAwarded: true, error: 'Os prémios já foram atribuídos a esta sessão.' }
  }

  const { data: participants } = await service
    .from('vana_quest_participants')
    .select('*')
    .eq('session_id', sessionId)

  if (!participants) return { ok: true }

  for (const p of participants) {
    const totalPoints = Number(p.total_points) || 0
    if (totalPoints <= 0) continue

    const targetUserId = p.is_guest ? p.rewards_recipient_id : p.user_id
    if (!targetUserId) continue

    const gold = Math.round(totalPoints) // half-up by default in JS for positives
    const xp = gold * 2

    if (gold > 0 || xp > 0) {
      await service.from('points_log').insert({
        target_user_id: targetUserId,
        awarded_by_user_id: user.id,
        amount_xp: xp,
        amount_gold: gold,
        description: `VanaQuest — ${totalPoints.toFixed(3)} pts${p.is_guest ? ` (doado por ${p.display_name})` : ''}`,
      })
    }
  }

  // Marcar sessão como já atribuída
  await service
    .from('vana_quest_sessions')
    .update({ points_awarded_at: new Date().toISOString() })
    .eq('id', sessionId)

  return { ok: true }
}
