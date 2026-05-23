'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { QRCodeSVG } from 'qrcode.react'
import { Users, Trophy, Zap, Flame, CheckCircle2 } from 'lucide-react'

const OPTION_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-yellow-400', 'bg-green-500']
const OPTION_LABELS = ['▲', '●', '◆', '■']
const OPTION_NAMES = ['A', 'B', 'C', 'D']

interface Question {
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
  pin: string
  vana_quests: { title: string } | null
}

interface Participant {
  id: string
  display_name: string
  total_points: number
  current_streak: number
  max_streak: number
  is_guest: boolean
}

interface Answer {
  participant_id: string
  is_correct: boolean
  chosen_option: string
  question_id: string
}

interface Props {
  sessionId: string
  initialSession: Session
  questions: Question[]
  siteUrl: string
}

export function Presentation({ sessionId, initialSession, questions, siteUrl }: Props) {
  const supabase = createClient()
  const [session, setSession] = useState<Session>(initialSession)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [introCountdown, setIntroCountdown] = useState(4)
  const [qrZoomed, setQrZoomed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Snapshot of points shown last time (per participant id) — used to animate from previous → new
  const prevPointsRef = useRef<Record<string, number>>({})

  const currentQuestion = session.current_question_index >= 0
    ? questions[session.current_question_index]
    : null
  const joinUrl = `${siteUrl}/jogos/vana-quest?pin=${session.pin}`

  // Broadcast listener (commands from control panel)
  useEffect(() => {
    const ch = supabase.channel(`vq-present-${sessionId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'cmd' }, ({ payload }) => {
      if (typeof payload?.qrZoomed === 'boolean') setQrZoomed(payload.qrZoomed)
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`present-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vana_quest_sessions', filter: `id=eq.${sessionId}` },
        (p) => setSession((prev) => ({ ...prev, ...(p.new as Session) })))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vana_quest_participants', filter: `session_id=eq.${sessionId}` },
        (p) => setParticipants((prev) => prev.find((x) => x.id === (p.new as Participant).id) ? prev : [...prev, p.new as Participant]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vana_quest_participants', filter: `session_id=eq.${sessionId}` },
        (p) => setParticipants((prev) => prev.map((x) => x.id === (p.new as Participant).id ? (p.new as Participant) : x)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vana_quest_answers', filter: `session_id=eq.${sessionId}` },
        (p) => setAnswers((prev) => [...prev, p.new as Answer]))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  useEffect(() => {
    supabase.from('vana_quest_participants').select('*').eq('session_id', sessionId)
      .then(({ data }) => { if (data) setParticipants(data) })
  }, [sessionId])

  useEffect(() => {
    if (!currentQuestion) return
    supabase.from('vana_quest_answers').select('*').eq('session_id', sessionId).eq('question_id', currentQuestion.id)
      .then(({ data }) => { if (data) setAnswers(data) })
  }, [currentQuestion?.id, sessionId])

  // Timer (active)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (session.status === 'question_active' && currentQuestion && session.question_started_at) {
      const end = new Date(session.question_started_at).getTime() + currentQuestion.time_seconds * 1000
      timerRef.current = setInterval(() => {
        setTimeLeft(Math.max(0, (end - Date.now()) / 1000))
      }, 100)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [session.status, session.question_started_at, currentQuestion?.id])

  // Intro countdown
  useEffect(() => {
    if (session.status === 'question_intro') {
      setIntroCountdown(4)
      const interval = setInterval(() => {
        setIntroCountdown((c) => Math.max(0, c - 1))
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [session.status, session.current_question_index])

  const currentAnswers = currentQuestion ? answers.filter((a) => a.question_id === currentQuestion.id) : []
  const correctIdx = currentQuestion ? OPTION_NAMES.indexOf(currentQuestion.correct_option) : -1
  const answerCounts = OPTION_NAMES.map((opt) => currentAnswers.filter((a) => a.chosen_option === opt).length)

  // ── WAITING LOBBY ─────────────────────────────────────────────
  if (session.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 flex flex-col">
        <div className="flex items-center justify-between px-8 pt-6">
          <div className="flex items-center gap-3">
            <img src="/images/VanaQuest.png" alt="" className="w-12 h-12 object-contain drop-shadow-lg" />
            <div>
              <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">VanaQuest</p>
              <h1 className="text-white font-black text-2xl">{(initialSession.vana_quests as any)?.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4 py-2 border border-white/10">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-bold">{participants.length} jogador{participants.length !== 1 ? 'es' : ''}</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 px-6 py-8 max-w-7xl mx-auto w-full">
          {/* PIN + QR */}
          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <div className="w-full bg-white/10 backdrop-blur-sm rounded-3xl border border-white/20 p-8 text-center overflow-hidden">
              <p className="text-sky-300 text-xs font-black uppercase tracking-[0.2em] mb-3">Entra com o PIN</p>
              <p className="text-6xl md:text-7xl font-black text-white tracking-wider tabular-nums">{session.pin}</p>
              <p className="text-sky-400 text-sm mt-3">
                em <span className="text-white font-semibold">{siteUrl.replace(/^https?:\/\//, '')}/jogos/vana-quest</span>
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-2xl">
              <QRCodeSVG value={joinUrl} size={200} />
            </div>
          </div>

          {/* Players */}
          <div className="w-full max-w-md bg-white/10 backdrop-blur-sm rounded-3xl border border-white/20 p-6 flex flex-col">
            <p className="text-sky-300 text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Jogadores na sala
            </p>
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[28rem]">
              {participants.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-7 h-7 text-sky-400" />
                  </div>
                  <p className="text-sky-300">À espera de jogadores...</p>
                </div>
              ) : (
                participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5 animate-in slide-in-from-right-2 duration-300">
                    <div className="w-9 h-9 rounded-full bg-blue-500/40 flex items-center justify-center text-white font-black">
                      {p.display_name[0]?.toUpperCase()}
                    </div>
                    <span className="text-white font-semibold flex-1 truncate">{p.display_name}</span>
                    {p.is_guest && <span className="text-[10px] text-sky-400 bg-blue-500/10 rounded-full px-2 py-0.5">convidado</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {qrZoomed && <QrZoomOverlay pin={session.pin} url={joinUrl} />}
      </div>
    )
  }

  // ── QUESTION INTRO ────────────────────────────────────────────
  if (session.status === 'question_intro' && currentQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-blue-950 flex flex-col items-center justify-center p-8">
        <div className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 rounded-2xl px-4 py-2 border border-white/10">
          <span className="text-white/60 text-sm font-bold">{session.current_question_index + 1} / {questions.length}</span>
          {currentQuestion.points_multiplier > 1 && (
            <span className="bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded-full flex items-center gap-1">
              <Zap className="w-3 h-3" /> ×{currentQuestion.points_multiplier}
            </span>
          )}
        </div>

        <div className="text-center max-w-4xl space-y-8 animate-in fade-in zoom-in-95 duration-500">
          <p className="text-sky-400 text-sm font-black uppercase tracking-[0.3em]">Pergunta {session.current_question_index + 1}</p>
          <h2 className="text-white text-5xl md:text-7xl font-black leading-tight">{currentQuestion.question_text}</h2>
        </div>

        <div className="absolute bottom-12 flex flex-col items-center gap-3">
          <div className="text-9xl font-black text-white/80 tabular-nums animate-in zoom-in duration-500" key={introCountdown}>
            {introCountdown || ''}
          </div>
          <p className="text-sky-300 text-sm font-semibold">Prepara-te...</p>
        </div>
      </div>
    )
  }

  // ── QUESTION ACTIVE ───────────────────────────────────────────
  if (session.status === 'question_active' && currentQuestion) {
    const options = [currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d]
    const timerPct = (timeLeft / currentQuestion.time_seconds) * 100

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-indigo-950 flex flex-col p-6 gap-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <span className="bg-white/10 text-white text-sm font-bold px-3 py-1.5 rounded-full">
            {session.current_question_index + 1} / {questions.length}
          </span>
          {currentQuestion.points_multiplier > 1 && (
            <span className="bg-yellow-400 text-yellow-900 text-sm font-black px-3 py-1.5 rounded-full flex items-center gap-1">
              <Zap className="w-4 h-4" /> ×{currentQuestion.points_multiplier}
            </span>
          )}
          <div className="flex items-center gap-2 text-white/70 font-bold">
            <Users className="w-4 h-4" />
            <span className="tabular-nums">{currentAnswers.length} / {participants.length}</span>
          </div>
        </div>

        {/* Timer bar */}
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-100 ${
              timeLeft > currentQuestion.time_seconds * 0.5 ? 'bg-green-400' :
              timeLeft > currentQuestion.time_seconds * 0.25 ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${timerPct}%` }}
          />
        </div>
        <p className="text-center text-7xl font-black text-white tabular-nums">{Math.ceil(timeLeft)}</p>

        {/* Question */}
        <div className="bg-white/10 backdrop-blur rounded-3xl border border-white/20 p-6 max-w-5xl mx-auto w-full">
          <p className="text-white text-3xl md:text-4xl font-bold text-center leading-tight">
            {currentQuestion.question_text}
          </p>
        </div>

        {/* Answers (presentation shows text + colored bg) */}
        <div className="flex-1 grid grid-cols-2 gap-4 max-w-5xl mx-auto w-full">
          {options.map((opt, i) => (
            <div key={i} className={`${OPTION_COLORS[i]} rounded-2xl p-6 flex items-center gap-4 shadow-xl`}>
              <span className="text-white text-4xl font-black flex-shrink-0">{OPTION_LABELS[i]}</span>
              <p className="text-white text-xl md:text-2xl font-bold">{opt}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── RESULTS ───────────────────────────────────────────────────
  if (session.status === 'question_results' && currentQuestion) {
    const options = [currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d]
    const correctCount = currentAnswers.filter((a) => a.is_correct).length
    const maxCount = Math.max(...answerCounts, 1)

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-indigo-950 flex flex-col p-8 gap-6">
        <div className="text-center space-y-3 animate-in slide-in-from-top duration-500">
          <p className="text-sky-300 text-sm font-black uppercase tracking-[0.3em]">Resposta correcta</p>
          <div className={`inline-flex items-center gap-4 px-8 py-5 rounded-3xl ${OPTION_COLORS[correctIdx]} shadow-2xl`}>
            <span className="text-white text-4xl font-black">{OPTION_LABELS[correctIdx]}</span>
            <span className="text-white text-3xl font-black">{options[correctIdx]}</span>
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <p className="text-white/60 text-lg">{correctCount} de {participants.length} acertou</p>
        </div>

        {/* Bars */}
        <div className="flex-1 grid grid-cols-4 gap-4 items-end max-w-4xl mx-auto w-full">
          {options.map((opt, i) => (
            <div key={i} className="flex flex-col items-center gap-2 h-full">
              <span className="text-white text-3xl font-black">{answerCounts[i]}</span>
              <div className="flex-1 w-full flex items-end">
                <div
                  className={`w-full rounded-t-2xl transition-all duration-1000 ${OPTION_COLORS[i]} ${i !== correctIdx ? 'opacity-30' : 'shadow-2xl'}`}
                  style={{ height: `${Math.max(8, (answerCounts[i] / maxCount) * 100)}%` }}
                />
              </div>
              <span className="text-white/70 text-xl font-black">{OPTION_LABELS[i]}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── LEADERBOARD ───────────────────────────────────────────────
  if (session.status === 'question_leaderboard') {
    return <LeaderboardScreen participants={participants} prevPointsRef={prevPointsRef} />
  }

  // ── FINISHED (cinematic podium) ───────────────────────────────
  if (session.status === 'finished') {
    return <CinematicPodium participants={participants} />
  }

  return null
}

// ─────────────────────────────────────────────────────────────────
// CINEMATIC PODIUM (3rd → 2nd → 1st → all together)
// ─────────────────────────────────────────────────────────────────
function CinematicPodium({ participants }: { participants: Participant[] }) {
  const podium = [...participants].sort((a, b) => b.total_points - a.total_points)
  const medals = ['🥇', '🥈', '🥉']

  // phase: 0 = reveal 3rd, 1 = reveal 2nd, 2 = reveal 1st + confetti, 3 = all together
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timings = [2800, 2800, 3500] // ms in each reveal phase
    if (phase < 3) {
      const t = setTimeout(() => setPhase((p) => p + 1), timings[phase])
      return () => clearTimeout(t)
    }
  }, [phase])

  // Reveal phases (0, 1, 2) — spotlight on one player
  if (phase < 3) {
    const rankOrder = [2, 1, 0] // index 2 = 3rd place revealed first
    const rank = rankOrder[phase]
    const p = podium[rank]

    const colors = ['from-yellow-300 via-yellow-400 to-yellow-600', 'from-gray-200 via-gray-300 to-gray-400', 'from-amber-400 via-amber-600 to-amber-800']
    const ringColors = ['ring-yellow-400', 'ring-gray-300', 'ring-amber-600']
    const labels = ['🥇 PRIMEIRO LUGAR', '🥈 SEGUNDO LUGAR', '🥉 TERCEIRO LUGAR']
    const isWinner = rank === 0
    const isEmpty = !p

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Spotlight cone */}
        <div className="absolute inset-0 pointer-events-none animate-in fade-in duration-700">
          <div
            className="absolute left-1/2 -top-32 w-[800px] h-[1200px] -translate-x-1/2 opacity-50"
            style={{
              background: 'radial-gradient(ellipse at top, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 30%, transparent 65%)',
              filter: 'blur(20px)',
            }}
          />
        </div>

        {/* Floor glow */}
        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-32 rounded-full bg-gradient-to-t ${colors[rank]} opacity-30 blur-3xl`} />

        {/* Confetti only for winner (only if there is one) */}
        {isWinner && !isEmpty && <Confetti />}

        {/* Content */}
        <div className="relative z-10 text-center space-y-8 animate-in zoom-in-90 fade-in duration-700">
          <p className={`text-sm md:text-base font-black uppercase tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r ${colors[rank]} drop-shadow-lg`}>
            {labels[rank]}
          </p>

          {/* Avatar bubble */}
          <div className="flex justify-center">
            <div className={`w-44 h-44 rounded-full ${
              isEmpty
                ? 'bg-white/5 ring-4 ring-white/10 border-2 border-dashed border-white/20'
                : `bg-gradient-to-br ${colors[rank]} ring-8 ${ringColors[rank]}/40`
            } ring-offset-8 ring-offset-blue-950 flex items-center justify-center shadow-2xl animate-in zoom-in-50 duration-1000`}>
              {isEmpty ? (
                <span className="text-5xl text-white/30">—</span>
              ) : (
                <span className="text-7xl font-black text-white drop-shadow-2xl">
                  {p.display_name[0]?.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {isEmpty ? (
              <>
                <h2 className="text-white/40 text-4xl md:text-5xl font-black italic drop-shadow-lg">
                  Sem participante
                </h2>
                <p className="text-white/30 text-lg">Não houve jogadores suficientes</p>
              </>
            ) : (
              <>
                <h2 className="text-white text-5xl md:text-7xl font-black drop-shadow-lg">
                  {p.display_name}
                </h2>
                <p className="text-white/70 text-2xl font-bold tabular-nums">
                  {p.total_points.toFixed(1)} <span className="text-white/40 text-lg">pontos</span>
                </p>
                <div className="flex items-center justify-center gap-4 text-white/60 text-sm pt-2">
                  {p.max_streak >= 2 && (
                    <span className="flex items-center gap-1 text-orange-400 font-bold">
                      <Flame className="w-4 h-4" /> Streak ×{p.max_streak}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> {(p as any).correct_answers ?? 0} certas
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Big medal */}
          <div className={`text-9xl drop-shadow-2xl animate-in zoom-in fade-in duration-1000 ${isEmpty ? 'opacity-30 grayscale' : ''}`} style={{ animationDelay: '300ms' }}>
            {medals[rank]}
          </div>
        </div>
      </div>
    )
  }

  // Phase 3: all together — Kahoot-style podium
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-indigo-950 flex flex-col items-center px-6 pt-8 pb-0 gap-4 relative overflow-hidden">
      {/* Lingering confetti */}
      <Confetti />

      <div className="text-center z-10 animate-in fade-in slide-in-from-top duration-700">
        <h1 className="text-white text-4xl md:text-5xl font-black drop-shadow-2xl tracking-tight">
          🏆 Pódio Final
        </h1>
      </div>

      {/* Spotlight from above */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] pointer-events-none opacity-60"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(255,255,255,0.18) 0%, transparent 60%)',
          filter: 'blur(20px)',
        }}
      />

      {/* Floor glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1200px] h-48 rounded-full bg-gradient-to-t from-yellow-400 via-yellow-300/40 to-transparent opacity-50 blur-3xl pointer-events-none" />

      {/* Podium row */}
      <div className="flex-1 flex items-end justify-center gap-3 md:gap-6 max-w-5xl w-full z-10 pt-4">
        {[1, 0, 2].map((rank, idx) => {
          const p = podium[rank]
          const isEmpty = !p

          // Pedestal heights: 1st tallest, then 2nd, then 3rd
          const heights = ['h-72 md:h-80', 'h-96 md:h-[28rem]', 'h-56 md:h-64'] // 2nd, 1st, 3rd
          const widths = ['w-full', 'w-full', 'w-full']

          // Pedestal colors (solid, vibrant)
          const pedestalBg = [
            'bg-gradient-to-b from-slate-300 via-slate-400 to-slate-500',     // 2nd silver
            'bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-600',  // 1st gold
            'bg-gradient-to-b from-amber-600 via-amber-700 to-amber-800',     // 3rd bronze
          ]
          const numberColors = [
            'text-slate-700', 'text-yellow-800', 'text-amber-200',
          ]
          // Avatar bubble colors per rank
          const avatarColors = [
            'bg-gradient-to-br from-slate-200 to-slate-400 ring-slate-300',
            'bg-gradient-to-br from-yellow-300 to-yellow-500 ring-yellow-400',
            'bg-gradient-to-br from-amber-500 to-amber-700 ring-amber-600',
          ]

          // Animation order: 3rd (rank=2) first, then 2nd (rank=1), then 1st (rank=0)
          const animOrder = 2 - rank // rank 2 → 0, rank 1 → 1, rank 0 → 2
          const baseDelay = animOrder * 600

          return (
            <div
              key={rank}
              className={`flex-1 max-w-xs flex flex-col items-center ${isEmpty ? 'opacity-40' : ''}`}
            >
              {/* Avatar + name + points (above pedestal, animates in first) */}
              <div
                className="flex flex-col items-center mb-3 animate-in fade-in slide-in-from-bottom duration-700"
                style={{ animationDelay: `${baseDelay}ms`, animationFillMode: 'backwards' }}
              >
                <div className={`relative w-20 h-20 md:w-28 md:h-28 rounded-full ${
                  isEmpty
                    ? 'bg-white/5 border-2 border-dashed border-white/15'
                    : `${avatarColors[rank]} ring-4 ring-offset-4 ring-offset-blue-950 shadow-2xl`
                } flex items-center justify-center`}>
                  {isEmpty ? (
                    <span className="text-3xl text-white/30">—</span>
                  ) : (
                    <span className="text-3xl md:text-5xl font-black text-white drop-shadow-lg">
                      {p.display_name[0]?.toUpperCase()}
                    </span>
                  )}
                  {!isEmpty && rank === 0 && (
                    <div className="absolute -top-3 -right-3 text-3xl md:text-4xl drop-shadow-lg animate-bounce">
                      👑
                    </div>
                  )}
                </div>
                <div className="text-center mt-3 space-y-0.5 max-w-[10rem]">
                  <p className={`font-black leading-tight px-1 drop-shadow-lg ${
                    isEmpty ? 'text-white/30 italic text-sm' :
                    rank === 0 ? 'text-white text-xl md:text-2xl' : 'text-white text-base md:text-lg'
                  }`}>
                    {isEmpty ? 'sem participante' : p.display_name}
                  </p>
                  {!isEmpty && (
                    <p className="text-white/80 text-sm md:text-base font-bold tabular-nums">
                      {p.total_points.toFixed(1)} <span className="text-white/50 text-xs">pts</span>
                    </p>
                  )}
                  {!isEmpty && p.max_streak >= 2 && (
                    <p className="text-orange-400 text-xs font-bold flex items-center justify-center gap-1">
                      <Flame className="w-3 h-3" /> ×{p.max_streak}
                    </p>
                  )}
                </div>
              </div>

              {/* Pedestal (rises from bottom) */}
              <div
                className={`${widths[idx]} ${pedestalBg[rank]} ${heights[idx]} rounded-t-2xl shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom origin-bottom`}
                style={{
                  animationDelay: `${baseDelay + 200}ms`,
                  animationDuration: '900ms',
                  animationFillMode: 'backwards',
                  animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                {/* Top shine */}
                <div className="absolute top-0 left-0 right-0 h-3 bg-white/30" />

                {/* Side gradient for 3D effect */}
                <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/20 to-transparent" />

                {/* Big rank number — centered */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-7xl md:text-9xl font-black ${numberColors[rank]} drop-shadow-2xl select-none`}>
                    {rank + 1}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Rest of leaderboard */}
      {podium.length > 3 && (
        <div
          className="bg-white/10 backdrop-blur rounded-2xl border border-white/20 p-3 w-full max-w-2xl z-10 animate-in fade-in slide-in-from-bottom duration-700 mb-4"
          style={{ animationDelay: '2200ms', animationFillMode: 'backwards' }}
        >
          {podium.slice(3, 10).map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-1.5 px-2 border-b border-white/10 last:border-0">
              <span className="text-sm font-black w-7 text-center text-white/40">{i + 4}</span>
              <span className="flex-1 text-white font-semibold text-sm truncate">{p.display_name}</span>
              {p.max_streak >= 2 && (
                <span className="flex items-center gap-1 text-orange-400 text-xs font-bold">
                  <Flame className="w-3 h-3" /> {p.max_streak}
                </span>
              )}
              <span className="text-white font-black text-sm tabular-nums">{p.total_points.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Confetti shower (pure CSS)
function Confetti() {
  const pieces = Array.from({ length: 80 }, (_, i) => i)
  const colors = ['#fbbf24', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {pieces.map((i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 3
        const duration = 3 + Math.random() * 3
        const size = 6 + Math.random() * 8
        const color = colors[Math.floor(Math.random() * colors.length)]
        const rotation = Math.random() * 360
        const drift = (Math.random() - 0.5) * 100
        return (
          <div
            key={i}
            className="absolute top-[-20px] confetti-piece"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size * 0.4}px`,
              backgroundColor: color,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              ['--drift' as any]: `${drift}px`,
              ['--rot' as any]: `${rotation}deg`,
            }}
          />
        )
      })}
      <style jsx>{`
        @keyframes confettiFall {
          0% {
            transform: translateY(-20px) translateX(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) translateX(var(--drift, 0px)) rotate(calc(var(--rot, 0deg) * 4));
            opacity: 0.3;
          }
        }
        .confetti-piece {
          animation-name: confettiFall;
          animation-timing-function: cubic-bezier(0.2, 0.7, 0.6, 1);
          animation-iteration-count: infinite;
          border-radius: 2px;
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// LEADERBOARD (top players with smooth position transitions)
// ─────────────────────────────────────────────────────────────────
function LeaderboardScreen({
  participants,
  prevPointsRef,
}: {
  participants: Participant[]
  prevPointsRef: React.MutableRefObject<Record<string, number>>
}) {
  // Live animated points per participant id
  const [animatedPoints, setAnimatedPoints] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    participants.forEach((p) => { init[p.id] = prevPointsRef.current[p.id] ?? 0 })
    return init
  })

  // Deltas captured at mount (how much each gained this round)
  const deltasRef = useRef<Record<string, number>>(
    Object.fromEntries(
      participants.map((p) => [p.id, p.total_points - (prevPointsRef.current[p.id] ?? 0)])
    )
  )

  // Animate from previous → current
  useEffect(() => {
    const startSnap: Record<string, number> = {}
    const endSnap: Record<string, number> = {}
    participants.forEach((p) => {
      startSnap[p.id] = prevPointsRef.current[p.id] ?? 0
      endSnap[p.id] = p.total_points
    })

    const duration = 1800
    const startTime = performance.now() + 400 // small breath before counting starts
    let rafId: number

    const tick = (now: number) => {
      const elapsed = now - startTime
      if (elapsed < 0) {
        rafId = requestAnimationFrame(tick)
        return
      }
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next: Record<string, number> = {}
      participants.forEach((p) => {
        const s = startSnap[p.id]
        const e = endSnap[p.id]
        next[p.id] = s + (e - s) * eased
      })
      setAnimatedPoints(next)
      if (t < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        prevPointsRef.current = { ...endSnap }
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sort by LIVE values so positions swap mid-animation as players overtake each other
  const top = [...participants]
    .sort((a, b) => (animatedPoints[b.id] ?? 0) - (animatedPoints[a.id] ?? 0))
    .slice(0, 5)

  const maxStreak = Math.max(...participants.map((p) => p.current_streak), 0)
  const onFire = maxStreak >= 2 ? participants.filter((p) => p.current_streak === maxStreak) : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-950 flex flex-col p-8 gap-8 overflow-hidden relative">
      <div className="text-center space-y-1">
        <p className="text-sky-300 text-sm font-black uppercase tracking-[0.3em]">Classificação</p>
        <h2 className="text-white text-5xl font-black flex items-center justify-center gap-3">
          <Trophy className="w-10 h-10 text-yellow-400" /> Top jogadores
        </h2>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full relative" style={{ minHeight: `${top.length * 90}px` }}>
        {top.map((p, i) => {
          const value = animatedPoints[p.id] ?? 0
          const delta = deltasRef.current[p.id] ?? 0
          const showDelta = delta > 0.005

          return (
            <div
              key={p.id}
              className="absolute left-0 right-0 transition-all duration-700 ease-out"
              style={{ top: `${i * 90}px` }}
            >
              <div className={`flex items-center gap-4 rounded-2xl p-4 border-2 ${
                i === 0 ? 'bg-yellow-400/20 border-yellow-400/40' :
                i === 1 ? 'bg-gray-300/15 border-gray-300/30' :
                i === 2 ? 'bg-amber-600/15 border-amber-600/30' :
                'bg-white/10 border-white/10'
              } shadow-xl backdrop-blur-sm`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0 transition-colors ${
                  i === 0 ? 'bg-yellow-400 text-yellow-900' :
                  i === 1 ? 'bg-gray-300 text-gray-800' :
                  i === 2 ? 'bg-amber-600 text-amber-50' :
                  'bg-white/10 text-white'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-xl truncate">{p.display_name}</p>
                  <div className="flex items-center gap-2 text-xs">
                    {p.is_guest && <span className="text-sky-300/70">convidado</span>}
                    {p.current_streak >= 2 && (
                      <span className="flex items-center gap-1 text-orange-400 font-bold">
                        <Flame className="w-3 h-3" /> ×{p.current_streak}
                      </span>
                    )}
                  </div>
                </div>

                {showDelta && (
                  <span className="bg-green-500/30 border border-green-400/40 rounded-full px-3 py-1 text-green-300 text-sm font-black tabular-nums animate-in slide-in-from-right fade-in duration-500">
                    +{delta.toFixed(1)}
                  </span>
                )}

                <div className="text-right min-w-[6.5rem]">
                  <p className="text-white font-black text-3xl tabular-nums">{value.toFixed(1)}</p>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-wider">pontos</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {onFire.length > 0 && (
        <div className="bg-white/5 rounded-2xl border border-orange-400/20 p-4 max-w-3xl mx-auto w-full animate-in slide-in-from-bottom duration-500">
          <p className="text-orange-300 text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Em chamas! ×{maxStreak} streak
          </p>
          <div className="flex flex-wrap gap-2">
            {onFire.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-orange-500/20 border border-orange-400/30 rounded-full px-3 py-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-white font-bold text-sm">{p.display_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// QR zoom overlay (read-only, controlled by host's control panel)
function QrZoomOverlay({ pin, url }: { pin: string; url: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl p-10 shadow-2xl animate-in zoom-in-95 duration-500">
        <QRCodeSVG value={url} size={500} />
        <p className="text-center mt-6 text-5xl font-black text-gray-900 tabular-nums tracking-widest">
          {pin}
        </p>
        <p className="text-center text-gray-500 text-lg mt-2">Lê o código ou usa o PIN</p>
      </div>
    </div>
  )
}
