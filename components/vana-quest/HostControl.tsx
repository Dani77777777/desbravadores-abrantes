'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { nextStage, awardSessionPoints } from '@/lib/actions/vana-quest'
import { getIntroSeconds } from '@/utils/vana-quest'
import { QRCodeSVG } from 'qrcode.react'
import {
  Users, ChevronRight, Trophy, Zap, Clock, Maximize2,
  CheckCircle2, Flame, Play, MonitorPlay, Copy, Check, Volume2, VolumeX, Share2, Download
} from 'lucide-react'
import { PodiumShareCard } from './PodiumShareCard'
import { detectGender, articleFor, winnerWord } from '@/utils/name-gender'
import { PlayerAvatar } from './PlayerAvatar'

const OPTION_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-yellow-400', 'bg-green-500']
const OPTION_LABELS = ['▲ A', '● B', '◆ C', '■ D']

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
  correct_answers: number
  current_streak: number
  max_streak: number
  is_guest: boolean
  avatar_url?: string | null
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

export function HostControl({ sessionId, initialSession, questions, siteUrl }: Props) {
  const supabase = createClient()
  const [session, setSession] = useState<Session>(initialSession)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [qrZoomed, setQrZoomed] = useState(false)
  const [awarding, setAwarding] = useState(false)
  const [awarded, setAwarded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const inFlight = useRef(false)
  const podiumCardRef = useRef<HTMLDivElement | null>(null)

  async function handleSharePodium() {
    if (sharing) return
    setSharing(true)
    setShareToast(null)
    try {
      const { toPng } = await import('html-to-image')
      const node = podiumCardRef.current
      if (!node) throw new Error('Card não pronto')

      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#0c1a3d',
      })

      const questTitle = (initialSession.vana_quests as any)?.title || 'VanaQuest'
      const fileName = `podio-${questTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now()}.png`

      // Construir texto motivacional
      const podium = [...participants].sort((a, b) => b.total_points - a.total_points)
      const winner = podium[0]
      const today = new Date().toLocaleDateString('pt-PT', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
      let text: string
      if (winner) {
        const gender = detectGender(winner.display_name)
        const article = articleFor(gender) // o / a
        const word = winnerWord(gender)    // vencedor / vencedora
        const firstName = winner.display_name.split(' ')[0]
        text = `🎯 VanaQuest "${questTitle}" — ${today}\n\n👑 ${article.toUpperCase()} ${word} foi ${article} ${firstName} com ${winner.total_points.toFixed(1)} pontos!\n\nNão participaste? Junta-te ao próximo VanaQuest e podes ser tu ${article === 'a' ? 'a próxima' : 'o próximo'} a brilhar! 🌟`
      } else {
        text = `🎯 VanaQuest "${questTitle}" — ${today}\n\nNão percas o próximo desafio! 🌟`
      }

      // Tentar Web Share API (mobile)
      try {
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `🏆 Pódio Final — ${questTitle}`,
            text,
          })
          setShareToast('Partilhado!')
          return
        }
      } catch {
        // ignora, faz download
      }

      // Fallback: download
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = fileName
      link.click()
      setShareToast('Imagem transferida!')
    } catch (e) {
      setShareToast('Erro ao gerar imagem')
    } finally {
      setSharing(false)
      setTimeout(() => setShareToast(null), 3000)
    }
  }
  // Pontos do jogador no início do leaderboard (para calcular delta da última ronda)
  const prevPointsRef = useRef<Record<string, number>>({})
  // Capturar os deltas ao entrar no leaderboard (e congelar até sair)
  const [deltas, setDeltas] = useState<Record<string, number>>({})

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const broadcastRef = useRef<any>(null)

  const currentQuestion = session.current_question_index >= 0
    ? questions[session.current_question_index]
    : null
  const joinUrl = `${siteUrl}/jogos/vana-quest?pin=${session.pin}`
  const presentUrl = `${siteUrl}/jogos/vana-quest/${sessionId}/present`

  // Broadcast channel for presentation commands
  useEffect(() => {
    const ch = supabase.channel(`vq-present-${sessionId}`, { config: { broadcast: { self: false } } })
    ch.subscribe()
    broadcastRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  function broadcast(payload: Record<string, any>) {
    broadcastRef.current?.send({ type: 'broadcast', event: 'cmd', payload })
  }

  // Sync QR zoom to presentation whenever it changes
  useEffect(() => {
    broadcast({ qrZoomed })
  }, [qrZoomed])

  // Sync music on/off to presentation
  useEffect(() => {
    broadcast({ musicEnabled })
  }, [musicEnabled])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`control-${sessionId}`)
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

  // Load initial
  useEffect(() => {
    supabase.from('vana_quest_participants').select('*').eq('session_id', sessionId)
      .then(({ data }) => { if (data) setParticipants(data) })
  }, [sessionId])

  useEffect(() => {
    if (!currentQuestion) return
    supabase.from('vana_quest_answers').select('*').eq('session_id', sessionId).eq('question_id', currentQuestion.id)
      .then(({ data }) => { if (data) setAnswers(data) })
  }, [currentQuestion?.id, sessionId])

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (session.status === 'question_active' && currentQuestion && session.question_started_at) {
      const end = new Date(session.question_started_at).getTime() + currentQuestion.time_seconds * 1000
      timerRef.current = setInterval(() => {
        const r = Math.max(0, (end - Date.now()) / 1000)
        setTimeLeft(r)
        if (r === 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          // Auto-advance to results
          handleNext()
        }
      }, 100)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [session.status, session.question_started_at, currentQuestion?.id])

  // Auto-advance intro — tempo proporcional ao tamanho da pergunta
  // (+ 2.8s extra para o aviso x2/x3)
  useEffect(() => {
    if (session.status === 'question_intro' && currentQuestion) {
      const hasMultiplier = currentQuestion.points_multiplier > 1
      const introSec = getIntroSeconds(currentQuestion.question_text)
      const delay = introSec * 1000 + (hasMultiplier ? 2800 : 0)
      const t = setTimeout(() => handleNext(), delay)
      return () => clearTimeout(t)
    }
  }, [session.status, session.current_question_index, currentQuestion?.id])

  // Auto-advance quest intro after 4s
  useEffect(() => {
    if (session.status === 'quest_intro') {
      const t = setTimeout(() => handleNext(), 4000)
      return () => clearTimeout(t)
    }
  }, [session.status])

  // Capturar deltas (pontos ganhos nesta ronda) quando entramos no leaderboard
  useEffect(() => {
    if (session.status === 'question_leaderboard') {
      const d: Record<string, number> = {}
      participants.forEach((p) => {
        d[p.id] = Number(p.total_points) - (prevPointsRef.current[p.id] ?? 0)
      })
      setDeltas(d)
      // Atualiza o snapshot para a próxima ronda
      const snap: Record<string, number> = {}
      participants.forEach((p) => { snap[p.id] = Number(p.total_points) })
      prevPointsRef.current = snap
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status])

  // Auto-advance when all players have answered (during question_active)
  useEffect(() => {
    if (session.status !== 'question_active' || !currentQuestion) return
    if (participants.length === 0) return
    const answeredCount = answers.filter((a) => a.question_id === currentQuestion.id).length
    if (answeredCount >= participants.length) {
      handleNext()
    }
  }, [session.status, answers.length, participants.length, currentQuestion?.id])

  async function handleNext() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await nextStage(sessionId)
    } finally {
      setTimeout(() => {
        inFlight.current = false
        setBusy(false)
      }, 300)
    }
  }

  async function handleAward() {
    setAwarding(true)
    const result = await awardSessionPoints(sessionId)
    if (result?.ok || result?.alreadyAwarded) {
      setAwarded(true)
    }
    setAwarding(false)
  }

  const currentAnswers = currentQuestion ? answers.filter((a) => a.question_id === currentQuestion.id) : []
  const answerCounts = ['A', 'B', 'C', 'D'].map((opt) => currentAnswers.filter((a) => a.chosen_option === opt).length)
  const correctIdx = currentQuestion ? ['A', 'B', 'C', 'D'].indexOf(currentQuestion.correct_option) : -1

  // ── STATUS LABELS ─────────────────────────────────────────────
  const statusInfo: Record<string, { label: string; color: string; nextLabel: string }> = {
    waiting: { label: 'Sala de espera', color: 'bg-blue-500', nextLabel: 'Iniciar jogo' },
    quest_intro: { label: 'Intro do quiz', color: 'bg-blue-500', nextLabel: '(auto em 4s)' },
    question_intro: { label: 'A mostrar pergunta', color: 'bg-blue-500', nextLabel: '(auto em 4s)' },
    question_active: { label: 'Tempo de resposta', color: 'bg-green-500', nextLabel: 'Mostrar resultado' },
    question_results: { label: 'Resposta correcta', color: 'bg-yellow-500', nextLabel: session.current_question_index >= questions.length - 1 ? '🏆 Revelar pódio final' : 'Mostrar classificação' },
    question_leaderboard: { label: 'Classificação', color: 'bg-orange-500', nextLabel: 'Próxima pergunta' },
    finished: { label: 'Jogo terminado', color: 'bg-gray-500', nextLabel: '' },
  }
  const currentStatus = statusInfo[session.status] || statusInfo.waiting

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 text-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10 bg-black/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/images/VanaQuest.png" alt="" className="w-7 h-7 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sky-300 text-[10px] font-bold uppercase tracking-widest">Controlo</p>
              <p className="font-bold text-sm truncate">{(initialSession.vana_quests as any)?.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Toggle música — controla a /present */}
            <button
              onClick={() => setMusicEnabled((v) => !v)}
              title={musicEnabled ? 'Música ligada (clica para desligar)' : 'Música desligada (clica para ligar)'}
              className={`p-2 rounded-xl transition-colors ${
                musicEnabled
                  ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                  : 'bg-white/10 text-white/50 hover:bg-white/20'
              }`}
            >
              {musicEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            {/* Abrir apresentação — só desktop */}
            <a
              href={presentUrl}
              target="_blank"
              rel="noopener"
              className="hidden sm:flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
            >
              <MonitorPlay className="w-3.5 h-3.5" /> Abrir apresentação
            </a>
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 mt-3">
          <span className={`w-2 h-2 rounded-full ${currentStatus.color} animate-pulse`} />
          <span className="text-xs font-semibold text-white/70">{currentStatus.label}</span>
          {session.current_question_index >= 0 && session.status !== 'finished' && (
            <span className="text-xs text-white/40 ml-auto">
              {session.current_question_index + 1} / {questions.length}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-md mx-auto pb-32">

        {/* WAITING STATE: PIN + QR + players */}
        {session.status === 'waiting' && (
          <>
            <div className="bg-white/10 rounded-3xl p-5 text-center border border-white/10">
              <p className="text-sky-300 text-[10px] font-black uppercase tracking-[0.2em] mb-2">PIN do jogo</p>
              <p className="text-5xl font-black tracking-[0.15em] tabular-nums">{session.pin}</p>
              <p className="text-sky-400 text-xs mt-2">
                {siteUrl.replace(/^https?:\/\//, '')}/jogos/vana-quest
              </p>
            </div>

            {/* Copy direct link */}
            <button
              onClick={copyLink}
              className={`w-full rounded-3xl p-4 flex items-center gap-3 shadow-lg active:scale-[0.98] transition-all ${
                copied ? 'bg-green-500 text-white' : 'bg-white/10 text-white border border-white/10 hover:bg-white/15'
              }`}
            >
              <div className={`p-2.5 rounded-xl flex-shrink-0 ${copied ? 'bg-white/20' : 'bg-blue-500/30'}`}>
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5 text-sky-200" />}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-bold text-sm">{copied ? 'Link copiado!' : 'Copiar link direto'}</p>
                <p className={`text-xs truncate ${copied ? 'text-white/70' : 'text-sky-400'}`}>
                  {copied ? 'Cola onde quiseres partilhar' : joinUrl.replace(/^https?:\/\//, '')}
                </p>
              </div>
            </button>

            <button
              onClick={() => setQrZoomed((v) => !v)}
              className={`w-full rounded-3xl p-4 flex items-center gap-4 shadow-lg active:scale-[0.98] transition-all ${
                qrZoomed
                  ? 'bg-yellow-400 text-yellow-900'
                  : 'bg-white text-gray-900'
              }`}
            >
              <div className={`p-3 rounded-2xl ${qrZoomed ? 'bg-yellow-900/10' : 'bg-gray-100'}`}>
                <Maximize2 className={`w-6 h-6 ${qrZoomed ? 'text-yellow-900' : 'text-gray-700'}`} />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-sm">
                  {qrZoomed ? 'A mostrar QR Code grande' : 'Ampliar QR Code na apresentação'}
                </p>
                <p className={`text-xs ${qrZoomed ? 'text-yellow-900/70' : 'text-gray-500'}`}>
                  {qrZoomed ? 'Toca para fechar' : 'Toca para ampliar no projetor'}
                </p>
              </div>
              {qrZoomed && (
                <div className="w-2 h-2 bg-yellow-900 rounded-full animate-pulse" />
              )}
            </button>

            <div className="bg-white/10 rounded-3xl p-4 border border-white/10">
              <p className="text-sky-300 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> {participants.length} jogador{participants.length !== 1 ? 'es' : ''}
              </p>
              {participants.length === 0 ? (
                <p className="text-sky-400 text-sm text-center py-4">À espera...</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                      <PlayerAvatar
                        name={p.display_name}
                        avatarUrl={p.avatar_url}
                        className="w-6 h-6"
                        textClassName="text-[10px]"
                        fallbackBg="bg-blue-500/40"
                      />
                      <span className="text-sm font-semibold truncate flex-1">{p.display_name}</span>
                      {p.is_guest && <span className="text-[9px] text-sky-400 bg-blue-500/10 rounded-full px-1.5 py-0.5">conv.</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* QUEST INTRO (only at the very start) */}
        {session.status === 'quest_intro' && (
          <div className="bg-white/10 rounded-3xl p-5 border border-white/10 space-y-3 text-center">
            <img src="/images/VanaQuest.png" alt="" className="w-16 h-16 object-contain mx-auto" />
            <p className="text-sky-300 text-[10px] font-black uppercase tracking-widest">Intro do quiz</p>
            <p className="font-black text-xl">{(initialSession.vana_quests as any)?.title}</p>
            <p className="text-sky-400 text-xs italic">Avança automaticamente em 4 segundos...</p>
          </div>
        )}

        {/* QUESTION INTRO — pergunta + preview das opções (para o host poder ler) */}
        {session.status === 'question_intro' && currentQuestion && (
          <div className="bg-white/10 rounded-3xl p-5 border border-white/10 space-y-3">
            <p className="text-sky-300 text-[10px] font-black uppercase tracking-widest">A mostrar pergunta</p>
            <p className="font-semibold text-base leading-snug">{currentQuestion.question_text}</p>

            {/* Preview das opções em 2x2 */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d].map((opt, i) => {
                const isCorrect = correctIdx === i
                return (
                  <div
                    key={i}
                    className={`${OPTION_COLORS[i]} rounded-xl p-2.5 flex items-start gap-2 shadow ${isCorrect ? 'ring-2 ring-white/80' : 'opacity-90'}`}
                  >
                    <span className="text-white font-black text-sm flex-shrink-0">{OPTION_LABELS[i]}</span>
                    <p className="text-white text-xs font-semibold leading-snug flex-1">{opt}</p>
                    {isCorrect && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-white flex-shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-3 text-xs text-sky-300 pt-1">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {currentQuestion.time_seconds}s</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> ×{currentQuestion.points_multiplier}</span>
            </div>
            <p className="text-sky-400 text-xs italic">
              Avança automaticamente em {getIntroSeconds(currentQuestion.question_text) + (currentQuestion.points_multiplier > 1 ? 3 : 0)} segundos...
            </p>
          </div>
        )}

        {/* QUESTION ACTIVE: timer + answers distribution (visible to host only) */}
        {session.status === 'question_active' && currentQuestion && (
          <div className="space-y-3">
            <div className="bg-white/10 rounded-3xl p-4 border border-white/10 text-center">
              <div className="text-5xl font-black tabular-nums">{Math.ceil(timeLeft)}</div>
              <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    timeLeft > currentQuestion.time_seconds * 0.5 ? 'bg-green-400' :
                    timeLeft > currentQuestion.time_seconds * 0.25 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${(timeLeft / currentQuestion.time_seconds) * 100}%` }}
                />
              </div>
              <p className="text-sky-300 text-xs mt-2 flex items-center justify-center gap-1.5">
                <Users className="w-3 h-3" /> {currentAnswers.length} / {participants.length} responderam
              </p>
            </div>

            <div className="bg-white/10 rounded-3xl p-4 border border-white/10">
              <p className="text-sky-300 text-[10px] font-black uppercase tracking-widest mb-2">Pergunta</p>
              <p className="text-sm font-semibold mb-3">{currentQuestion.question_text}</p>
              <div className="grid grid-cols-2 gap-2">
                {[currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d].map((opt, i) => (
                  <div key={i} className={`${OPTION_COLORS[i]} rounded-xl p-2.5 text-white ${i === correctIdx ? 'ring-2 ring-white' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">{OPTION_LABELS[i]}</span>
                      <span className="font-black text-base">{answerCounts[i]}</span>
                    </div>
                    <p className="text-[11px] mt-1 leading-snug">{opt}</p>
                    {i === correctIdx && (
                      <p className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">✓ correcta</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* RESULTS — resposta correcta + distribuição compacta */}
        {session.status === 'question_results' && currentQuestion && (() => {
          const opts = [currentQuestion.option_a, currentQuestion.option_b, currentQuestion.option_c, currentQuestion.option_d]
          const maxCount = Math.max(...answerCounts, 1)
          return (
            <div className="bg-white/10 rounded-3xl p-5 border border-white/10 space-y-3">
              <p className="text-yellow-400 text-[10px] font-black uppercase tracking-widest">Resposta correcta</p>
              <div className={`${OPTION_COLORS[correctIdx]} rounded-2xl p-4 flex items-center gap-3`}>
                <CheckCircle2 className="w-6 h-6 text-white flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black text-white/80">{OPTION_LABELS[correctIdx]}</p>
                  <p className="font-bold text-white text-sm">{opts[correctIdx]}</p>
                </div>
              </div>

              {/* Distribuição compacta — uma barra por opção */}
              <div className="space-y-1.5 pt-1">
                <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-1">
                  Distribuição
                </p>
                {opts.map((opt, i) => {
                  const count = answerCounts[i]
                  const pct = (count / maxCount) * 100
                  const isCorrect = i === correctIdx
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`w-6 h-6 ${OPTION_COLORS[i]} rounded flex items-center justify-center text-white text-xs font-black flex-shrink-0`}>
                        {OPTION_LABELS[i].split(' ')[0]}
                      </span>
                      <div className="flex-1 relative h-6 rounded-lg bg-white/5 overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 ${OPTION_COLORS[i]} ${isCorrect ? 'opacity-100' : 'opacity-40'} transition-all`}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                        <div className="relative h-full flex items-center justify-between px-2 text-[11px]">
                          <span className={`font-semibold truncate ${pct > 30 ? 'text-white' : 'text-white/70'}`}>{opt}</span>
                          <span className={`font-black tabular-nums shrink-0 ml-2 ${pct > 30 ? 'text-white' : 'text-white/70'}`}>{count}</span>
                        </div>
                      </div>
                      {isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                    </div>
                  )
                })}
              </div>

              <p className="text-sky-300 text-xs text-center pt-1">
                {currentAnswers.filter((a) => a.is_correct).length} de {participants.length} acertaram
                {currentAnswers.length < participants.length && (
                  <span className="text-white/40"> · {participants.length - currentAnswers.length} sem resposta</span>
                )}
              </p>
            </div>
          )
        })()}

        {/* LEADERBOARD — vista completa para o host */}
        {session.status === 'question_leaderboard' && (() => {
          const sorted = [...participants].sort((a, b) => b.total_points - a.total_points)
          const medals = ['🥇', '🥈', '🥉']
          return (
            <div className="bg-white/10 rounded-3xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-orange-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <Trophy className="w-3 h-3" /> Classificação
                </p>
                <p className="text-white/40 text-[10px] font-bold">
                  {participants.length} jogador{participants.length !== 1 ? 'es' : ''}
                </p>
              </div>

              <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                {sorted.map((p, i) => {
                  const delta = deltas[p.id] || 0
                  const showDelta = delta > 0.005

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                        i === 0 ? 'bg-yellow-400/15 border-yellow-400/30' :
                        i === 1 ? 'bg-gray-300/10 border-gray-300/20' :
                        i === 2 ? 'bg-amber-600/15 border-amber-600/30' :
                        'bg-white/5 border-white/10'
                      }`}
                    >
                      {/* Posição */}
                      <div className="flex-shrink-0 w-7 text-center">
                        {i < 3 ? (
                          <span className="text-xl leading-none">{medals[i]}</span>
                        ) : (
                          <span className="text-sm font-black text-white/40 tabular-nums">{i + 1}</span>
                        )}
                      </div>

                      {/* Avatar */}
                      <PlayerAvatar
                        name={p.display_name}
                        avatarUrl={p.avatar_url}
                        className="w-9 h-9"
                        textClassName="text-xs"
                        fallbackBg="bg-blue-500/40"
                      />

                      {/* Nome + sub-info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm truncate">{p.display_name}</p>
                          {p.is_guest && (
                            <span className="text-[8px] uppercase tracking-wider text-sky-400 bg-sky-500/10 rounded-full px-1.5 py-0.5 flex-shrink-0">
                              conv.
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 text-[11px] text-white/50 mt-0.5">
                          <span className="flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                            <span className="font-bold">{p.correct_answers}</span>
                          </span>
                          {p.current_streak >= 2 && (
                            <span className="flex items-center gap-0.5 text-orange-400 font-bold">
                              <Flame className="w-3 h-3" /> ×{p.current_streak}
                            </span>
                          )}
                          {p.max_streak >= 2 && p.max_streak !== p.current_streak && (
                            <span className="text-amber-300/70 font-bold">
                              máx ×{p.max_streak}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Pontos + delta */}
                      <div className="flex-shrink-0 text-right">
                        <p className="font-black text-lg tabular-nums leading-none">{p.total_points.toFixed(1)}</p>
                        {showDelta ? (
                          <p className="text-green-400 text-[10px] font-black tabular-nums mt-0.5">
                            +{delta.toFixed(1)}
                          </p>
                        ) : (
                          <p className="text-white/30 text-[10px] mt-0.5">—</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* EM CHAMAS — jogadores com a streak mais alta */}
        {session.status === 'question_leaderboard' && (() => {
          const maxStreak = Math.max(...participants.map((p) => p.current_streak || 0), 0)
          if (maxStreak < 2) return null
          const onFire = participants.filter((p) => (p.current_streak || 0) === maxStreak)
          return (
            <div className="bg-white/5 rounded-3xl border border-orange-400/30 p-4">
              <p className="text-orange-300 text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" /> Em chamas! ×{maxStreak} streak
              </p>
              <div className="flex flex-wrap gap-2">
                {onFire.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 bg-orange-500/20 border border-orange-400/30 rounded-full pl-1 pr-3 py-1">
                    <PlayerAvatar
                      name={p.display_name}
                      avatarUrl={p.avatar_url}
                      className="w-6 h-6"
                      textClassName="text-[10px]"
                      fallbackBg="bg-orange-500/40"
                    />
                    <span className="text-white font-bold text-sm">{p.display_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* PRÓXIMA PERGUNTA — preview por baixo da classificação */}
        {session.status === 'question_leaderboard' && (() => {
          const nextIdx = session.current_question_index + 1
          const nextQ = questions[nextIdx]
          const isLast = !nextQ

          if (isLast) {
            return (
              <div className="bg-gradient-to-r from-yellow-400 to-amber-500 rounded-3xl p-4 shadow-lg flex items-center gap-3">
                <div className="text-4xl">🏆</div>
                <div className="flex-1">
                  <p className="text-yellow-900 text-[10px] font-black uppercase tracking-widest">A seguir</p>
                  <p className="text-yellow-900 font-black text-base sm:text-lg">Pódio final!</p>
                </div>
              </div>
            )
          }

          const mult = nextQ.points_multiplier
          const multStyle = mult === 3
            ? { bg: 'from-orange-400 to-red-500', label: '×3 TRIPLO', icon: '⚡⚡⚡' }
            : mult === 2
              ? { bg: 'from-yellow-300 to-amber-500', label: '×2 DUPLO', icon: '⚡⚡' }
              : { bg: 'from-blue-700 to-indigo-700', label: 'Normal', icon: '◆' }

          return (
            <div className={`bg-gradient-to-r ${multStyle.bg} rounded-3xl p-4 shadow-lg`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${mult > 1 ? 'text-yellow-900' : 'text-blue-200'}`}>
                    Próxima pergunta ({nextIdx + 1}/{questions.length})
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`font-black text-base sm:text-lg ${mult > 1 ? 'text-yellow-900' : 'text-white'}`}>
                      {multStyle.label}
                    </span>
                    {mult > 1 && (
                      <span className="text-yellow-900/80 font-bold text-xs">
                        · max {10 * mult} pts
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-1 flex items-center gap-1 ${mult > 1 ? 'text-yellow-900/80' : 'text-blue-200'}`}>
                    <Clock className="w-3 h-3" /> {nextQ.time_seconds}s
                  </p>
                </div>
                <div className={`text-3xl sm:text-4xl flex-shrink-0 ${mult > 1 ? 'drop-shadow-lg' : 'opacity-70'}`}>
                  {multStyle.icon}
                </div>
              </div>
            </div>
          )
        })()}

        {/* FINISHED */}
        {session.status === 'finished' && (
          <div className="space-y-3">
            <div className="bg-white/10 rounded-3xl p-5 border border-white/10 text-center">
              <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
              <p className="font-black text-xl">Jogo terminado!</p>
              <p className="text-sky-300 text-sm">{participants.length} jogador{participants.length !== 1 ? 'es' : ''}</p>
            </div>

            {/* Classificação final completa */}
            {participants.length > 0 && (() => {
              const podium = [...participants].sort((a, b) => b.total_points - a.total_points)
              const medals = ['🥇', '🥈', '🥉']
              return (
                <div className="bg-white/10 rounded-3xl p-4 border border-white/10">
                  <p className="text-orange-400 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Trophy className="w-3 h-3" /> Classificação final
                  </p>
                  <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                    {podium.map((p, i) => {
                      const gold = Math.round(Number(p.total_points))
                      const xp = gold * 2
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                            i === 0 ? 'bg-yellow-400/15 border-yellow-400/30' :
                            i === 1 ? 'bg-gray-300/10 border-gray-300/20' :
                            i === 2 ? 'bg-amber-600/15 border-amber-600/30' :
                            'bg-white/5 border-white/10'
                          }`}
                        >
                          <div className="flex-shrink-0 w-7 text-center">
                            {i < 3 ? (
                              <span className="text-xl leading-none">{medals[i]}</span>
                            ) : (
                              <span className="text-sm font-black text-white/40 tabular-nums">{i + 1}</span>
                            )}
                          </div>
                          <PlayerAvatar
                            name={p.display_name}
                            avatarUrl={p.avatar_url}
                            className="w-9 h-9"
                            textClassName="text-xs"
                            fallbackBg="bg-blue-500/40"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-sm truncate">{p.display_name}</p>
                              {p.is_guest && (
                                <span className="text-[8px] uppercase tracking-wider text-sky-400 bg-sky-500/10 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                  conv.
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2.5 text-[11px] text-white/50 mt-0.5">
                              <span className="flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3 text-green-400" />
                                <span className="font-bold">{p.correct_answers}</span>
                              </span>
                              {p.max_streak >= 2 && (
                                <span className="flex items-center gap-0.5 text-amber-300 font-bold">
                                  <Flame className="w-3 h-3" /> máx ×{p.max_streak}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="font-black text-lg tabular-nums leading-none">{Number(p.total_points).toFixed(1)}</p>
                            {gold > 0 && (
                              <p className="text-[10px] mt-0.5 leading-none">
                                <span className="text-yellow-400 font-bold">+{gold}🪙</span>
                                <span className="text-blue-300 font-bold ml-1">+{xp}⭐</span>
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {!awarded ? (
              <button
                onClick={handleAward}
                disabled={awarding}
                className="w-full bg-yellow-400 text-yellow-900 font-black text-lg py-4 rounded-2xl hover:bg-yellow-300 disabled:opacity-50 transition-all shadow-xl"
              >
                {awarding ? 'A atribuir...' : '⭐ Atribuir XP e Gold'}
              </button>
            ) : (
              <div className="bg-green-500/20 border border-green-400/30 rounded-2xl p-4 text-green-200 font-bold text-center text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Prémios atribuídos
              </div>
            )}

            {/* Botão de partilha do pódio */}
            <button
              onClick={handleSharePodium}
              disabled={sharing || participants.length === 0}
              className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-50 border border-white/15 font-bold text-base py-3 rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              {sharing ? (
                <>A gerar imagem...</>
              ) : (
                <>
                  <Share2 className="w-4 h-4" /> Partilhar pódio
                </>
              )}
            </button>
            {shareToast && (
              <div className="bg-blue-500/20 border border-blue-400/30 rounded-2xl p-3 text-blue-200 font-semibold text-center text-sm flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> {shareToast}
              </div>
            )}

            <a href="/admin/vana-quest" className="block text-center text-sky-300 underline text-sm py-2">Voltar à gestão</a>
          </div>
        )}
      </div>

      {/* Card escondido para captura (off-screen mas renderizado) */}
      {session.status === 'finished' && participants.length > 0 && (
        <div
          style={{
            position: 'fixed',
            left: '-99999px',
            top: 0,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <PodiumShareCard
            ref={podiumCardRef}
            participants={participants}
            questTitle={(initialSession.vana_quests as any)?.title || 'VanaQuest'}
          />
        </div>
      )}

      {/* Bottom fixed action bar */}
      {session.status !== 'finished' && session.status !== 'question_intro' && session.status !== 'quest_intro' && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent pt-6 pb-4 px-4 z-30">
          <div className="max-w-md mx-auto">
            <button
              onClick={handleNext}
              disabled={busy || (session.status === 'waiting' && participants.length === 0)}
              className="w-full bg-white text-blue-900 font-black text-lg py-4 rounded-2xl hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-2"
            >
              {session.status === 'waiting' ? <Play className="w-5 h-5" /> : null}
              {currentStatus.nextLabel}
              {session.status !== 'waiting' && <ChevronRight className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
