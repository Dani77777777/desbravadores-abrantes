'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { submitAnswer, setRewardsRecipient, skipRewards } from '@/lib/actions/vana-quest'
import { CheckCircle2, XCircle, Trophy, Zap, Flame, Users, ArrowUp, Crown } from 'lucide-react'
import { PlayerAvatar } from './PlayerAvatar'
import { useLiveSession } from './useLiveSession'
import { calcSessionRewards, streakMultiplier, MAX_SESSION_GOLD, MAX_SESSION_XP } from '@/utils/vana-quest'

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
  allMembers: { id: string; full_name: string; section: string; avatar_url?: string | null }[]
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
  const [submitError, setSubmitError] = useState(false)
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
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  // Membro selecionado à espera de confirmação (para não doar sem querer)
  const [pendingRecipient, setPendingRecipient] = useState<{ id: string; full_name: string; section: string; avatar_url?: string | null } | null>(null)
  // Foi expulso pelo host
  const [kicked, setKicked] = useState(false)
  // Posição na classificação (rank) + pontos para subir
  const [rankInfo, setRankInfo] = useState<{ rank: number; total: number; pointsToNext: number | null }>({ rank: 0, total: 0, pointsToNext: null })
  // Pontos do 1.º classificado — define a escala do limite de prémios (500🪙/1000⭐)
  const [topPoints, setTopPoints] = useState(0)

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
    if (stored) {
      setParticipantId(stored)
      return
    }
    // Failsafe: se não há localStorage mas o user está autenticado, procura o participante na BD
    if (userId) {
      supabase
        .from('vana_quest_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single()
        .then(({ data }) => {
          if (data?.id) {
            setParticipantId(data.id)
            localStorage.setItem(`vana_participant_${sessionId}`, data.id)
          }
        })
    }
  }, [sessionId, userId])

  // Aviso de multiplicador (x2/x3) no início do question_intro
  useEffect(() => {
    if (session.status === 'question_intro' && currentQuestion && currentQuestion.points_multiplier > 1) {
      setShowMultiplierWarning(true)
      const t = setTimeout(() => setShowMultiplierWarning(false), 2800)
      return () => clearTimeout(t)
    }
    setShowMultiplierWarning(false)
  }, [session.status, currentQuestion?.id])

  // Avisar o jogador antes de fechar/recarregar o separador ou carregar em "voltar"
  // enquanto o jogo está EM JOGO (nem 'waiting' nem 'finished'). Na sala de espera sair
  // é normal — não avisamos e deixamos a presença tratar da limpeza automática.
  useEffect(() => {
    const gameInProgress = session.status !== 'finished' && session.status !== 'waiting'
    if (!gameInProgress || kicked) return

    // Aviso nativo ao fechar ou recarregar o separador
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Intercetar o botão "voltar" do browser
    const pushGuard = () => window.history.pushState(null, '', window.location.href)
    pushGuard()
    const handlePopState = () => {
      const leave = window.confirm(
        'Tens a certeza que queres sair do VanaQuest? Vais perder o teu lugar no jogo.'
      )
      if (leave) {
        window.removeEventListener('beforeunload', handleBeforeUnload)
        window.history.back()
      } else {
        // Cancelou: voltamos a empurrar o estado para manter o jogador no jogo
        pushGuard()
      }
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [session.status, kicked])

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

  // Posição na classificação + quantos pontos faltam para subir
  useEffect(() => {
    if (!participantId) return
    if (session.status !== 'question_leaderboard' && session.status !== 'finished') return

    supabase
      .from('vana_quest_participants')
      .select('id, total_points')
      .eq('session_id', sessionId)
      .order('total_points', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        setTopPoints(Number(data[0]?.total_points) || 0)
        const idx = data.findIndex((p) => p.id === participantId)
        if (idx === -1) return
        const me = Number(data[idx].total_points) || 0
        const above = idx > 0 ? Number(data[idx - 1].total_points) || 0 : null
        setRankInfo({
          rank: idx + 1,
          total: data.length,
          pointsToNext: above === null ? null : Math.max(0, above - me),
        })
      })
  }, [participantId, session.status])

  // Sessão sincronizada de forma resiliente: realtime (rápido) + polling (rede de
  // segurança) + refetch ao reconectar/voltar ao separador. Garante que o ecrã nunca
  // fica preso por um evento realtime perdido. Pausa o polling no fim do jogo.
  useLiveSession(
    sessionId,
    (row) => setSession((prev) => ({ ...prev, ...(row as Session) })),
    { paused: session.status === 'finished', pollMs: 2000 }
  )

  // Reset ao mudar de pergunta — corre venha o estado do realtime ou do polling.
  // currentQuestion.id só muda quando uma NOVA pergunta começa (mantém-se igual em
  // active → results → leaderboard), por isso o reveal da resposta é preservado.
  useEffect(() => {
    setAnswerResult(null)
    setSubmitting(false)
    setSubmitError(false)
    setTotalAnswered(0)
  }, [currentQuestion?.id])

  // Realtime leve só para participantes: contagem na sala + deteção de expulsão.
  // Canal estável (deps sem currentQuestion) → nunca é recriado a meio do jogo, por
  // isso não há janela de re-subscrição onde se perdem eventos.
  // NÃO subscrevemos os INSERT de respostas: com N jogadores isso gera N×N mensagens
  // por pergunta e satura o canal, derrubando o UPDATE crítico da sessão. A contagem
  // "responderam X/Y" passa a vir de polling leve (efeito abaixo).
  useEffect(() => {
    const channel = supabase
      .channel(`player-${sessionId}-${userId || 'g'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vana_quest_participants', filter: `session_id=eq.${sessionId}` },
        () => setTotalPlayers((c) => c + 1))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'vana_quest_participants' },
        (p) => {
          const removedId = (p.old as any)?.id
          if (!removedId) return
          setTotalPlayers((c) => Math.max(0, c - 1))
          // Se fui eu que fui removido → ecrã de expulsão
          if (participantId && removedId === participantId) {
            localStorage.removeItem(`vana_participant_${sessionId}`)
            setKicked(true)
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, userId, participantId])

  // Presença na sala de espera — marca este jogador como "online". Quando a ligação cai
  // (fechou o separador / saiu), o host deteta a ausência e remove-o da lista antes de o
  // jogo começar, evitando "jogadores mortos". Como a chave de presença é o participantId
  // (estável entre refreshes via localStorage), um simples refresh sai e volta a entrar,
  // por isso o host não o remove (há um período de tolerância). Só durante 'waiting'.
  useEffect(() => {
    if (session.status !== 'waiting' || !participantId) return
    const channel = supabase.channel(`vq-presence-${sessionId}`, {
      config: { presence: { key: participantId } },
    })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track({ participantId })
    })
    return () => { supabase.removeChannel(channel) }
  }, [session.status, participantId, sessionId])

  // Load total player count
  useEffect(() => {
    supabase.from('vana_quest_participants').select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
      .then(({ count }) => { if (count !== null) setTotalPlayers(count) })
  }, [sessionId])

  // Contagem "responderam X/Y" via polling leve (substitui a subscrição realtime de
  // respostas no lado do jogador). Só corre durante a pergunta activa.
  useEffect(() => {
    if (session.status !== 'question_active' || !currentQuestion) return
    let cancelled = false
    const fetchCounts = async () => {
      const [answered, players] = await Promise.all([
        supabase.from('vana_quest_answers').select('id', { count: 'exact', head: true })
          .eq('session_id', sessionId).eq('question_id', currentQuestion.id),
        supabase.from('vana_quest_participants').select('id', { count: 'exact', head: true })
          .eq('session_id', sessionId),
      ])
      if (cancelled) return
      if (answered.count !== null) setTotalAnswered(answered.count)
      if (players.count !== null) setTotalPlayers(players.count)
    }
    fetchCounts()
    const t = setInterval(fetchCounts, 2500)
    return () => { cancelled = true; clearInterval(t) }
  }, [session.status, currentQuestion?.id, sessionId])

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
    setSubmitError(false)

    const elapsedMs = Math.max(0, Date.now() - startTimeRef.current)

    // Redes móveis falham pedidos isolados; uma falha pontual não deve custar a
    // resposta ao jogador. Tentamos até 3 vezes. O servidor é idempotente, por isso
    // se a 1ª tentativa chegou a registar (mas a resposta perdeu-se), a 2ª devolve
    // a resposta já existente em vez de duplicar.
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await submitAnswer(participantId, sessionId, currentQuestion.id, optionLetter, elapsedMs)

          // Sucesso, ou já tinha respondido (cliques duplos / retry idempotente):
          // em ambos guardamos a escolha. A correção/pontos só são revelados em
          // 'question_results'.
          if (result.ok || result.alreadyAnswered) {
            setAnswerResult({
              isCorrect: result.isCorrect ?? false,
              finalPoints: result.finalPoints ?? 0,
              chosen: optionLetter,
            })
            return
          }

          // Rejeição lógica (pergunta já fechada, etc.) — repetir não ajuda.
          setSubmitError(true)
          return
        } catch {
          // Erro de rede — espera curta e tenta de novo.
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400))
        }
      }
      // Esgotou as tentativas — deixa o jogador tocar outra vez.
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
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
    setPendingRecipient(null)
    setDonationSuccess(true)
  }

  async function handleSkip() {
    setShowSkipConfirm(false)
    if (participantId) await skipRewards(participantId)
    setDonationSkipped(true)
  }

  const filteredMembers = allMembers.filter((m) =>
    m.full_name.toLowerCase().includes(donationSearch.toLowerCase())
  )

  // Calculated rewards (rounded half-up, com limite por sessão — ver calcSessionRewards)
  const { gold: goldEarned, xp: xpEarned } = calcSessionRewards(totalPoints, topPoints)
  const rewardsCapped = Math.round(Math.max(totalPoints, topPoints)) > MAX_SESSION_GOLD

  // ── EXPULSO PELO HOST ──────────────────────────────────────────
  if (kicked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex flex-col items-center justify-center p-6 gap-5 text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-400/30 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-2xl font-black text-white">Foste removido do jogo</h2>
        <p className="text-sky-200 text-sm max-w-xs">
          O anfitrião removeu-te desta sessão. Se achas que foi um engano, fala com o anfitrião e volta a entrar.
        </p>
        <a href="/jogos/vana-quest" className="text-sky-300 underline mt-2">Voltar a entrar</a>
      </div>
    )
  }

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
              <span className={`flex items-center gap-1 font-black px-2.5 py-1 rounded-full text-white ${streak >= 7 ? 'bg-red-500' : streak >= 5 ? 'bg-orange-500' : 'bg-amber-500'}`}>
                <Flame className="w-3 h-3" /> ×{streakMultiplier(streak)}
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

        {/* Falha de envio — botões reativam, jogador pode tocar outra vez */}
        {submitError && !answerResult && (
          <div className="bg-red-500/20 border border-red-400/40 rounded-2xl px-4 py-2.5 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <XCircle className="w-4 h-4 text-red-300 flex-shrink-0" />
            <p className="text-red-100 text-sm font-semibold">Falha ao enviar. Toca outra vez na tua resposta.</p>
          </div>
        )}

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
    const isLeader = rankInfo.rank === 1
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-950 flex flex-col items-center justify-center p-6 gap-4 text-center">
        {isLeader ? <Crown className="w-16 h-16 text-yellow-400" /> : <Trophy className="w-14 h-14 text-yellow-400" />}

        {/* Posição em destaque */}
        {rankInfo.rank > 0 && (
          <div className="flex flex-col items-center">
            <p className="text-sky-300 text-xs font-black uppercase tracking-widest mb-1">
              {isLeader ? '👑 Estás em 1º!' : 'A tua posição'}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-white text-7xl font-black tabular-nums leading-none">{rankInfo.rank}º</span>
              <span className="text-white/40 text-2xl font-bold">/ {rankInfo.total}</span>
            </div>
          </div>
        )}

        {/* Pontuação */}
        <div className="bg-white/10 rounded-2xl px-6 py-3 mt-1">
          <p className="text-sky-300 text-[10px] font-bold uppercase tracking-widest">A tua pontuação</p>
          <p className="text-white text-4xl font-black tabular-nums">{totalPoints.toFixed(1)}</p>
        </div>

        {/* Quanto falta para subir */}
        {rankInfo.pointsToNext !== null && rankInfo.pointsToNext > 0 && (
          <div className="flex items-center gap-2 bg-green-500/15 border border-green-400/30 rounded-2xl px-4 py-2.5">
            <ArrowUp className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="text-green-200 text-sm font-semibold">
              Faltam <span className="text-green-400 font-black">{rankInfo.pointsToNext.toFixed(1)}</span> pts para o {rankInfo.rank - 1}º
            </p>
          </div>
        )}

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
        <p className="text-white/40 text-xs animate-pulse mt-2">Olha para o ecrã principal...</p>
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
                {rewardsCapped && (
                  <p className="text-sky-300/70 text-[11px] mt-1">Prémios ajustados ao limite da sessão (máx. {MAX_SESSION_GOLD} 🪙 / {MAX_SESSION_XP} ⭐)</p>
                )}
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
                    onClick={() => setPendingRecipient(m)}
                    disabled={donating}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-left disabled:opacity-60"
                  >
                    <PlayerAvatar
                      name={m.full_name}
                      avatarUrl={m.avatar_url}
                      className="w-8 h-8"
                      textClassName="text-sm"
                      fallbackBg="bg-blue-500"
                    />
                    <div>
                      <p className="text-white font-semibold text-sm">{m.full_name}</p>
                      <p className="text-sky-300 text-xs">{SECTION_LABELS[m.section] || m.section}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowSkipConfirm(true)}
                className="w-full text-sky-400 text-sm py-2 underline"
              >
                Dispensar prémios
              </button>

              {/* Modal de confirmação */}
              {showSkipConfirm && (
                <div
                  className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
                  onClick={() => setShowSkipConfirm(false)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 border border-white/20 rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 fade-in duration-300"
                  >
                    <div className="text-center space-y-3">
                      <div className="text-6xl">😮</div>
                      <h3 className="text-white font-black text-2xl">Tens a certeza?</h3>
                      <p className="text-sky-200 text-sm leading-relaxed">
                        Ganhaste <span className="text-yellow-400 font-black">{goldEarned} 🪙</span> e{' '}
                        <span className="text-blue-300 font-black">{xpEarned} ⭐ XP</span> mas vais dispensar.
                        <br />
                        <span className="text-white/60 text-xs mt-2 block">
                          Esses pontos vão simplesmente desaparecer e nenhum desbravador recebe.
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setShowSkipConfirm(false)}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-black py-3 rounded-2xl transition-all active:scale-[0.98] shadow-lg"
                      >
                        Voltar e escolher
                      </button>
                      <button
                        onClick={handleSkip}
                        disabled={donating}
                        className="w-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 text-sm py-2.5 rounded-2xl transition-colors border border-white/10 disabled:opacity-60"
                      >
                        Sim, dispensar mesmo assim
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal de confirmação de escolha (para não doar sem querer) */}
              {pendingRecipient && (
                <div
                  className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
                  onClick={() => !donating && setPendingRecipient(null)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 border border-white/20 rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 fade-in duration-300"
                  >
                    <div className="text-center space-y-3">
                      <PlayerAvatar
                        name={pendingRecipient.full_name}
                        avatarUrl={pendingRecipient.avatar_url}
                        className="w-16 h-16 mx-auto"
                        textClassName="text-xl"
                        fallbackBg="bg-blue-500"
                      />
                      <h3 className="text-white font-black text-2xl">Confirmar?</h3>
                      <p className="text-sky-200 text-sm leading-relaxed">
                        Vais dar <span className="text-yellow-400 font-black">{goldEarned} 🪙</span> e{' '}
                        <span className="text-blue-300 font-black">{xpEarned} ⭐ XP</span> a{' '}
                        <span className="text-white font-black">{pendingRecipient.full_name}</span>.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleDonate(pendingRecipient.id)}
                        disabled={donating}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-black py-3 rounded-2xl transition-all active:scale-[0.98] shadow-lg disabled:opacity-60"
                      >
                        {donating ? 'A enviar...' : 'Sim, é este!'}
                      </button>
                      <button
                        onClick={() => setPendingRecipient(null)}
                        disabled={donating}
                        className="w-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 text-sm py-2.5 rounded-2xl transition-colors border border-white/10 disabled:opacity-60"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
          {rewardsCapped && (
            <p className="text-sky-300/70 text-[11px]">Prémios ajustados ao limite da sessão (máx. {MAX_SESSION_GOLD} 🪙 / {MAX_SESSION_XP} ⭐)</p>
          )}
        </div>
        <a href="/jogos" className="text-sky-300 underline">Voltar aos jogos</a>
      </div>
    )
  }

  return null
}
