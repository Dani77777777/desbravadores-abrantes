'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { submitAnswer, setRewardsRecipient } from '@/lib/actions/vana-quest'
import { CheckCircle2, XCircle, Trophy, Zap, Flame, Users } from 'lucide-react'
import { PlayerAvatar } from './PlayerAvatar'

const OPTION_COLORS = [
  'bg-red-500 active:bg-red-700',
  'bg-blue-500 active:bg-blue-700',
  'bg-yellow-400 active:bg-yellow-600',
  'bg-green-500 active:bg-green-700',
]
const OPTION_SYMBOLS = ['▲', '●', '◆', '■']
const OPTION_LETTERS = ['A', 'B', 'C', 'D']

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
  const [showPointsBurst, setShowPointsBurst] = useState(false)
  const [showMultiplierWarning, setShowMultiplierWarning] = useState(false)

  const [totalAnswered, setTotalAnswered] = useState(0)
  const [totalPlayers, setTotalPlayers] = useState(0)

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

  useEffect(() => {
    const stored = localStorage.getItem(`vana_participant_${sessionId}`)
    setParticipantId(stored)
  }, [sessionId])

  // Aviso de multiplicador (x2/x3) no início do question_intro
  useEffect(() => {
    if (session.status === 'question_intro' && currentQuestion && currentQuestion.points_multiplier > 1) {
      setShowMultiplierWarning(true)
      const t = setTimeout(() => setShowMultiplierWarning(false), 2800)
      return () => clearTimeout(t)
    }
    setShowMultiplierWarning(false)
  }, [session.status, currentQuestion?.id])

  // Sincronizar stats com a BD ao montar (após termos o participantId) e
  // sempre que entrarmos em question_results ou question_leaderboard.
  // Isto garante que mesmo após refresh ou se entrarmos a meio do jogo,
  // os valores mostrados (streak, certas, pontos) batem com a BD.
  useEffect(() => {
    if (!participantId) return
    const shouldSync =
      session.status === 'question_results' ||
      session.status === 'question_leaderboard' ||
      session.status === 'finished'
    if (!shouldSync) return

    supabase
      .from('vana_quest_participants')
      .select('total_points, correct_answers, current_streak')
      .eq('id', participantId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setTotalPoints(Number(data.total_points) || 0)
        setCorrectCount(data.correct_answers || 0)
        setStreak(data.current_streak || 0)
      })
  }, [participantId, session.status])

  // Realtime: session + counters (without revealing distribution)
  useEffect(() => {
    const channel = supabase
      .channel(`player-${sessionId}-${userId || 'g'}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vana_quest_sessions', filter: `id=eq.${sessionId}` },
        (p) => {
          const ns = p.new as Session
          setSession(ns)
          if (ns.status === 'question_active') {
            const k = `${ns.current_question_index}`
            if (questionKey.current !== k) {
              questionKey.current = k
              setAnswerResult(null)
              setSubmitting(false)
              setTotalAnswered(0)
              startTimeRef.current = ns.question_started_at
                ? new Date(ns.question_started_at).getTime()
                : Date.now()
            }
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vana_quest_answers', filter: `session_id=eq.${sessionId}` },
        (p) => {
          const ans = p.new as any
          if (currentQuestion && ans.question_id === currentQuestion.id) {
            setTotalAnswered((c) => c + 1)
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vana_quest_participants', filter: `session_id=eq.${sessionId}` },
        () => setTotalPlayers((c) => c + 1))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, userId, currentQuestion?.id])

  // Load total player count
  useEffect(() => {
    supabase.from('vana_quest_participants').select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
      .then(({ count }) => { if (count !== null) setTotalPlayers(count) })
  }, [sessionId])

  // Reset answered count when question changes
  useEffect(() => {
    if (currentQuestion) setTotalAnswered(0)
  }, [currentQuestion?.id])

  useEffect(() => {
    if (session.status === 'question_active' && session.question_started_at) {
      startTimeRef.current = new Date(session.question_started_at).getTime()
      questionKey.current = `${session.current_question_index}`
    }
  }, [session.status, session.question_started_at])

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (session.status === 'question_active' && currentQuestion && session.question_started_at) {
      const end = new Date(session.question_started_at).getTime() + currentQuestion.time_seconds * 1000
      timerRef.current = setInterval(() => {
        const r = Math.max(0, (end - Date.now()) / 1000)
        setTimeLeft(r)
        if (r === 0 && timerRef.current) clearInterval(timerRef.current)
      }, 50)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [session.status, session.question_started_at, currentQuestion?.id])

  async function handleAnswer(optionLetter: string) {
    if (!participantId || !currentQuestion || submitting || answerResult) return
    setSubmitting(true)

    const elapsedMs = Math.max(0, Date.now() - startTimeRef.current)
    const result = await submitAnswer(participantId, sessionId, currentQuestion.id, optionLetter, elapsedMs)

    if (result.ok) {
      // Don't reveal correctness yet — only store the chosen option
      // Correctness, points and streak are revealed when session.status hits 'question_results'
      setAnswerResult({
        isCorrect: result.isCorrect!,
        finalPoints: result.finalPoints!,
        chosen: optionLetter,
      })
    }
    setSubmitting(false)
  }

  // Reveal points/streak/correctCount only when entering question_results
  const revealedKey = useRef<string>('')
  useEffect(() => {
    if (session.status !== 'question_results' || !currentQuestion) return
    const key = currentQuestion.id
    if (revealedKey.current === key) return
    revealedKey.current = key

    if (!answerResult) {
      // Didn't answer in time → streak breaks
      setStreak(0)
      return
    }

    setTotalPoints((prev) => prev + (answerResult.finalPoints || 0))
    if (answerResult.isCorrect) {
      setStreak((s) => s + 1)
      setCorrectCount((c) => c + 1)
      setShowPointsBurst(true)
      setTimeout(() => setShowPointsBurst(false), 1500)
    } else {
      setStreak(0)
    }
  }, [session.status, answerResult, currentQuestion?.id])

  async function handleDonate(recipientId: string) {
    if (!participantId) return
    setDonating(true)
    await setRewardsRecipient(participantId, recipientId)
    setDonating(false)
    setDonationSuccess(true)
  }

  const filteredMembers = allMembers.filter((m) =>
    m.full_name.toLowerCase().includes(donationSearch.toLowerCase())
  )

  // Calculated rewards (rounded half-up)
  const goldEarned = Math.round(totalPoints)
  const xpEarned = goldEarned * 2

  // ── WAITING ────────────────────────────────────────────────────
  if (session.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-900 to-indigo-900 flex flex-col items-center justify-center p-6 gap-6 text-center">
        <img src="/images/VanaQuest.png" alt="" className="w-20 h-20 object-contain animate-bounce" />
        <h1 className="text-3xl font-black text-white">{questTitle}</h1>
        <div className="bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20">
          <div className="flex justify-center mb-3">
            <PlayerAvatar
              name={userProfile?.full_name || 'C'}
              avatarUrl={userProfile?.avatar_url}
              className="w-12 h-12"
              textClassName="text-xl"
              fallbackBg="bg-sky-300/30"
            />
          </div>
          <p className="text-white font-bold text-lg">{userProfile?.full_name || 'Convidado'}</p>
          {isGuest && <p className="text-sky-300 text-sm">Jogador convidado</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <p className="text-sky-200">À espera que o jogo comece...</p>
        </div>
      </div>
    )
  }

  // ── QUEST INTRO (uma vez no arranque) ─────────────────────────
  if (session.status === 'quest_intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-5 text-center">
        <img
          src="/images/VanaQuest.png"
          alt=""
          className="w-24 h-24 object-contain drop-shadow-2xl animate-in zoom-in fade-in duration-700"
        />
        <p
          className="text-sky-300 text-xs font-black uppercase tracking-[0.3em] animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: '400ms', animationFillMode: 'backwards' }}
        >
          Bem-vindo ao
        </p>
        <h1
          className="text-white text-4xl font-black drop-shadow-lg leading-tight animate-in fade-in zoom-in-90 duration-700"
          style={{ animationDelay: '700ms', animationFillMode: 'backwards' }}
        >
          {questTitle}
        </h1>
        <p
          className="text-sky-200 font-bold text-sm mt-4 animate-pulse"
        >
          ✨ Vai começar!
        </p>
      </div>
    )
  }

  // ── QUESTION INTRO (player sees only "prepare yourself") ──────
  if (session.status === 'question_intro') {
    // Aviso x2/x3 primeiro
    if (showMultiplierWarning && currentQuestion && currentQuestion.points_multiplier > 1) {
      const mult = currentQuestion.points_multiplier
      const label = mult === 2 ? 'A DOBRAR!' : 'A TRIPLICAR!'
      const gradient = mult === 2
        ? 'from-yellow-300 via-yellow-400 to-orange-500'
        : 'from-orange-400 via-red-500 to-pink-600'
      return (
        <div className={`min-h-screen bg-gradient-to-br ${gradient} flex flex-col items-center justify-center p-6 text-center relative overflow-hidden`}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute text-white/25 animate-bounce"
              style={{
                top: `${20 + Math.random() * 60}%`,
                left: `${10 + Math.random() * 80}%`,
                fontSize: `${30 + Math.random() * 40}px`,
                animationDelay: `${Math.random() * 0.8}s`,
              }}
            >
              ⚡
            </div>
          ))}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <Zap className="w-20 h-20 text-white drop-shadow-2xl animate-in zoom-in duration-500" fill="white" />
            <h1
              className="text-white font-black drop-shadow-2xl leading-none animate-in zoom-in fade-in duration-700"
              style={{ fontSize: '8rem', animationDelay: '200ms', animationFillMode: 'backwards' }}
            >
              ×{mult}
            </h1>
            <p
              className="text-white font-black tracking-[0.2em] drop-shadow-lg uppercase text-xl animate-in fade-in slide-in-from-bottom duration-700"
              style={{ animationDelay: '700ms', animationFillMode: 'backwards' }}
            >
              PONTOS {label}
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-blue-950 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sky-300 text-xs font-black uppercase tracking-[0.3em] mb-2">Pergunta {session.current_question_index + 1}</p>
        <p className="text-white text-3xl font-black animate-pulse mb-6">Prepara-te...</p>
        <div className="flex items-center gap-2 text-sky-300">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="font-bold tabular-nums">{totalPoints.toFixed(1)} pts</span>
        </div>
      </div>
    )
  }

  // ── QUESTION ACTIVE (2x2 colored grid, no text on mobile) ─────
  if (session.status === 'question_active' && currentQuestion) {
    const timerPct = (timeLeft / currentQuestion.time_seconds) * 100

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col p-3 gap-3 relative">
        {/* Top bar */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {streak >= 3 && (
              <span className={`flex items-center gap-1 font-black px-2.5 py-1 rounded-full text-white ${streak >= 5 ? 'bg-orange-500' : 'bg-amber-500'}`}>
                <Flame className="w-3 h-3" /> ×{streak >= 5 ? 3 : 2}
              </span>
            )}
            {currentQuestion.points_multiplier > 1 && (
              <span className="bg-yellow-400 text-yellow-900 font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                <Zap className="w-3 h-3" /> ×{currentQuestion.points_multiplier}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-white/60 font-bold">
              <Users className="w-3 h-3" /> {totalAnswered}/{totalPlayers}
            </div>
            <div className="flex items-center gap-1 text-white/60 font-bold">
              <Trophy className="w-3 h-3 text-yellow-400" /> {totalPoints.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ${
              timeLeft > currentQuestion.time_seconds * 0.5 ? 'bg-green-400' :
              timeLeft > currentQuestion.time_seconds * 0.25 ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${timerPct}%` }}
          />
        </div>
        <p className="text-center text-2xl font-black text-white tabular-nums">{Math.ceil(timeLeft)}</p>

        {/* If already answered — neutral state, no hint of which option was chosen */}
        {answerResult ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center animate-in zoom-in duration-300">
              <CheckCircle2 className="w-12 h-12 text-white/60" />
            </div>
            <p className="text-white font-bold text-2xl">Resposta enviada</p>
            <p className="text-white/40 text-sm animate-pulse">À espera dos outros...</p>
          </div>
        ) : (
          /* 2x2 GRID — colored buttons with only symbol, no text */
          <div className="flex-1 grid grid-cols-2 gap-3">
            {OPTION_LETTERS.map((letter, i) => (
              <button
                key={letter}
                onClick={() => handleAnswer(letter)}
                disabled={submitting || timeLeft === 0}
                className={`${OPTION_COLORS[i]} rounded-3xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 shadow-2xl relative overflow-hidden group`}
              >
                <span className="text-white text-7xl font-black drop-shadow-lg group-active:scale-90 transition-transform">
                  {OPTION_SYMBOLS[i]}
                </span>
                <span className="absolute top-3 left-3 text-white/70 text-xs font-black tracking-widest">
                  {letter}
                </span>
              </button>
            ))}
          </div>
        )}

        <style jsx>{`
          @keyframes pointsBurst {
            0% { transform: scale(0.5) translateY(0); opacity: 0; }
            30% { transform: scale(1.2) translateY(-10px); opacity: 1; }
            70% { transform: scale(1) translateY(-15px); opacity: 1; }
            100% { transform: scale(1) translateY(-20px); opacity: 0; }
          }
          .animate-points-burst {
            animation: pointsBurst 1.5s ease-out forwards;
          }
        `}</style>
      </div>
    )
  }

  // ── RESULTS ────────────────────────────────────────────────────
  if (session.status === 'question_results') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 gap-5 text-center">
        {answerResult ? (
          answerResult.isCorrect ? (
            <>
              <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center animate-in zoom-in duration-500">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <p className="text-white font-black text-3xl">Correcto!</p>
              <p className="text-4xl font-black text-yellow-400">+{answerResult.finalPoints.toFixed(3)}</p>
            </>
          ) : (
            <>
              <div className="w-24 h-24 rounded-full bg-red-500 flex items-center justify-center">
                <XCircle className="w-12 h-12 text-white" />
              </div>
              <p className="text-white font-black text-3xl">Errado!</p>
            </>
          )
        ) : (
          <>
            <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center">
              <XCircle className="w-12 h-12 text-gray-500" />
            </div>
            <p className="text-gray-400 font-bold text-xl">Tempo esgotado.</p>
          </>
        )}

        <div className="bg-white/10 rounded-2xl p-4 mt-2 w-full max-w-xs">
          <p className="text-sky-300 text-xs font-bold uppercase tracking-wide mb-1">Total acumulado</p>
          <p className="text-white font-black text-3xl tabular-nums">{totalPoints.toFixed(3)} pts</p>
        </div>
      </div>
    )
  }

  // ── LEADERBOARD (player view) ─────────────────────────────────
  if (session.status === 'question_leaderboard') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-5 text-center">
        <Trophy className="w-16 h-16 text-yellow-400" />
        <p className="text-sky-300 text-xs font-black uppercase tracking-widest">A tua pontuação</p>
        <p className="text-white text-6xl font-black tabular-nums">{totalPoints.toFixed(1)}</p>
        <div className="flex gap-4 text-sm">
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-white/60 text-xs">Certas</p>
            <p className="text-green-400 font-black text-xl">{correctCount}</p>
          </div>
          {streak >= 2 && (
            <div className="bg-orange-500/20 border border-orange-400/30 rounded-xl px-4 py-2">
              <p className="text-orange-300 text-xs flex items-center gap-1 justify-center"><Flame className="w-3 h-3" /> Streak</p>
              <p className="text-orange-400 font-black text-xl">×{streak}</p>
            </div>
          )}
        </div>
        <p className="text-white/40 text-xs animate-pulse mt-4">Olha para o ecrã principal...</p>
      </div>
    )
  }

  // ── FINISHED ───────────────────────────────────────────────────
  if (session.status === 'finished') {
    // Guest donation flow
    if (isGuest && !donationSuccess && !donationSkipped) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 flex flex-col p-6 gap-5 overflow-y-auto">
          <div className="text-center pt-4">
            <img src="/images/VanaQuest.png" alt="" className="w-14 h-14 object-contain mx-auto mb-2" />
            <h2 className="text-2xl font-black text-white">Jogo terminado!</h2>
            <p className="text-sky-200 mt-1">{totalPoints.toFixed(1)} pontos</p>
          </div>

          {goldEarned > 0 ? (
            <div className="bg-white/10 rounded-2xl p-5 border border-white/20 space-y-4">
              <div className="text-center">
                <p className="text-sky-200 text-sm">Podes enviar ao teu Desbravador:</p>
                <p className="text-yellow-400 font-black text-2xl mt-1">{goldEarned} 🪙 + {xpEarned} ⭐ XP</p>
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
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0">{m.full_name[0]}</div>
                    <div>
                      <p className="text-white font-semibold text-sm">{m.full_name}</p>
                      <p className="text-sky-300 text-xs">{SECTION_LABELS[m.section] || m.section}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setDonationSkipped(true)} className="w-full text-sky-400 text-sm py-2 underline">Dispensar prémios</button>
            </div>
          ) : (
            <div className="text-center text-sky-300 space-y-3">
              <p>Não acumulaste pontos desta vez.</p>
              <a href="/jogos/vana-quest" className="text-white underline block">Jogar novamente</a>
            </div>
          )}
        </div>
      )
    }

    if (donationSuccess) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 flex flex-col items-center justify-center p-6 gap-5 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center"><CheckCircle2 className="w-10 h-10 text-white" /></div>
          <h2 className="text-3xl font-black text-white">Enviado!</h2>
          <p className="text-sky-200">O teu desbravador receberá os prémios.</p>
          <a href="/jogos/vana-quest" className="text-sky-300 underline">Jogar novamente</a>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 flex flex-col items-center justify-center p-6 gap-6 text-center">
        <img src="/images/VanaQuest.png" alt="" className="w-20 h-20 object-contain" />
        <h1 className="text-3xl font-black text-white">🏆 Concluído!</h1>
        <div className="bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20 w-full max-w-sm space-y-4">
          <div>
            <p className="text-sky-300 text-xs font-bold uppercase tracking-wide">Pontuação final</p>
            <p className="text-white font-black text-4xl tabular-nums">{totalPoints.toFixed(3)}</p>
          </div>
          <div className="flex justify-around border-t border-white/10 pt-4">
            <div><p className="text-yellow-400 font-black text-2xl">+{goldEarned}</p><p className="text-sky-300 text-xs">🪙 Gold</p></div>
            <div><p className="text-blue-400 font-black text-2xl">+{xpEarned}</p><p className="text-sky-300 text-xs">⭐ XP</p></div>
            <div><p className="text-green-400 font-black text-2xl">{correctCount}</p><p className="text-sky-300 text-xs">✓</p></div>
          </div>
        </div>
        <a href="/jogos" className="text-sky-300 underline">Voltar aos jogos</a>
      </div>
    )
  }

  return null
}
