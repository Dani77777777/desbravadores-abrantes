'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { advanceQuestion, awardSessionPoints } from '@/lib/actions/vana-quest'
import { QRCodeSVG } from 'qrcode.react'
import { Users, ChevronRight, Trophy, Zap, Clock, CheckCircle2, XCircle } from 'lucide-react'

const OPTION_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-yellow-400', 'bg-green-500']
const OPTION_LABELS = ['▲ A', '● B', '◆ C', '■ D']
const OPTION_BORDER = ['border-red-400', 'border-blue-400', 'border-yellow-300', 'border-green-400']

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
  question_order: number
}

interface Session {
  id: string
  status: string
  current_question_index: number
  question_started_at: string | null
  pin: string
  vana_quests: { title: string; description?: string } | null
}

interface Participant {
  id: string
  display_name: string
  total_points: number
  correct_answers: number
  current_streak: number
  is_guest: boolean
}

interface Answer {
  participant_id: string
  is_correct: boolean
  chosen_option: string
}

interface Props {
  sessionId: string
  initialSession: Session
  questions: Question[]
  siteUrl: string
  adminProfile: any
}

export function HostScreen({ sessionId, initialSession, questions, siteUrl, adminProfile }: Props) {
  const supabase = createClient()
  const [session, setSession] = useState<Session>(initialSession)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [awarding, setAwarding] = useState(false)
  const [awarded, setAwarded] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentQuestion = session.current_question_index >= 0
    ? questions[session.current_question_index]
    : null

  const joinUrl = `${siteUrl}/jogos/vana-quest?pin=${session.pin}`

  // Supabase Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`host-session-${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vana_quest_sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        setSession((prev) => ({ ...prev, ...(payload.new as Session) }))
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'vana_quest_participants',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setParticipants((prev) => {
          const exists = prev.find((p) => p.id === (payload.new as Participant).id)
          return exists ? prev : [...prev, payload.new as Participant]
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vana_quest_participants',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setParticipants((prev) =>
          prev.map((p) => p.id === (payload.new as Participant).id ? (payload.new as Participant) : p)
        )
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'vana_quest_answers',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setAnswers((prev) => {
          const exists = prev.find((a) => a.participant_id === (payload.new as Answer).participant_id
            && (payload.new as any).question_id === currentQuestion?.id)
          return exists ? prev : [...prev, payload.new as Answer]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, currentQuestion?.id])

  // Fetch initial participants
  useEffect(() => {
    supabase
      .from('vana_quest_participants')
      .select('*')
      .eq('session_id', sessionId)
      .then(({ data }) => { if (data) setParticipants(data) })
  }, [sessionId])

  // Fetch answers for current question
  useEffect(() => {
    if (!currentQuestion) { setAnswers([]); return }
    supabase
      .from('vana_quest_answers')
      .select('participant_id, is_correct, chosen_option')
      .eq('session_id', sessionId)
      .eq('question_id', currentQuestion.id)
      .then(({ data }) => { if (data) setAnswers(data) })
  }, [currentQuestion?.id, sessionId])

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

  const leaderboard = [...participants]
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 10)

  async function handleAdvance() {
    await advanceQuestion(sessionId)
  }

  async function handleAward() {
    setAwarding(true)
    await awardSessionPoints(sessionId)
    setAwarded(true)
    setAwarding(false)
  }

  const answerCount = answers.length
  const correctCount = answers.filter((a) => a.is_correct).length
  const progressPct = currentQuestion ? (1 - timeLeft / currentQuestion.time_seconds) * 100 : 0
  const timerColor = timeLeft > currentQuestion?.time_seconds! * 0.5
    ? 'bg-green-500'
    : timeLeft > currentQuestion?.time_seconds! * 0.25
      ? 'bg-yellow-400'
      : 'bg-red-500'

  // ── WAITING LOBBY ─────────────────────────────────────────────
  if (session.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-900 flex flex-col items-center justify-center p-6 gap-8">
        <img src="/images/VanaQuest.png" alt="VanaQuest" className="w-20 h-20 object-contain drop-shadow-2xl" />
        <h1 className="text-4xl font-black text-white">{(initialSession.vana_quests as any)?.title}</h1>

        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* PIN */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-8 text-center border border-white/20 w-72">
            <p className="text-purple-200 text-sm font-bold uppercase tracking-wider mb-3">PIN do jogo</p>
            <p className="text-6xl font-black text-white tracking-widest">{session.pin}</p>
            <p className="text-purple-300 text-xs mt-3">ou lê o QR Code</p>
          </div>

          {/* QR */}
          <div className="bg-white rounded-3xl p-4 shadow-2xl">
            <QRCodeSVG value={joinUrl} size={180} />
          </div>

          {/* Players */}
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20 w-72 min-h-[12rem]">
            <p className="text-purple-200 text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> {participants.length} jogador{participants.length !== 1 ? 'es' : ''}
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-white text-sm font-semibold">
                  <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  {p.display_name}
                  {p.is_guest && <span className="text-[10px] text-purple-300">(convidado)</span>}
                </div>
              ))}
              {participants.length === 0 && (
                <p className="text-purple-300 text-sm">À espera de jogadores...</p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleAdvance}
          disabled={participants.length === 0}
          className="bg-white text-purple-900 font-black text-xl px-12 py-5 rounded-2xl hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-2xl flex items-center gap-3"
        >
          Iniciar <ChevronRight className="w-6 h-6" />
        </button>
        <p className="text-purple-300 text-sm">{questions.length} pergunta{questions.length !== 1 ? 's' : ''} preparadas</p>
      </div>
    )
  }

  // ── QUESTION ACTIVE ────────────────────────────────────────────
  if (session.status === 'question_active' && currentQuestion) {
    const options = [currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d]
    const answerCounts = ['A', 'B', 'C', 'D'].map((opt) =>
      answers.filter((a) => a.chosen_option === opt).length
    )
    const maxCount = Math.max(...answerCounts, 1)

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex flex-col p-4 gap-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-white/10 text-white text-sm font-bold px-3 py-1.5 rounded-full">
              {session.current_question_index + 1} / {questions.length}
            </span>
            {currentQuestion.points_multiplier > 1 && (
              <span className="bg-yellow-400 text-yellow-900 text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                <Zap className="w-3 h-3" /> ×{currentQuestion.points_multiplier}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <Users className="w-4 h-4" />
            <span>{answerCount} / {participants.length} responderam</span>
          </div>
        </div>

        {/* Timer */}
        <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${timerColor} rounded-full transition-all duration-100`}
            style={{ width: `${100 - progressPct}%` }}
          />
        </div>
        <div className="text-center">
          <span className="text-6xl font-black text-white tabular-nums">{Math.ceil(timeLeft)}</span>
        </div>

        {/* Question */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-4xl mx-auto w-full">
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6 w-full border border-white/20">
            <p className="text-white text-2xl md:text-3xl font-bold text-center leading-tight">
              {currentQuestion.question_text}
            </p>
          </div>

          {/* Answer distribution bars */}
          <div className="grid grid-cols-2 gap-3 w-full">
            {options.map((opt, i) => (
              <div key={i} className={`rounded-2xl p-4 ${OPTION_COLORS[i]} relative overflow-hidden`}>
                <div
                  className="absolute bottom-0 left-0 right-0 bg-black/20 transition-all duration-300"
                  style={{ height: `${(answerCounts[i] / maxCount) * 100}%` }}
                />
                <div className="relative flex items-center justify-between">
                  <span className="text-white font-black text-lg">{OPTION_LABELS[i]}</span>
                  <span className="text-white font-black text-2xl">{answerCounts[i]}</span>
                </div>
                <p className="relative text-white/90 text-sm font-semibold mt-1 line-clamp-2">{opt}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleAdvance}
          className="mx-auto bg-white text-purple-900 font-black px-8 py-3 rounded-2xl hover:bg-purple-50 transition-all flex items-center gap-2"
        >
          Ver resultados <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    )
  }

  // ── QUESTION RESULTS ───────────────────────────────────────────
  if (session.status === 'question_results' && currentQuestion) {
    const options = [currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d]
    const correctIdx = ['A', 'B', 'C', 'D'].indexOf(currentQuestion.correct_option)
    const answerCounts = ['A', 'B', 'C', 'D'].map((opt) =>
      answers.filter((a) => a.chosen_option === opt).length
    )
    const maxCount = Math.max(...answerCounts, 1)
    const isLastQuestion = session.current_question_index >= questions.length - 1

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex flex-col p-4 gap-5">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-purple-300 text-sm font-bold uppercase tracking-wider">Resposta correcta</p>
          <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl ${OPTION_COLORS[correctIdx]}`}>
            <CheckCircle2 className="w-5 h-5 text-white" />
            <span className="text-white font-black text-xl">{options[correctIdx]}</span>
          </div>
          <p className="text-white/60 text-sm">{correctCount} de {participants.length} acertou</p>
        </div>

        {/* Bar chart */}
        <div className="grid grid-cols-4 gap-2 items-end h-40 max-w-2xl mx-auto w-full">
          {options.map((opt, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-white font-black text-sm">{answerCounts[i]}</span>
              <div
                className={`w-full rounded-xl transition-all duration-500 ${OPTION_COLORS[i]} ${i !== correctIdx ? 'opacity-40' : ''}`}
                style={{ height: `${Math.max(8, (answerCounts[i] / maxCount) * 120)}px` }}
              />
              <span className="text-white/60 text-xs font-bold">{OPTION_LABELS[i].split(' ')[0]}</span>
            </div>
          ))}
        </div>

        {/* Leaderboard preview */}
        <div className="max-w-md mx-auto w-full bg-white/10 rounded-2xl p-4 border border-white/20">
          <p className="text-purple-300 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Classificação
          </p>
          <div className="space-y-1.5">
            {leaderboard.slice(0, 5).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className={`text-sm font-black w-5 text-center ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-white/40'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-white text-sm font-semibold truncate">{p.display_name}</span>
                <span className="text-purple-200 text-sm font-black tabular-nums">{p.total_points.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleAdvance}
          className="mx-auto bg-white text-purple-900 font-black px-10 py-4 rounded-2xl hover:bg-purple-50 transition-all text-lg flex items-center gap-2 shadow-xl"
        >
          {isLastQuestion ? '🏆 Ver pódio' : <>Próxima <ChevronRight className="w-5 h-5" /></>}
        </button>
      </div>
    )
  }

  // ── FINISHED / PODIUM ──────────────────────────────────────────
  if (session.status === 'finished') {
    const podium = [...participants].sort((a, b) => b.total_points - a.total_points)
    const medals = ['🥇', '🥈', '🥉']

    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-900 flex flex-col items-center p-6 gap-8">
        <img src="/images/VanaQuest.png" alt="VanaQuest" className="w-16 h-16 object-contain" />
        <h1 className="text-4xl font-black text-white">🏆 Pódio Final</h1>

        {/* Top 3 */}
        <div className="flex items-end gap-4 max-w-lg w-full">
          {[1, 0, 2].map((rank) => {
            const p = podium[rank]
            if (!p) return <div key={rank} className="flex-1" />
            const heights = ['h-28', 'h-36', 'h-24']
            const colors = ['bg-gray-400', 'bg-yellow-400', 'bg-amber-600']
            return (
              <div key={p.id} className={`flex-1 ${colors[rank]} rounded-t-2xl ${heights[rank]} flex flex-col items-center justify-end pb-3 gap-1`}>
                <span className="text-2xl">{medals[rank]}</span>
                <span className="text-white font-black text-sm text-center px-2 leading-tight">{p.display_name}</span>
                <span className="text-white/80 text-xs font-bold">{p.total_points.toFixed(1)} pts</span>
              </div>
            )
          })}
        </div>

        {/* Full leaderboard */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/20 w-full max-w-md">
          {podium.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-white/10 last:border-0">
              <span className="text-sm font-black w-6 text-center text-white/50">{i < 3 ? medals[i] : i + 1}</span>
              <span className="flex-1 text-white font-semibold text-sm truncate">{p.display_name}</span>
              <span className="text-xs text-purple-300">{p.correct_answers} ✓</span>
              <span className="text-purple-200 font-black text-sm tabular-nums">{p.total_points.toFixed(1)}</span>
            </div>
          ))}
        </div>

        {!awarded && (
          <button
            onClick={handleAward}
            disabled={awarding}
            className="bg-yellow-400 text-yellow-900 font-black text-lg px-10 py-4 rounded-2xl hover:bg-yellow-300 disabled:opacity-60 transition-all shadow-xl flex items-center gap-3"
          >
            {awarding ? 'A atribuir...' : '⭐ Atribuir XP e Gold'}
          </button>
        )}
        {awarded && (
          <div className="bg-green-500/20 border border-green-400/30 rounded-2xl px-6 py-4 text-green-200 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> XP e Gold atribuídos com sucesso!
          </div>
        )}

        <a href="/admin/vana-quest" className="text-purple-300 underline text-sm">Voltar à gestão</a>
      </div>
    )
  }

  return null
}
