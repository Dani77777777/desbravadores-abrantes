'use client'

import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import { QRCodeSVG } from 'qrcode.react'
import { Users, Trophy, Zap, Flame, CheckCircle2 } from 'lucide-react'
import { PlayerAvatar } from './PlayerAvatar'
import { useLiveSession } from './useLiveSession'
import { getIntroSeconds, questionFontSize, optionFontSize } from '@/utils/vana-quest'
import { CinematicPodium } from '@/components/game-podium/CinematicPodium'
import { ProjectorLobbyScreen } from '@/components/game-lobby/ProjectorLobby'
import { GameReactionsOverlay } from '@/components/game-lobby/GameReactions'
import { enterFullscreen } from '@/utils/fullscreen'

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
  explanation: string | null
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

export function Presentation({ sessionId, initialSession, questions, siteUrl }: Props) {
  const supabase = createClient()
  const [session, setSession] = useState<Session>(initialSession)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantsLoaded, setParticipantsLoaded] = useState(false)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [introCountdown, setIntroCountdown] = useState(4)
  const [qrZoomed, setQrZoomed] = useState(false)
  const [showMultiplierWarning, setShowMultiplierWarning] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [answerPulseKey, setAnswerPulseKey] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Snapshot of points shown last time (per participant id) — used to animate from previous → new
  // Persistido em localStorage para sobreviver a refresh
  const prevPointsStorageKey = `vq-prevpts-${sessionId}`
  const prevPointsRef = useRef<Record<string, number>>({})
  // Carrega prev points do localStorage no primeiro render (client only)
  if (typeof window !== 'undefined' && Object.keys(prevPointsRef.current).length === 0) {
    try {
      const raw = window.localStorage.getItem(prevPointsStorageKey)
      if (raw) prevPointsRef.current = JSON.parse(raw)
    } catch {}
  }
  const savePrevPoints = () => {
    try {
      window.localStorage.setItem(prevPointsStorageKey, JSON.stringify(prevPointsRef.current))
    } catch {}
  }
  // Audio refs
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const sfxAnsweredRef = useRef<HTMLAudioElement | null>(null)
  const sfxLightningRef = useRef<HTMLAudioElement | null>(null)
  const sfxEarningRef = useRef<HTMLAudioElement | null>(null)
  const sfxEndRef = useRef<HTMLAudioElement | null>(null)
  const currentTrackRef = useRef<string>('')
  const knownAnswersRef = useRef<Set<string>>(new Set())

  const currentQuestion = session.current_question_index >= 0
    ? questions[session.current_question_index]
    : null
  const joinUrl = `${siteUrl}/jogos/vana-quest?pin=${session.pin}`
  const lobbyPlayers = useMemo(
    () => participants.map((p) => ({ id: p.id, name: p.display_name, avatarUrl: p.avatar_url, isGuest: p.is_guest })),
    [participants]
  )

  // Snapshot dos pontos quando a pergunta arranca → para o leaderboard mostrar delta + tocar SFX
  const snapshotTakenForRef = useRef<string>('')
  useEffect(() => {
    if ((session.status === 'question_intro' || session.status === 'question_active') && currentQuestion) {
      const key = `${currentQuestion.id}`
      if (snapshotTakenForRef.current !== key) {
        snapshotTakenForRef.current = key
        const snap: Record<string, number> = {}
        participants.forEach((p) => { snap[p.id] = Number(p.total_points) || 0 })
        prevPointsRef.current = snap
        savePrevPoints()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status, currentQuestion?.id])

  // Broadcast listener (commands from control panel)
  useEffect(() => {
    const ch = supabase.channel(`vq-present-${sessionId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'cmd' }, ({ payload }) => {
      if (typeof payload?.qrZoomed === 'boolean') setQrZoomed(payload.qrZoomed)
      if (typeof payload?.musicEnabled === 'boolean') setMusicEnabled(payload.musicEnabled)
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  // Sessão sincronizada de forma resiliente (realtime + polling + refetch ao reconectar).
  // O projetor é um cliente só, mas também não pode ficar preso por um evento perdido.
  useLiveSession(
    sessionId,
    (row) => setSession((prev) => ({ ...prev, ...(row as Session) })),
    { pollMs: 3000 }
  )

  // Realtime (participantes + respostas). A sessão é tratada pela useLiveSession acima.
  useEffect(() => {
    const channel = supabase
      .channel(`present-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vana_quest_participants', filter: `session_id=eq.${sessionId}` },
        (p) => setParticipants((prev) => prev.find((x) => x.id === (p.new as Participant).id) ? prev : [...prev, p.new as Participant]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vana_quest_participants', filter: `session_id=eq.${sessionId}` },
        (p) => setParticipants((prev) => prev.map((x) => x.id === (p.new as Participant).id ? (p.new as Participant) : x)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'vana_quest_participants' },
        (p) => setParticipants((prev) => prev.filter((x) => x.id !== (p.old as any)?.id)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vana_quest_answers', filter: `session_id=eq.${sessionId}` },
        (p) => {
          const ans = p.new as Answer & { id?: string }
          const key = (ans as any).id || `${ans.participant_id}-${ans.question_id}`
          if (!knownAnswersRef.current.has(key)) {
            knownAnswersRef.current.add(key)
            playSfx(sfxAnsweredRef)
            setAnswerPulseKey((k) => k + 1)
          }
          setAnswers((prev) => [...prev, p.new as Answer])
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  useEffect(() => {
    supabase.from('vana_quest_participants').select('*').eq('session_id', sessionId)
      .then(({ data }) => {
        if (data) setParticipants(data)
        setParticipantsLoaded(true)
      })
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

  // Intro countdown — começa só DEPOIS do aviso de multiplicador (se houver)
  // Tempo proporcional ao tamanho da pergunta
  useEffect(() => {
    if (session.status === 'question_intro' && !showMultiplierWarning && currentQuestion) {
      const totalSec = getIntroSeconds(currentQuestion.question_text)
      setIntroCountdown(totalSec)
      const interval = setInterval(() => {
        setIntroCountdown((c) => Math.max(0, c - 1))
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [session.status, session.current_question_index, showMultiplierWarning, currentQuestion?.id])

  // ── ÁUDIO ─────────────────────────────────────────────────────
  // encodeURI para escapar espaços/caracteres especiais nos nomes dos ficheiros
  // (essencial em produção / Vercel)
  const SOUNDS = '/sounds/VanaQuest - soundboard'
  const sound = (file: string) => encodeURI(`${SOUNDS}/${file}`)
  const trackForStatus = (status: string): string => {
    switch (status) {
      case 'waiting':
      case 'quest_intro':
        return sound('VanaQuest - Lobby Theme.mp3')
      case 'question_intro':
      case 'question_active':
        return sound('VanaQuest - Think Fast.mp3')
      case 'question_leaderboard':
        return sound('VanaQuest - Standings.mp3')
      case 'finished':
        return sound('VanaQuest - Podium Intro.mp3')
      // question_results: silêncio (deixa o SFX 'theend' destacar-se)
      default:
        return ''
    }
  }

  // Helper para tocar SFX (sempre, ignora musicEnabled)
  function playSfx(ref: React.RefObject<HTMLAudioElement | null>) {
    const el = ref.current
    if (!el) return
    try {
      el.currentTime = 0
      el.play().catch(() => {})
    } catch {}
  }

  // Mudar de música conforme estado / musicEnabled
  useEffect(() => {
    const el = musicRef.current
    if (!el) return

    if (!musicEnabled || !audioUnlocked) {
      el.pause()
      return
    }

    const next = trackForStatus(session.status)
    if (!next) {
      el.pause()
      return
    }

    if (currentTrackRef.current !== next) {
      currentTrackRef.current = next
      el.src = next
      el.loop = session.status !== 'finished' // Podium Intro NÃO faz loop (transita para Victory)
      el.volume = 0.5
      el.play().catch((err) => console.warn('[VQ] Music play error:', err, 'src:', next))
    } else if (el.paused) {
      el.play().catch((err) => console.warn('[VQ] Music resume error:', err))
    }
  }, [session.status, musicEnabled, audioUnlocked])

  // Quando Podium Intro acaba → muda para Victory Celebration (loop)
  // Usa decodeURIComponent para apanhar nomes com %20 (espaços codificados)
  function handleMusicEnded() {
    const el = musicRef.current
    if (!el) return
    const current = decodeURIComponent(currentTrackRef.current || '')
    if (current.includes('Podium Intro')) {
      const victory = sound('VanaQuest - Victory Celebration.mp3')
      currentTrackRef.current = victory
      el.src = victory
      el.loop = true
      el.volume = 0.5
      el.play().catch((err) => console.warn('[VQ] Victory celebration play error:', err))
    }
  }

  // Criar elementos <audio> uma vez (vivem fora da árvore JSX para sobreviver a re-renders entre estados)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const make = (src: string, label: string) => {
      const a = new Audio()
      a.src = src
      a.preload = 'auto'
      a.addEventListener('error', () => {
        console.warn(`[VQ] Failed to load ${label}:`, src, a.error)
      })
      return a
    }
    musicRef.current = make('', 'music')
    musicRef.current.addEventListener('ended', handleMusicEnded)
    sfxAnsweredRef.current = make(sound('player-answered.mp3'), 'sfx-answered')
    sfxLightningRef.current = make(sound('lightning - x2 and x3 points.mp3'), 'sfx-lightning')
    sfxEarningRef.current = make(sound('earning points.mp3'), 'sfx-earning')
    sfxEndRef.current = make(sound('theend.mp3'), 'sfx-end')
    ;[sfxAnsweredRef, sfxLightningRef, sfxEarningRef, sfxEndRef].forEach((r) => {
      if (r.current) r.current.volume = 0.7
    })
    return () => {
      musicRef.current?.pause()
      musicRef.current?.removeEventListener('ended', handleMusicEnded)
      musicRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Desbloquear áudio na primeira interacção (necessário para autoplay)
  useEffect(() => {
    if (audioUnlocked) return
    const unlock = () => {
      setAudioUnlocked(true)
      enterFullscreen()
      // Tentar arrancar a música imediatamente
      const el = musicRef.current
      if (el && musicEnabled) {
        const next = trackForStatus(session.status)
        if (next) {
          currentTrackRef.current = next
          el.src = next
          el.loop = session.status !== 'finished'
          el.volume = 0.5
          el.play().catch(() => {})
        }
      }
    }
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [audioUnlocked, musicEnabled, session.status])

  // SFX: lightning quando começa o aviso de multiplicador
  useEffect(() => {
    if (showMultiplierWarning && currentQuestion && currentQuestion.points_multiplier > 1) {
      playSfx(sfxLightningRef)
    }
  }, [showMultiplierWarning, currentQuestion?.id])

  // SFX: theend quando a pergunta passa para resultados
  const prevStatusRef = useRef<string>(session.status)
  useEffect(() => {
    if (prevStatusRef.current === 'question_active' && session.status === 'question_results') {
      playSfx(sfxEndRef)
    }
    // SFX earning points ao entrar no leaderboard (se houver delta para algum jogador)
    if (prevStatusRef.current !== 'question_leaderboard' && session.status === 'question_leaderboard') {
      const hasDelta = participants.some((p) => {
        const prev = prevPointsRef.current[p.id] ?? 0
        return Number(p.total_points) - prev > 0.005
      })
      if (hasDelta) {
        // Pequeno delay para coincidir com o início da animação dos números
        setTimeout(() => playSfx(sfxEarningRef), 500)
      }
    }
    prevStatusRef.current = session.status
  }, [session.status])

  // Aviso de multiplicador (x2/x3) antes da pergunta
  useEffect(() => {
    if (session.status === 'question_intro' && currentQuestion && currentQuestion.points_multiplier > 1) {
      setShowMultiplierWarning(true)
      const t = setTimeout(() => setShowMultiplierWarning(false), 2800)
      return () => clearTimeout(t)
    }
    setShowMultiplierWarning(false)
  }, [session.status, currentQuestion?.id])

  const currentAnswers = currentQuestion ? answers.filter((a) => a.question_id === currentQuestion.id) : []
  const correctIdx = currentQuestion ? OPTION_NAMES.indexOf(currentQuestion.correct_option) : -1
  const answerCounts = OPTION_NAMES.map((opt) => currentAnswers.filter((a) => a.chosen_option === opt).length)

  // Overlay para desbloquear áudio — renderizado fora da árvore de cada estado
  // (DOM directo via useEffect para sobreviver a qualquer return)
  useEffect(() => {
    if (audioUnlocked || typeof document === 'undefined') return

    const overlay = document.createElement('div')
    overlay.setAttribute('id', 'vq-audio-unlock')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;cursor:pointer;animation:vqFade 0.3s ease-out'
    overlay.innerHTML = `
      <style>@keyframes vqFade{from{opacity:0}to{opacity:1}}</style>
      <div style="background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.2);border-radius:24px;padding:32px 40px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;margin:0 16px">
        <div style="font-size:3rem;margin-bottom:12px">🔊</div>
        <p style="color:white;font-size:1.5rem;font-weight:900;margin:0">Clica para activar o áudio e o ecrã inteiro</p>
        <p style="color:#7dd3fc;font-size:0.875rem;margin-top:8px">Os browsers exigem uma interacção antes de tocar música</p>
      </div>
    `
    const handler = () => setAudioUnlocked(true)
    overlay.addEventListener('click', handler)
    document.body.appendChild(overlay)
    return () => {
      overlay.removeEventListener('click', handler)
      overlay.remove()
    }
  }, [audioUnlocked])

  // ── WAITING LOBBY ─────────────────────────────────────────────
  if (session.status === 'waiting') {
    return (
      <ProjectorLobbyScreen
        game="vana-quest"
        sessionId={sessionId}
        players={lobbyPlayers}
        loaded={participantsLoaded}
        pin={session.pin}
        joinUrl={joinUrl}
        joinLabel={`${siteUrl.replace(/^https?:\/\//, '')}/jogos/vana-quest`}
        logo={<img src="/images/VanaQuest.png" alt="" className="w-14 h-14 object-contain drop-shadow-lg" />}
        eyebrow="VanaQuest"
        title={(initialSession.vana_quests as any)?.title || 'VanaQuest'}
        background="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900"
        emptyIcon={<Users className="w-7 h-7 text-sky-400" />}
      >
        {qrZoomed && <QrZoomOverlay pin={session.pin} url={joinUrl} />}
      </ProjectorLobbyScreen>
    )
  }

  /**
   * Depois da sala de espera, as reações dos telemóveis continuam a subir pelas
   * margens do ecrã (como no Kahoot). Raiz igual em todas as fases (<>ecrã + camada</>),
   * por isso os emojis a meio do voo não desaparecem quando a fase muda.
   */
  const withReactions = (screen: ReactNode) => (
    <>
      {screen}
      <GameReactionsOverlay game="vana-quest" sessionId={sessionId} players={lobbyPlayers} />
    </>
  )

  // ── QUEST INTRO (uma vez no arranque) ─────────────────────────
  if (session.status === 'quest_intro') {
    const title = (initialSession.vana_quests as any)?.title || 'VanaQuest'
    return withReactions(
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Spotlight */}
        <div
          className="absolute left-1/2 -top-32 w-[900px] h-[1100px] -translate-x-1/2 opacity-40 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at top, rgba(250,204,21,0.25) 0%, transparent 60%)',
            filter: 'blur(20px)',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-8 text-center max-w-4xl">
          {/* Logo entry */}
          <div className="animate-in zoom-in fade-in duration-1000">
            <img
              src="/images/VanaQuest.png"
              alt="VanaQuest"
              className="w-40 h-40 md:w-48 md:h-48 object-contain drop-shadow-2xl"
            />
          </div>

          {/* Bem-vindo */}
          <p
            className="text-sky-300 text-base md:text-xl font-black uppercase tracking-[0.4em] drop-shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationDelay: '500ms', animationFillMode: 'backwards' }}
          >
            Bem-vindo ao
          </p>

          {/* Quiz title - dramático */}
          <h1
            className="text-white text-6xl md:text-8xl font-black drop-shadow-2xl leading-tight animate-in fade-in zoom-in-90 duration-1000"
            style={{ animationDelay: '1000ms', animationFillMode: 'backwards' }}
          >
            {title}
          </h1>

          {/* Prepara-te */}
          <p
            className="text-sky-200 text-xl md:text-2xl font-bold animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationDelay: '2200ms', animationFillMode: 'backwards' }}
          >
            ✨ Prepara-te... vai começar!
          </p>
        </div>
      </div>
    )
  }

  // ── QUESTION INTRO ────────────────────────────────────────────
  if (session.status === 'question_intro' && currentQuestion) {
    // Fase 1: aviso de multiplicador (se x2/x3) — visível por 2.8s
    if (showMultiplierWarning && currentQuestion.points_multiplier > 1) {
      const mult = currentQuestion.points_multiplier
      const label = mult === 2 ? 'PONTOS A DOBRAR!' : 'PONTOS A TRIPLICAR!'
      const gradient = mult === 2
        ? 'from-yellow-300 via-yellow-400 to-orange-500'
        : 'from-orange-400 via-red-500 to-pink-600'
      return withReactions(
        <div className={`h-screen w-screen bg-gradient-to-br ${gradient} flex flex-col items-center justify-center p-8 relative overflow-hidden`}>
          {/* Raios dispersos no fundo */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute text-white/20 animate-bounce"
              style={{
                top: `${10 + Math.random() * 80}%`,
                left: `${5 + Math.random() * 90}%`,
                fontSize: `${40 + Math.random() * 60}px`,
                animationDelay: `${Math.random() * 1}s`,
                animationDuration: `${1 + Math.random()}s`,
              }}
            >
              ⚡
            </div>
          ))}

          <div className="relative z-10 flex flex-col items-center gap-6 text-center">
            <Zap
              className="w-32 h-32 md:w-40 md:h-40 text-white drop-shadow-2xl animate-in zoom-in fade-in duration-500"
              fill="white"
            />
            <h1
              className="text-white font-black drop-shadow-2xl leading-none animate-in zoom-in fade-in duration-700"
              style={{ fontSize: 'clamp(8rem, 25vw, 20rem)', animationDelay: '200ms', animationFillMode: 'backwards' }}
            >
              ×{mult}
            </h1>
            <p
              className="text-white font-black tracking-[0.2em] drop-shadow-lg uppercase animate-in fade-in slide-in-from-bottom duration-700"
              style={{ fontSize: 'clamp(1.5rem, 4vw, 3.5rem)', animationDelay: '700ms', animationFillMode: 'backwards' }}
            >
              {label}
            </p>
            <p
              className="text-white/80 font-bold text-lg md:text-2xl animate-in fade-in duration-500"
              style={{ animationDelay: '1500ms', animationFillMode: 'backwards' }}
            >
              Pergunta a valer max {10 * mult} pontos
            </p>
          </div>
        </div>
      )
    }

    // Fase 2: pergunta normal
    return withReactions(
      <div className="h-screen w-screen bg-gradient-to-br from-indigo-950 via-blue-900 to-blue-950 flex flex-col items-center justify-center p-8 md:p-12 relative">
        <div className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 rounded-2xl px-4 py-2 border border-white/10">
          <span className="text-white/60 text-sm font-bold">{session.current_question_index + 1} / {questions.length}</span>
          {currentQuestion.points_multiplier > 1 && (
            <span className="bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded-full flex items-center gap-1">
              <Zap className="w-3 h-3" /> ×{currentQuestion.points_multiplier}
            </span>
          )}
        </div>

        <div className="text-center max-w-7xl w-full space-y-6 animate-in fade-in zoom-in-95 duration-500 px-4">
          <p className="text-sky-400 text-sm md:text-base font-black uppercase tracking-[0.3em]">Pergunta {session.current_question_index + 1}</p>
          <h2
            className="text-white font-black leading-[1.15] drop-shadow-lg"
            style={{ fontSize: questionFontSize(currentQuestion.question_text) }}
          >
            {currentQuestion.question_text}
          </h2>
        </div>

        <div className="absolute bottom-12 flex flex-col items-center gap-3">
          <div className="text-8xl md:text-9xl font-black text-white/80 tabular-nums animate-in zoom-in duration-500" key={introCountdown}>
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

    return withReactions(
      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 to-indigo-950 flex flex-col p-4 md:p-6 gap-3 overflow-hidden relative">
        {/* Top bar */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="bg-white/10 text-white text-sm font-bold px-3 py-1.5 rounded-full">
            {session.current_question_index + 1} / {questions.length}
          </span>
          {currentQuestion.points_multiplier > 1 && (
            <span className="bg-yellow-400 text-yellow-900 text-sm font-black px-3 py-1.5 rounded-full flex items-center gap-1">
              <Zap className="w-4 h-4" /> ×{currentQuestion.points_multiplier}
            </span>
          )}
          <div className="w-32" /> {/* placeholder para manter o layout balanceado */}
        </div>

        {/* Bola lateral estilo Kahoot — contador de respostas com pulse a cada nova resposta */}
        <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2">
          <div
            key={answerPulseKey}
            className="bg-gradient-to-br from-blue-500 to-indigo-700 rounded-full shadow-2xl border-4 border-white/30 flex flex-col items-center justify-center transition-transform animate-in zoom-in-90 duration-300"
            style={{ width: 'clamp(6rem, 9vw, 10rem)', height: 'clamp(6rem, 9vw, 10rem)' }}
          >
            <Users className="text-white/80" style={{ width: 'clamp(1.25rem, 2vw, 2rem)', height: 'clamp(1.25rem, 2vw, 2rem)' }} />
            <span className="text-white font-black tabular-nums leading-none mt-1" style={{ fontSize: 'clamp(2rem, 4vw, 4rem)' }}>
              {currentAnswers.length}
            </span>
          </div>
          <p className="text-white/50 text-xs font-bold uppercase tracking-wider">
            de {participants.length}
          </p>
        </div>

        {/* Timer row: bar + big number side by side */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-100 ${
                timeLeft > currentQuestion.time_seconds * 0.5 ? 'bg-green-400' :
                timeLeft > currentQuestion.time_seconds * 0.25 ? 'bg-yellow-400' : 'bg-red-400'
              }`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
          <p className="text-5xl md:text-6xl font-black text-white tabular-nums leading-none min-w-[3.5rem] text-right">
            {Math.ceil(timeLeft)}
          </p>
        </div>

        {/* Question — takes remaining space at top */}
        <div className="bg-white/10 backdrop-blur rounded-3xl border border-white/20 px-6 py-5 md:py-7 flex items-center justify-center flex-shrink-0">
          <p
            className="text-white font-bold text-center leading-tight"
            style={{ fontSize: questionFontSize(currentQuestion.question_text) }}
          >
            {currentQuestion.question_text}
          </p>
        </div>

        {/* Answers — fills remaining vertical space */}
        <div
          className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-3 md:gap-4 w-full"
          style={{ paddingRight: 'clamp(7rem, 11vw, 13rem)' }}
        >
          {options.map((opt, i) => (
            <div
              key={i}
              className={`${OPTION_COLORS[i]} rounded-2xl p-4 md:p-6 flex items-center gap-5 shadow-xl min-h-0 overflow-hidden`}
            >
              <span
                className="text-white font-black flex-shrink-0 drop-shadow-lg"
                style={{ fontSize: 'clamp(2.5rem, 5vw, 5rem)' }}
              >
                {OPTION_LABELS[i]}
              </span>
              <p
                className="text-white font-black leading-tight drop-shadow-md flex-1"
                style={{ fontSize: optionFontSize(options.reduce((a, b) => a.length > b.length ? a : b, '')) }}
              >
                {opt}
              </p>
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

    return withReactions(
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-indigo-950 flex flex-col p-8 gap-6">
        <div className="text-center space-y-3 animate-in slide-in-from-top duration-500">
          <p className="text-sky-300 text-sm font-black uppercase tracking-[0.3em]">Resposta correcta</p>
          <div className={`inline-flex items-center gap-5 px-10 py-6 rounded-3xl ${OPTION_COLORS[correctIdx]} shadow-2xl`}>
            <span className="text-white text-5xl md:text-6xl font-black drop-shadow-lg">{OPTION_LABELS[correctIdx]}</span>
            <span className="text-white text-4xl md:text-5xl font-black drop-shadow-md">{options[correctIdx]}</span>
            <CheckCircle2 className="w-10 h-10 text-white" />
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
    return withReactions(<LeaderboardScreen participants={participants} prevPointsRef={prevPointsRef} />)
  }

  // ── FINISHED (cinematic podium) ───────────────────────────────
  if (session.status === 'finished') {
    return withReactions(<VanaQuestPodium participants={participants} />)
  }

  return null
}

// ─────────────────────────────────────────────────────────────────
// PÓDIO FINAL — componente cinematográfico partilhado (components/game-podium)
// ─────────────────────────────────────────────────────────────────
function VanaQuestPodium({ participants }: { participants: Participant[] }) {
  const podium = [...participants].sort((a, b) => b.total_points - a.total_points)
  return (
    <CinematicPodium
      entries={podium.map((p) => ({
        id: p.id,
        name: p.display_name,
        avatarUrl: p.avatar_url,
        points: p.total_points,
        extra: p.max_streak >= 2 ? (
          <p className="text-orange-400 text-xs font-bold flex items-center justify-center gap-1">
            <Flame className="w-3 h-3" /> ×{p.max_streak}
          </p>
        ) : null,
      }))}
      backgroundClassName="bg-gradient-to-b from-blue-950 via-blue-900 to-indigo-950"
      ringOffsetClassName="ring-offset-blue-950"
      formatPoints={(n) => n.toFixed(1)}
    />
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
  // If prevPointsRef is empty (page refresh / first mount), seed with current totals so we don't
  // animate from 0 → total (which looks like they "lost" their points).
  const seededRef = useRef<boolean>(false)
  const isFirstMount = useRef<boolean>(false)
  if (!seededRef.current) {
    seededRef.current = true
    isFirstMount.current = participants.every((p) => prevPointsRef.current[p.id] === undefined)
    if (isFirstMount.current) {
      participants.forEach((p) => { prevPointsRef.current[p.id] = p.total_points })
    }
  }

  // Live animated points per participant id
  const [animatedPoints, setAnimatedPoints] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    participants.forEach((p) => { init[p.id] = prevPointsRef.current[p.id] ?? p.total_points })
    return init
  })

  // Deltas captured at mount (how much each gained this round)
  const deltasRef = useRef<Record<string, number>>(
    Object.fromEntries(
      participants.map((p) => [p.id, p.total_points - (prevPointsRef.current[p.id] ?? p.total_points)])
    )
  )

  // Phase controls *position* ordering — we keep positions stable during the count,
  // then trigger a single clean swap so rows visibly slide up AND down.
  const [showFinalOrder, setShowFinalOrder] = useState(isFirstMount.current)

  // Animate from previous → current
  useEffect(() => {
    if (isFirstMount.current) return // nothing to animate on refresh

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

    // Trigger position swap a bit before the count ends so the slide overlaps
    // the last moments of counting — feels more dynamic.
    const swapTimer = setTimeout(() => setShowFinalOrder(true), 1100)

    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(swapTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Compute both orderings once. Positions come from the current phase, but each row's
  // identity is keyed by p.id so React reuses the DOM node and CSS transitions kick in.
  const startOrder = [...participants]
    .sort((a, b) => (prevPointsRef.current[b.id] ?? 0) - (prevPointsRef.current[a.id] ?? 0))
  const endOrder = [...participants].sort((a, b) => b.total_points - a.total_points)
  const orderedParticipants = showFinalOrder ? endOrder : startOrder

  // Map participant id → display index in the current ordering
  const indexById = new Map(orderedParticipants.map((p, idx) => [p.id, idx]))
  // Renderiza o top 6 (união do top-6 em qualquer das ordens para ninguém aparecer/desaparecer)
  const visibleIds = new Set<string>([
    ...startOrder.slice(0, 6).map((p) => p.id),
    ...endOrder.slice(0, 6).map((p) => p.id),
  ])
  const top = participants.filter((p) => visibleIds.has(p.id))

  const maxStreak = Math.max(...participants.map((p) => p.current_streak), 0)
  const onFire = maxStreak >= 2 ? participants.filter((p) => p.current_streak === maxStreak) : []

  const rowHeight = 158 // px entre rows (com respiro entre cards, mas a caber sem scroll)

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-950 flex flex-col p-6 md:p-8 gap-4 overflow-hidden relative [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="text-center space-y-1">
        <p className="text-sky-300 text-base font-black uppercase tracking-[0.3em]">Classificação</p>
        <h2 className="text-white font-black flex items-center justify-center gap-3" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}>
          <Trophy className="w-12 h-12 md:w-16 md:h-16 text-yellow-400" /> Top jogadores
        </h2>
      </div>

      <div
        className="flex-1 max-w-6xl mx-auto w-full relative"
        style={{ minHeight: `${top.length * rowHeight}px` }}
      >
        {top.map((p) => {
          const i = indexById.get(p.id) ?? 0
          const value = animatedPoints[p.id] ?? 0
          const delta = deltasRef.current[p.id] ?? 0
          const showDelta = delta > 0.005

          return (
            <div
              key={p.id}
              className="absolute left-0 right-0 top-0 will-change-transform"
              style={{
                transform: `translate3d(0, ${i * rowHeight}px, 0)`,
                transition: 'transform 1200ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <div className={`flex items-center gap-5 rounded-3xl p-5 md:p-6 border-2 ${
                i === 0 ? 'bg-yellow-400/20 border-yellow-400/40' :
                i === 1 ? 'bg-gray-300/15 border-gray-300/30' :
                i === 2 ? 'bg-amber-600/15 border-amber-600/30' :
                'bg-white/10 border-white/10'
              } shadow-2xl backdrop-blur-sm`}>
                <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center font-black flex-shrink-0 transition-colors ${
                  i === 0 ? 'bg-yellow-400 text-yellow-900' :
                  i === 1 ? 'bg-gray-300 text-gray-800' :
                  i === 2 ? 'bg-amber-600 text-amber-50' :
                  'bg-white/10 text-white'
                }`} style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}>
                  {i + 1}
                </div>
                <PlayerAvatar
                  name={p.display_name}
                  avatarUrl={p.avatar_url}
                  className="w-16 h-16 md:w-20 md:h-20"
                  textClassName="text-2xl"
                  fallbackBg="bg-white/15"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-white font-black truncate leading-tight"
                    style={{ fontSize: 'clamp(1.5rem, 3vw, 2.75rem)' }}
                  >
                    {p.display_name}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {p.is_guest && <span className="text-sky-300/70 text-base font-semibold">convidado</span>}
                    {p.current_streak >= 2 && (
                      <span className="flex items-center gap-1.5 text-orange-400 font-bold text-base">
                        <Flame className="w-4 h-4" /> ×{p.current_streak}
                      </span>
                    )}
                  </div>
                </div>

                {showDelta && (
                  <span
                    className="bg-green-500/30 border border-green-400/40 rounded-full px-4 py-1.5 text-green-300 font-black tabular-nums animate-in slide-in-from-right fade-in duration-500"
                    style={{ fontSize: 'clamp(1rem, 1.5vw, 1.5rem)' }}
                  >
                    +{delta.toFixed(1)}
                  </span>
                )}

                <div className="text-right min-w-[8rem] md:min-w-[10rem]">
                  <p
                    className="text-white font-black tabular-nums leading-none"
                    style={{ fontSize: 'clamp(2.5rem, 4.5vw, 4rem)' }}
                  >
                    {value.toFixed(1)}
                  </p>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-wider mt-1">pontos</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {onFire.length > 0 && (
        <div
          className="absolute left-4 right-4 md:left-8 md:right-8 bottom-4 md:bottom-6 z-30 bg-gradient-to-r from-orange-950/95 via-orange-900/95 to-orange-950/95 backdrop-blur-md rounded-3xl border-2 border-orange-400/40 p-3 md:p-4 max-w-6xl mx-auto animate-in slide-in-from-bottom duration-500 shadow-2xl overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maxHeight: '22vh' }}
        >
          <p
            className="text-orange-300 font-black uppercase tracking-widest mb-2 flex items-center gap-2"
            style={{ fontSize: 'clamp(0.85rem, 1.3vw, 1.25rem)' }}
          >
            <Flame className="w-5 h-5 md:w-6 md:h-6" /> Em chamas! ×{maxStreak} streak
          </p>
          {onFire.length > 3 ? (
            <p
              className="text-white font-black"
              style={{ fontSize: 'clamp(1.1rem, 2vw, 1.75rem)' }}
            >
              {onFire.length} pessoas estão numa streak ×{maxStreak}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 overflow-hidden" style={{ maxHeight: '12vh' }}>
              {onFire.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-orange-500/25 border border-orange-400/40 rounded-full px-3 py-1.5 md:px-4 md:py-2"
                >
                  <Flame className="w-4 h-4 md:w-5 md:h-5 text-orange-400 flex-shrink-0" />
                  <span
                    className="text-white font-black whitespace-nowrap"
                    style={{ fontSize: 'clamp(0.85rem, 1.2vw, 1.25rem)' }}
                  >
                    {p.display_name}
                  </span>
                </div>
              ))}
            </div>
          )}
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
