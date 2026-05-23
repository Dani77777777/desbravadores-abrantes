'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { submitAnswer, setRewardsRecipient } from '@/lib/actions/vana-quest'
import { CheckCircle2, XCircle, Trophy, Zap, Flame } from 'lucide-react'

const OPTION_COLORS = [
  'bg-red-500 active:bg-red-600',
  'bg-blue-500 active:bg-blue-600',
  'bg-yellow-400 active:bg-yellow-500',
  'bg-green-500 active:bg-green-600',
]
const OPTION_LABELS = ['▲ A', '● B', '◆ C', '■ D']

interface QuestionData {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  time_seconds: number
  points_multiplier: number
  question_order: number
}

interface Session {
  id: string
  status: string
  current_question_index: number
  question_started_at: string | null
  vana_quests: { title: string } | null
}

interface Props {
  sessionId: string
  userId: string | null
  userProfile: any
  initialSession: Session
  questions: QuestionData[]
  allMembers: { id: string; full_name: string; section: string }[]
}

interface AnswerResult {
  isCorrect: boolean
  finalPoints: number
  chosen: string
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos', ticoes: 'Tições', exploradores: 'Exploradores',
  companheiros: 'Companheiros', embaixadores: 'Embaixadores',
}

export function PlayerScreen({ sessionId, userId, userProfile, initialSession, questions, allMembers }: Props) {
  const supabase = createClient()
  const [session, setSession] = useState<Session>(initialSession)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [totalPoints, setTotalPoints] = useState(0)
  const [streak, setStreak] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)

  // Guest donation state
  const [donationSearch, setDonationSearch] = useState('')
  const [donating, setDonating] = useState(false)
  const [donationSuccess, setDonationSuccess] = useState(false)
  const [donationSkipped, setDonationSkipped] = useState(false)

  const isGuest = !userId
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const questionKey = useRef<string>('')

  const currentQuestion = session.current_question_index >= 0
    ? questions[session.current_question_index]
    : null

  const questTitle = (initialSession.vana_quests as any)?.title || 'VanaQuest'

  // Retrieve participantId from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`vana_participant_${sessionId}`)
    setParticipantId(stored)
  }, [sessionId])

  // Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`player-session-${sessionId}-${userId || 'guest'}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vana_quest_sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        const newSession = payload.new as Session
        setSession(newSession)
        // Reset answer state for new questions
        if (newSession.status === 'question_active') {
          const newQKey = `${newSession.current_question_index}`
          if (questionKey.current !== newQKey) {
            questionKey.current = newQKey
            setAnswerResult(null)
            setSubmitting(false)
            startTimeRef.current = newSession.question_started_at
              ? new Date(newSession.question_started_at).getTime()
              : Date.now()
          }
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, userId])

  // Sync startTime when question activates
  useEffect(() => {
    if (session.status === 'question_active' && session.question_started_at) {
      startTimeRef.current = new Date(session.question_started_at).getTime()
      questionKey.current = `${session.current_question_index}`
    }
  }, [session.status, session.question_started_at])

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (session.status === 'question_active' && currentQuestion && session.question_started_at) {
      const endTime = new Date(session.question_started_at).getTime() + currentQuestion.time_seconds * 1000
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, (endTime - Date.now()) / 1000)
        setTimeLeft(remaining)
        if (remaining === 0 && timerRef.current) clearInterval(timerRef.current)
      }, 50)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [session.status, session.question_started_at, currentQuestion?.id])

  async function handleAnswer(optionLetter: string) {
    if (!participantId || !currentQuestion || submitting || answerResult) return
    setSubmitting(true)

    const elapsedMs = Math.max(0, Date.now() - startTimeRef.current)

    const result = await submitAnswer(
      participantId,
      sessionId,
      currentQuestion.id,
      optionLetter,
      elapsedMs
    )

    if (result.ok) {
      setAnswerResult({
        isCorrect: result.isCorrect!,
        finalPoints: result.finalPoints!,
        chosen: optionLetter,
      })
      setTotalPoints((prev) => prev + (result.finalPoints || 0))
      if (result.isCorrect) {
        setStreak((s) => s + 1)
        setCorrectCount((c) => c + 1)
      } else {
        setStreak(0)
      }
    }
    setSubmitting(false)
  }

  async function handleDonate(recipientId: string) {
    if (!participantId) return
    setDonating(true)
    await setRewardsRecipient(participantId, recipientId)
    setDonating(false)
    setDonationSuccess(true)
  }

  const options = currentQuestion
    ? [currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d]
    : []

  const filteredMembers = allMembers.filter((m) =>
    m.full_name.toLowerCase().includes(donationSearch.toLowerCase())
  )

  // ── WAITING ────────────────────────────────────────────────────
  if (session.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-900 flex flex-col items-center justify-center p-6 gap-6 text-center">
        <img src="/images/VanaQuest.png" alt="VanaQuest" className="w-20 h-20 object-contain animate-bounce" />
        <h1 className="text-3xl font-black text-white">{questTitle}</h1>
        <div className="bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20">
          <div className="w-12 h-12 rounded-full bg-purple-300/30 flex items-center justify-center text-white font-black text-xl mx-auto mb-3">
            {((userProfile?.full_name || 'C')[0]).toUpperCase()}
          </div>
          <p className="text-white font-bold text-lg">{userProfile?.full_name || 'Convidado'}</p>
          {isGuest && <p className="text-purple-300 text-sm">Jogador convidado</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <p className="text-purple-200">À espera que o jogo comece...</p>
        </div>
      </div>
    )
  }

  // ── QUESTION ACTIVE ────────────────────────────────────────────
  if (session.status === 'question_active' && currentQuestion) {
    const timerPct = currentQuestion.time_seconds > 0
      ? (timeLeft / currentQuestion.time_seconds) * 100
      : 0
    const timerColor = timeLeft > currentQuestion.time_seconds * 0.5
      ? 'bg-green-400'
      : timeLeft > currentQuestion.time_seconds * 0.25
        ? 'bg-yellow-400'
        : 'bg-red-400'

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col p-4 gap-3">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            {streak >= 3 && (
              <span className={`flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full text-white ${streak >= 5 ? 'bg-orange-500' : 'bg-amber-500'}`}>
                <Flame className="w-3 h-3" />
                Streak ×{streak >= 5 ? 3 : 2}!
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-white/60 text-sm font-bold">
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            {totalPoints.toFixed(3)} pts
          </div>
        </div>

        {/* Timer */}
        <div className="relative h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${timerColor} rounded-full transition-all duration-100`}
            style={{ width: `${timerPct}%` }}
          />
        </div>
        <p className="text-center text-4xl font-black text-white tabular-nums">{Math.ceil(timeLeft)}</p>

        {currentQuestion.points_multiplier > 1 && (
          <div className="text-center">
            <span className="bg-yellow-400 text-yellow-900 text-xs font-black px-3 py-1 rounded-full inline-flex items-center gap-1">
              <Zap className="w-3 h-3" /> Pergunta ×{currentQuestion.points_multiplier}
            </span>
          </div>
        )}

        {/* After answering */}
        {answerResult ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            {answerResult.isCorrect ? (
              <>
                <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
                <p className="text-white font-black text-2xl">Correcto!</p>
                <p className="text-4xl font-black text-yellow-400">+{answerResult.finalPoints.toFixed(3)}</p>
                {streak >= 3 && (
                  <p className="text-orange-400 font-bold text-sm">
                    🔥 Streak ×{streak >= 5 ? 3 : 2} aplicado!
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center">
                  <XCircle className="w-10 h-10 text-white" />
                </div>
                <p className="text-white font-black text-2xl">Errado!</p>
                <p className="text-white/40">Streak perdida.</p>
              </>
            )}
            <p className="text-white/30 text-sm animate-pulse mt-4">À espera da próxima pergunta...</p>
          </div>
        ) : (
          /* Answer buttons */
          <div className="flex-1 flex flex-col justify-center gap-3 mt-2">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(['A', 'B', 'C', 'D'][i])}
                disabled={submitting || timeLeft === 0}
                className={`${OPTION_COLORS[i]} text-white font-bold py-5 px-5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 shadow-lg text-left`}
              >
                <span className="font-black text-sm shrink-0">{OPTION_LABELS[i]}</span>
                <span className="text-base">{opt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── QUESTION RESULTS ───────────────────────────────────────────
  if (session.status === 'question_results') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 gap-6 text-center">
        {answerResult ? (
          answerResult.isCorrect ? (
            <>
              <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <p className="text-white font-black text-3xl">Correcto! ✓</p>
              <p className="text-4xl font-black text-yellow-400">+{answerResult.finalPoints.toFixed(3)}</p>
            </>
          ) : (
            <>
              <div className="w-24 h-24 rounded-full bg-red-500 flex items-center justify-center mx-auto">
                <XCircle className="w-12 h-12 text-white" />
              </div>
              <p className="text-white font-black text-3xl">Errado!</p>
            </>
          )
        ) : (
          <>
            <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center mx-auto">
              <XCircle className="w-12 h-12 text-gray-500" />
            </div>
            <p className="text-gray-400 font-bold text-xl">Tempo esgotado.</p>
          </>
        )}

        <div className="bg-white/10 rounded-2xl p-4 mt-2 w-full max-w-xs">
          <p className="text-purple-300 text-xs font-bold uppercase tracking-wide mb-1">Total acumulado</p>
          <p className="text-white font-black text-3xl tabular-nums">{totalPoints.toFixed(3)} pts</p>
          <p className="text-purple-400 text-sm mt-1">{correctCount} ✓ correcta{correctCount !== 1 ? 's' : ''}</p>
        </div>

        <p className="text-white/30 text-sm animate-pulse">À espera do host...</p>
      </div>
    )
  }

  // ── FINISHED ───────────────────────────────────────────────────
  if (session.status === 'finished') {
    const goldEarned = correctCount * 10
    const xpEarned = correctCount * 20

    // Guest: donation flow
    if (isGuest && !donationSuccess && !donationSkipped) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-violet-900 to-indigo-900 flex flex-col p-6 gap-6 overflow-y-auto">
          <div className="text-center pt-4">
            <img src="/images/VanaQuest.png" alt="VanaQuest" className="w-14 h-14 object-contain mx-auto mb-3" />
            <h2 className="text-2xl font-black text-white">Jogo terminado!</h2>
            <p className="text-purple-200 mt-1">{correctCount} resposta{correctCount !== 1 ? 's' : ''} correcta{correctCount !== 1 ? 's' : ''}</p>
          </div>

          {correctCount > 0 ? (
            <div className="bg-white/10 rounded-2xl p-5 border border-white/20 space-y-4">
              <div className="text-center">
                <p className="text-purple-200 text-sm">Podes enviar ao teu Desbravador:</p>
                <p className="text-yellow-400 font-black text-2xl mt-1">
                  {goldEarned} 🪙 + {xpEarned} ⭐ XP
                </p>
              </div>

              <input
                type="text"
                value={donationSearch}
                onChange={(e) => setDonationSearch(e.target.value)}
                placeholder="Pesquisar desbravador..."
                className="w-full bg-white/20 border border-white/30 text-white placeholder-white/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
              />

              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleDonate(m.id)}
                    disabled={donating}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-left disabled:opacity-60"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {m.full_name[0]}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{m.full_name}</p>
                      <p className="text-purple-300 text-xs">{SECTION_LABELS[m.section] || m.section}</p>
                    </div>
                  </button>
                ))}
                {filteredMembers.length === 0 && (
                  <p className="text-purple-300 text-sm text-center py-4">Nenhum resultado.</p>
                )}
              </div>

              <button
                onClick={() => setDonationSkipped(true)}
                className="w-full text-purple-400 text-sm py-2 underline"
              >
                Dispensar prémios
              </button>
            </div>
          ) : (
            <div className="text-center text-purple-300 space-y-3">
              <p>Não acertaste nenhuma pergunta desta vez.</p>
              <a href="/jogos/vana-quest" className="text-white underline block">Jogar novamente</a>
            </div>
          )}
        </div>
      )
    }

    if (donationSuccess) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-violet-900 to-indigo-900 flex flex-col items-center justify-center p-6 gap-5 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-black text-white">Enviado!</h2>
          <p className="text-purple-200">O teu desbravador receberá os prémios quando o host fechar o jogo.</p>
          <a href="/jogos/vana-quest" className="text-purple-300 underline">Jogar novamente</a>
        </div>
      )
    }

    // Registered user (or guest who skipped)
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 to-indigo-900 flex flex-col items-center justify-center p-6 gap-6 text-center">
        <img src="/images/VanaQuest.png" alt="VanaQuest" className="w-20 h-20 object-contain" />
        <h1 className="text-3xl font-black text-white">🏆 Jogo concluído!</h1>

        <div className="bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20 w-full max-w-sm space-y-4">
          <div>
            <p className="text-purple-300 text-xs font-bold uppercase tracking-wide">Pontuação final</p>
            <p className="text-white font-black text-4xl tabular-nums">{totalPoints.toFixed(3)}</p>
          </div>
          <div className="flex justify-around border-t border-white/10 pt-4">
            <div>
              <p className="text-yellow-400 font-black text-2xl">+{goldEarned}</p>
              <p className="text-purple-300 text-xs">🪙 Gold</p>
            </div>
            <div>
              <p className="text-blue-400 font-black text-2xl">+{xpEarned}</p>
              <p className="text-purple-300 text-xs">⭐ XP</p>
            </div>
            <div>
              <p className="text-green-400 font-black text-2xl">{correctCount}</p>
              <p className="text-purple-300 text-xs">✓ Certas</p>
            </div>
          </div>
          {!isGuest && (
            <p className="text-purple-300 text-xs">Prémios atribuídos quando o host fechar o jogo.</p>
          )}
        </div>

        <a href="/jogos" className="text-purple-300 underline">Voltar aos jogos</a>
      </div>
    )
  }

  return null
}
