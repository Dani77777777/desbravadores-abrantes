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
  userId: string | null
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

  if (userId) {
    const { data: existing } = await supabase
      .from('vana_quest_participants')
      .select('id')
      .eq('session_id', session.id)
      .eq('user_id', userId)
      .single()

    if (existing) {
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

export async function advanceQuestion(sessionId: string) {
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

  if (session.status === 'waiting' || session.status === 'question_results') {
    if (nextIndex >= totalQuestions) {
      await supabase.from('vana_quest_sessions').update({
        status: 'finished',
        ended_at: new Date().toISOString(),
      }).eq('id', sessionId)
      return
    }

    await supabase.from('vana_quest_sessions').update({
      status: 'question_active',
      current_question_index: nextIndex,
      question_started_at: new Date().toISOString(),
    }).eq('id', sessionId)
    return
  }

  if (session.status === 'question_active') {
    await supabase.from('vana_quest_sessions').update({
      status: 'question_results',
    }).eq('id', sessionId)
  }
}

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

export async function awardSessionPoints(sessionId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado')

  const service = createServiceClient()

  const { data: participants } = await service
    .from('vana_quest_participants')
    .select('*, vana_quest_answers!vana_quest_answers_participant_id_fkey(*)')
    .eq('session_id', sessionId)

  if (!participants) return

  for (const p of participants) {
    const answers = (p.vana_quest_answers || []) as any[]
    const correctCount = answers.filter((a: any) => a.is_correct).length
    if (correctCount === 0) continue

    const targetUserId = p.is_guest ? p.rewards_recipient_id : p.user_id
    if (!targetUserId) continue

    const { data: questAnswers } = await service
      .from('vana_quest_answers')
      .select('is_correct, vana_quest_questions(points_multiplier)')
      .eq('participant_id', p.id)

    let totalGold = 0
    let totalXp = 0
    for (const a of questAnswers || []) {
      if (a.is_correct) {
        const mult = (a.vana_quest_questions as any)?.points_multiplier || 1
        totalGold += 10 * mult
        totalXp += 20 * mult
      }
    }

    if (totalGold > 0 || totalXp > 0) {
      await service.from('points_log').insert({
        target_user_id: targetUserId,
        awarded_by_user_id: user.id,
        amount_xp: totalXp,
        amount_gold: totalGold,
        description: `VanaQuest — ${correctCount} resposta${correctCount !== 1 ? 's' : ''} correcta${correctCount !== 1 ? 's' : ''}${p.is_guest ? ` (doado por ${p.display_name})` : ''}`,
      })
    }
  }

  await service
    .from('vana_quest_sessions')
    .update({ status: 'finished' })
    .eq('id', sessionId)
}
