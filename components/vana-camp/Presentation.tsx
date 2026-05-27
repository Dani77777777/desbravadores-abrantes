'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { Moon, Sunrise, Sun, Sunset, Vote, Trophy, Skull, Eye, Shield, User, Crown, Users } from 'lucide-react'
import { getDayResult, getDayVoteProgress } from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { useLiveSession } from './useLiveSession'
import { usePhaseReload } from './usePhaseReload'
import { usePhaseCountdown, usePhaseProgress } from './usePhaseCountdown'
import { usePlayerList } from './usePlayerList'
import type {
  VanaCampPlayerPublic,
  VanaCampRole,
  VanaCampEvent,
  VanaCampSide,
} from '@/types/vana-camp'

interface Props {
  sessionId: string
  initialStatus: string
  initialDayNumber: number
  initialPhaseEndsAt: string | null
  initialPhasePausedAt: string | null
  initialPhaseStartedAt: string | null
  code: string
  joinUrl: string
  winnerSide: VanaCampSide | null
}

/**
 * Vista para projetor / TV (`/jogos/vana-camp/[sessionId]/present`).
 *
 * Princípio cardeal: NUNCA revela papéis enquanto o jogo decorre.
 * Apenas no ecrã de vitória se mostram os papéis de todos.
 */
export function Presentation({
  sessionId, initialStatus, initialDayNumber,
  initialPhaseEndsAt, initialPhasePausedAt, initialPhaseStartedAt,
  code, joinUrl, winnerSide,
}: Props) {
  const live = useLiveSession(sessionId, {
    status: initialStatus,
    phase_ends_at: initialPhaseEndsAt,
    phase_paused_at: initialPhasePausedAt,
    day_number: initialDayNumber,
  })
  usePhaseReload(sessionId, initialStatus)

  const status = live.status
  const dayNumber = live.day_number

  if (status === 'lobby') {
    return <PresentLobby sessionId={sessionId} code={code} joinUrl={joinUrl} />
  }
  if (status === 'role_preview') {
    return <PresentSimple title="A preparar os papéis…" subtitle="O Narrador está a distribuir os papéis aos desbravadores." icon="moon" />
  }
  if (status === 'role_reveal') {
    return <PresentRoleReveal phaseEndsAt={live.phase_ends_at} phasePausedAt={live.phase_paused_at} />
  }
  if (status === 'mayor_election') {
    return <PresentSimple title="Eleger o Diretor" subtitle="Cada desbravador vota em quem será o Diretor do Clube." icon="moon" />
  }
  if (status === 'night_infiltrators' || status === 'night_seer' || status === 'night_guardian') {
    return (
      <PresentNight
        sessionId={sessionId}
        status={status}
        dayNumber={dayNumber}
        phaseStartedAt={initialPhaseStartedAt}
        phaseEndsAt={live.phase_ends_at}
        phasePausedAt={live.phase_paused_at}
      />
    )
  }
  if (status === 'day_announce') {
    return (
      <PresentDayAnnounce
        sessionId={sessionId}
        dayNumber={dayNumber}
        phaseEndsAt={live.phase_ends_at}
        phasePausedAt={live.phase_paused_at}
      />
    )
  }
  if (status === 'day_discussion') {
    return (
      <PresentDayDiscussion
        sessionId={sessionId}
        dayNumber={dayNumber}
        phaseStartedAt={initialPhaseStartedAt}
        phaseEndsAt={live.phase_ends_at}
        phasePausedAt={live.phase_paused_at}
      />
    )
  }
  if (status === 'day_vote') {
    return (
      <PresentDayVote
        sessionId={sessionId}
        dayNumber={dayNumber}
        phaseEndsAt={live.phase_ends_at}
        phasePausedAt={live.phase_paused_at}
      />
    )
  }
  if (status === 'day_result') {
    return (
      <PresentDayResult
        sessionId={sessionId}
        dayNumber={dayNumber}
        phaseEndsAt={live.phase_ends_at}
        phasePausedAt={live.phase_paused_at}
      />
    )
  }
  if (status === 'finished') {
    return <PresentFinished sessionId={sessionId} winnerSide={winnerSide} />
  }
  return <PresentSimple title={`(${status})`} subtitle="Fase ainda por implementar." icon="moon" />
}

// ════════════════════════════════════════════════════════════════════
// LOBBY
// ════════════════════════════════════════════════════════════════════

function PresentLobby({ sessionId, code, joinUrl }: { sessionId: string; code: string; joinUrl: string }) {
  const { players } = usePlayerList(sessionId)
  const nonBotCount = players.filter((p) => !p.is_bot).length
  const botCount = players.filter((p) => p.is_bot).length

  return (
    <main className="min-h-screen bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 text-amber-100 p-6 md:p-10 flex flex-col">
      <header className="flex items-center justify-between">
        <Image
          src="/images/VanaCamp.png"
          alt="VanaCamp"
          width={140}
          height={140}
          priority
          className="drop-shadow-[0_0_20px_rgba(245,158,11,0.4)]"
        />
        <div className="text-right">
          <p className="text-amber-300/70 uppercase tracking-widest text-sm">Código da sala</p>
          <p className="text-7xl md:text-9xl font-mono font-black tracking-widest text-amber-100 drop-shadow-[0_0_20px_rgba(245,158,11,0.6)]">
            {code}
          </p>
        </div>
      </header>

      <section className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        {/* QR code */}
        <div className="flex flex-col items-center justify-center gap-4 bg-stone-900/40 border border-amber-700/30 rounded-2xl p-8">
          <p className="text-amber-300 uppercase tracking-widest text-sm">Aponta a câmara</p>
          <div className="bg-white p-5 rounded-xl">
            <QRCodeSVG value={joinUrl} size={320} />
          </div>
          <p className="text-stone-400 text-sm break-all text-center max-w-xs">{joinUrl}</p>
        </div>

        {/* Lista de jogadores */}
        <div className="bg-stone-900/40 border border-amber-700/30 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-amber-200 font-bold flex items-center gap-2 text-xl">
              <Users className="w-6 h-6" /> Desbravadores
            </h2>
            <span className="text-amber-100 text-3xl font-black">
              {nonBotCount}
              {botCount > 0 && <span className="text-purple-300 text-base ml-2">+{botCount} bots</span>}
            </span>
          </div>
          {players.length === 0 ? (
            <p className="text-stone-500 italic text-center mt-12 text-lg">
              À espera dos primeiros desbravadores…
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto">
              {players.map((p, i) => (
                <li
                  key={p.id}
                  className="bg-stone-950/60 rounded px-3 py-2 text-stone-100 flex items-center gap-2 animate-in fade-in slide-in-from-left duration-500"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span className="text-amber-500 text-xs">{String(i + 1).padStart(2, '0')}</span>
                  {p.is_bot && <span className="text-purple-300 text-xs">🤖</span>}
                  <span className="truncate">{p.display_name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="text-center text-amber-200/60 text-lg mt-6">
        Acede em <strong className="text-amber-100">{joinUrl.replace(/^https?:\/\//, '')}</strong>
        &nbsp;&middot;&nbsp; ou aponta a câmara ao código.
      </footer>
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// ROLE PREVIEW / GENÉRICO SIMPLES
// ════════════════════════════════════════════════════════════════════

function PresentSimple({ title, subtitle, icon }: { title: string; subtitle?: string; icon: 'moon' | 'sun' }) {
  const Icon = icon === 'moon' ? Moon : Sunrise
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-12 bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 text-amber-100">
      <Icon className="w-32 h-32 text-amber-400 mb-8 animate-pulse drop-shadow-[0_0_30px_rgba(245,158,11,0.5)]" />
      <h1 className="text-6xl md:text-7xl font-black mb-4">{title}</h1>
      {subtitle && <p className="text-2xl text-amber-300/70">{subtitle}</p>}
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// ROLE REVEAL
// ════════════════════════════════════════════════════════════════════

function PresentRoleReveal({ phaseEndsAt, phasePausedAt }: { phaseEndsAt: string | null; phasePausedAt: string | null }) {
  const remaining = usePhaseCountdown(phaseEndsAt, phasePausedAt)
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-12 bg-gradient-to-br from-amber-950 via-stone-900 to-amber-950 text-amber-100">
      <Eye className="w-32 h-32 text-amber-300 mb-8 animate-pulse drop-shadow-[0_0_40px_rgba(252,211,77,0.6)]" />
      <h1 className="text-6xl md:text-7xl font-black mb-6">Cada um vê o seu papel…</h1>
      <p className="text-2xl text-amber-300/80 mb-10 max-w-3xl">
        Memorizem bem. Quando a noite cair, ninguém poderá voltar atrás.
      </p>
      {remaining !== null && (
        <div className="text-9xl font-black font-mono text-amber-200">
          {remaining}<span className="text-4xl">s</span>
        </div>
      )}
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// NOITE
// ════════════════════════════════════════════════════════════════════

const NIGHT_META: Record<string, { headline: string; flavor: string; icon: typeof Moon; accent: string }> = {
  night_infiltrators: {
    headline: 'Os infiltrados conspiram nas sombras',
    flavor: 'Estão a escolher quem sabotar esta noite…',
    icon: Skull,
    accent: 'text-red-300',
  },
  night_seer: {
    headline: 'O Profeta busca orientação a Deus',
    flavor: 'Em oração, procura desmascarar um suspeito…',
    icon: Eye,
    accent: 'text-purple-300',
  },
  night_guardian: {
    headline: 'O Conselheiro mantém vigia',
    flavor: 'Escolhe um desbravador para proteger…',
    icon: Shield,
    accent: 'text-sky-300',
  },
}

function PresentNight({
  sessionId, status, dayNumber, phaseStartedAt, phaseEndsAt, phasePausedAt,
}: {
  sessionId: string
  status: string
  dayNumber: number
  phaseStartedAt: string | null
  phaseEndsAt: string | null
  phasePausedAt: string | null
}) {
  const meta = NIGHT_META[status]
  const remaining = usePhaseCountdown(phaseEndsAt, phasePausedAt)
  const progress = usePhaseProgress(phaseStartedAt, phaseEndsAt, phasePausedAt)
  const Icon = meta.icon

  // Gradiente: noite cerrada → quase alvorada conforme `progress`
  const bgStyle = useMemo(() => {
    const lightness = 3 + progress * 12
    const hue = 222 - progress * 30
    return { background: `linear-gradient(180deg, hsl(${hue}, 50%, ${lightness * 0.5}%) 0%, hsl(${hue}, 35%, ${lightness}%) 100%)` }
  }, [progress])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-12 text-stone-100 relative overflow-hidden" style={bgStyle}>
      {/* Estrelas */}
      <StarField intensity={1 - progress} />

      <div className="relative z-10">
        <p className="text-blue-200/60 uppercase tracking-[0.3em] text-sm mb-4">
          Dia {dayNumber} &middot; Noite
        </p>
        <Icon className={`w-32 h-32 mx-auto mb-6 ${meta.accent} drop-shadow-[0_0_40px_currentColor]`} />
        <h1 className="text-5xl md:text-6xl font-black mb-4">
          {meta.headline}
        </h1>
        <p className="text-2xl text-blue-200/70 mb-8 max-w-3xl">
          {meta.flavor}
        </p>
        {remaining !== null && (
          <div className="text-7xl font-black font-mono text-blue-100/80">
            {remaining}<span className="text-3xl">s</span>
          </div>
        )}
      </div>

      <SessionEventTicker sessionId={sessionId} />
    </main>
  )
}

function StarField({ intensity }: { intensity: number }) {
  // Estrelas distribuídas randomicamente; fade-out conforme amanhece
  const stars = useMemo(
    () => Array.from({ length: 80 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      delay: Math.random() * 3,
    })),
    [],
  )
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ opacity: Math.max(0.05, intensity) }}>
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute bg-white rounded-full animate-pulse"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * Mostra um ticker discreto com as últimas mortes (anonimizadas durante a noite).
 * Aqui não revelamos nada — só serve para feedback subtil.
 */
function SessionEventTicker({ sessionId }: { sessionId: string }) {
  const { players } = usePlayerList(sessionId)
  const aliveCount = players.filter((p) => p.is_alive).length
  const totalCount = players.length

  return (
    <div className="absolute bottom-6 right-6 bg-black/40 border border-white/10 rounded-full px-4 py-2 text-blue-100/70 text-sm backdrop-blur">
      {aliveCount} de {totalCount} ainda no acampamento
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// DAY ANNOUNCE
// ════════════════════════════════════════════════════════════════════

function PresentDayAnnounce({
  sessionId, dayNumber, phaseEndsAt, phasePausedAt,
}: {
  sessionId: string
  dayNumber: number
  phaseEndsAt: string | null
  phasePausedAt: string | null
}) {
  const [events, setEvents] = useState<VanaCampEvent[]>([])
  const remaining = usePhaseCountdown(phaseEndsAt, phasePausedAt)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('vanacamp_events')
      .select('*')
      .eq('session_id', sessionId)
      .eq('day_number', dayNumber)
      .in('event_type', ['death', 'save', 'night_resolved'])
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setEvents(data as VanaCampEvent[]) })
  }, [sessionId, dayNumber])

  // Toca trombeta — duração aleatória entre 3 e 7 segundos (uma vez por mounting)
  useEffect(() => {
    const audio = new Audio('/sounds/VanaCamp/trombeta.mp3')
    audio.volume = 0.85
    // 3000–7000 ms (inclusive). Math.random() ∈ [0, 1)
    const durationMs = 3000 + Math.floor(Math.random() * 4001)

    const playPromise = audio.play()
    let stopTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    Promise.resolve(playPromise)
      .then(() => {
        if (cancelled) return
        stopTimer = setTimeout(() => {
          // Fade out rápido para corte limpo
          const fadeStep = audio.volume / 6
          const fade = setInterval(() => {
            if (audio.volume - fadeStep <= 0) {
              audio.pause()
              audio.currentTime = 0
              clearInterval(fade)
            } else {
              audio.volume -= fadeStep
            }
          }, 50)
        }, durationMs)
      })
      .catch(() => {
        // Auto-play bloqueado pelo browser — silenciamente ignorar
      })

    return () => {
      cancelled = true
      if (stopTimer) clearTimeout(stopTimer)
      audio.pause()
      audio.currentTime = 0
    }
  }, [dayNumber])

  const death = events.find((e) => e.event_type === 'death')
  const save = events.find((e) => e.event_type === 'save')
  const nobody = events.find((e) => e.event_type === 'night_resolved')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-12 bg-gradient-to-br from-amber-300 via-orange-400 to-yellow-500 text-stone-900 relative overflow-hidden">
      <Sunrise className="w-32 h-32 text-amber-800 mb-6 drop-shadow-lg animate-in zoom-in duration-1000" />
      <p className="uppercase tracking-[0.3em] text-amber-900 font-bold text-sm mb-2">Dia {dayNumber}</p>
      <h1 className="text-6xl md:text-7xl font-black mb-8 drop-shadow-md">
        O Sol nasce no horizonte
      </h1>

      <div className="bg-white/50 backdrop-blur rounded-2xl p-8 max-w-3xl border border-amber-700/30 shadow-xl">
        {death && (
          <div className="flex items-center gap-4 justify-center">
            <Skull className="w-16 h-16 text-stone-800 shrink-0" />
            <p className="text-3xl text-stone-900 text-left">
              <strong className="text-red-700">{(death.payload as { target_name?: string }).target_name ?? 'Alguém'}</strong>{' '}
              foi <strong>sabotado</strong> esta noite.
              <span className="block text-xl text-stone-700 mt-2">Foi levado para a cozinha lavar a loiça.</span>
            </p>
          </div>
        )}
        {save && !death && (
          <div className="flex items-center gap-4 justify-center">
            <Shield className="w-16 h-16 text-sky-700 shrink-0" />
            <p className="text-3xl text-stone-900">
              O <strong className="text-sky-800">Conselheiro</strong> salvou um desbravador!
              <span className="block text-xl text-stone-700 mt-2">Ninguém morreu esta noite.</span>
            </p>
          </div>
        )}
        {nobody && !death && !save && (
          <p className="text-3xl text-stone-900">
            Nada de mau aconteceu esta noite. O acampamento está intacto.
          </p>
        )}
      </div>

      {remaining !== null && (
        <p className="text-amber-900 text-xl mt-8">
          A assembleia começa em <strong className="text-3xl">{remaining}s</strong>
        </p>
      )}
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// DAY DISCUSSION
// ════════════════════════════════════════════════════════════════════

function PresentDayDiscussion({
  sessionId, dayNumber, phaseStartedAt, phaseEndsAt, phasePausedAt,
}: {
  sessionId: string
  dayNumber: number
  phaseStartedAt: string | null
  phaseEndsAt: string | null
  phasePausedAt: string | null
}) {
  const remaining = usePhaseCountdown(phaseEndsAt, phasePausedAt)
  const progress = usePhaseProgress(phaseStartedAt, phaseEndsAt, phasePausedAt)
  const { players } = usePlayerList(sessionId)
  const alive = players.filter((p) => p.is_alive)

  // Gradiente sol → pôr-do-sol
  const bgStyle = useMemo(() => {
    const hue = 45 - progress * 25
    const sat = 70 + progress * 15
    const lightTop = 75 - progress * 30
    const lightBottom = 60 - progress * 35
    return {
      background: `linear-gradient(180deg, hsl(${hue}, ${sat}%, ${lightTop}%) 0%, hsl(${hue - 5}, ${sat}%, ${lightBottom}%) 100%)`,
    }
  }, [progress])

  return (
    <main className="min-h-screen p-10 flex flex-col text-stone-900" style={bgStyle}>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-amber-900/80 uppercase tracking-[0.3em] text-sm">Dia {dayNumber}</p>
          <h1 className="text-6xl md:text-7xl font-black mt-1">Assembleia</h1>
          <p className="text-stone-900/70 text-xl mt-2">Quem suspeitam que é Infiltrado?</p>
        </div>
        <div className="text-right">
          {progress < 0.7 ? (
            <Sun className="w-24 h-24 text-amber-700 drop-shadow-lg ml-auto" />
          ) : (
            <Sunset className="w-24 h-24 text-orange-800 drop-shadow-lg ml-auto" />
          )}
          {remaining !== null && (
            <p className="text-7xl font-black font-mono mt-2 text-stone-900 drop-shadow">
              {remaining}<span className="text-3xl">s</span>
            </p>
          )}
        </div>
      </header>

      <section className="flex-1 mt-10">
        <h2 className="text-amber-900 uppercase tracking-widest text-sm font-bold mb-4">
          No acampamento ({alive.length})
        </h2>
        <ul className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {alive.map((p) => (
            <li
              key={p.id}
              className="bg-white/40 backdrop-blur border border-amber-700/30 rounded-lg px-4 py-3 text-stone-900 text-xl font-semibold flex items-center gap-2"
            >
              {p.is_mayor && <Crown className="w-5 h-5 text-amber-700" />}
              <span className="truncate">{p.display_name}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-center text-amber-900/70 text-lg mt-6">
        Discutam entre vocês. A votação começa quando o Narrador decidir.
      </footer>
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// DAY VOTE
// ════════════════════════════════════════════════════════════════════

function PresentDayVote({
  sessionId, dayNumber, phaseEndsAt, phasePausedAt,
}: {
  sessionId: string
  dayNumber: number
  phaseEndsAt: string | null
  phasePausedAt: string | null
}) {
  const remaining = usePhaseCountdown(phaseEndsAt, phasePausedAt)
  const [tally, setTally] = useState<Record<string, { count: number; name: string }>>({})
  const [submitted, setSubmitted] = useState(0)
  const [expected, setExpected] = useState(0)

  useEffect(() => {
    async function refresh() {
      const r = await getDayVoteProgress(sessionId)
      if (r.tally) setTally(r.tally)
      if (r.submitted !== undefined) setSubmitted(r.submitted)
      if (r.expected !== undefined) setExpected(r.expected)
    }
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_pres_vote_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacamp_votes', filter: `session_id=eq.${sessionId}` }, refresh)
      .subscribe()
    const i = setInterval(refresh, 1500)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
  }, [sessionId])

  const sorted = Object.entries(tally).sort(([, a], [, b]) => b.count - a.count)
  const maxCount = sorted[0]?.[1].count ?? 0

  return (
    <main className="min-h-screen p-10 flex flex-col text-stone-100 bg-gradient-to-br from-orange-700 via-red-800 to-stone-900">
      <header className="text-center mb-6">
        <Vote className="w-20 h-20 text-amber-200 mx-auto mb-3 drop-shadow-lg" />
        <p className="uppercase tracking-[0.3em] text-orange-200 text-sm">Dia {dayNumber}</p>
        <h1 className="text-5xl md:text-6xl font-black mt-1 mb-2">Quem expulsamos?</h1>
        <p className="text-orange-200">
          {submitted} / {expected} votaram
          {remaining !== null && <> &middot; <span className="font-bold text-amber-100">{remaining}s</span></>}
        </p>
      </header>

      <section className="flex-1 max-w-3xl mx-auto w-full space-y-3">
        {sorted.length === 0 ? (
          <p className="text-center text-orange-200/70 italic text-xl">Ninguém votou ainda…</p>
        ) : (
          sorted.map(([id, t]) => {
            const pct = maxCount > 0 ? (t.count / maxCount) * 100 : 0
            const isLeader = t.count === maxCount && maxCount > 0
            return (
              <div
                key={id}
                className={`bg-black/30 backdrop-blur rounded-xl p-4 border ${isLeader ? 'border-red-300' : 'border-white/10'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold">{t.name}</span>
                  <span className="text-2xl font-black text-amber-200">
                    {t.count} {t.count === 1 ? 'voto' : 'votos'}
                  </span>
                </div>
                <div className="h-3 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${isLeader ? 'bg-red-400' : 'bg-amber-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </section>
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// DAY RESULT
// ════════════════════════════════════════════════════════════════════

function PresentDayResult({
  sessionId, dayNumber, phaseEndsAt, phasePausedAt,
}: {
  sessionId: string
  dayNumber: number
  phaseEndsAt: string | null
  phasePausedAt: string | null
}) {
  const remaining = usePhaseCountdown(phaseEndsAt, phasePausedAt)
  const [result, setResult] = useState<Awaited<ReturnType<typeof getDayResult>> | null>(null)

  useEffect(() => {
    getDayResult(sessionId, dayNumber).then(setResult)
  }, [sessionId, dayNumber])

  if (!result) {
    return <PresentSimple title="A apurar votos…" icon="moon" />
  }

  if (!result.eliminated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center p-12 bg-gradient-to-br from-stone-700 via-stone-900 to-stone-950 text-amber-100">
        <Sunset className="w-32 h-32 text-orange-400 mb-6 drop-shadow-lg" />
        <h1 className="text-6xl font-black mb-4">Sem expulsão hoje</h1>
        <p className="text-2xl text-stone-300 max-w-3xl">
          A assembleia não chegou a um veredito. Ninguém é expulso esta tarde.
        </p>
        {remaining !== null && <p className="text-stone-400 mt-8 text-xl">A noite cai em {remaining}s</p>}
      </main>
    )
  }

  const role = result.eliminated.role
  const meta = role ? ROLE_META[role] : null
  const Icon = meta?.icon ?? User

  return (
    <main className={`min-h-screen flex flex-col items-center justify-center text-center p-12 text-white bg-gradient-to-br ${
      role === 'infiltrator' ? 'from-emerald-900 via-stone-900 to-stone-950' : 'from-stone-700 via-red-900 to-stone-950'
    }`}>
      <Sunset className="w-24 h-24 text-orange-400 mb-4 drop-shadow-lg" />
      <p className="uppercase tracking-[0.3em] text-orange-300 text-sm mb-2">Veredito do Dia {dayNumber}</p>

      <div className="space-y-4 animate-in fade-in zoom-in duration-700">
        <h1 className="text-6xl md:text-7xl font-black">
          {result.eliminated.name}
        </h1>
        <p className="text-3xl text-stone-200">foi expulso do acampamento</p>

        {role && meta && (
          <div className={`inline-flex flex-col items-center gap-4 mt-6 ${meta.color.split(' ')[0]}`}>
            <Icon className="w-32 h-32 drop-shadow-[0_0_30px_currentColor]" strokeWidth={1.5} />
            <p className="text-lg uppercase tracking-widest text-stone-300">era um</p>
            <p className="text-5xl md:text-6xl font-black">{meta.label}</p>
          </div>
        )}
      </div>

      {result.mayor_tiebreak_used && (
        <p className="text-amber-300 mt-8 flex items-center gap-2 text-xl">
          <Crown className="w-6 h-6" /> O voto do Diretor desempatou
        </p>
      )}

      {remaining !== null && (
        <p className="text-stone-400 mt-10 text-xl">A noite cai em {remaining}s</p>
      )}
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// FINISHED — revela todos os papéis
// ════════════════════════════════════════════════════════════════════

const ROLE_META: Record<VanaCampRole, { label: string; color: string; icon: typeof User }> = {
  infiltrator: { label: 'Infiltrado', color: 'text-red-300 bg-red-950/40 border-red-700/50', icon: Skull },
  seer: { label: 'Profeta', color: 'text-purple-300 bg-purple-950/40 border-purple-700/50', icon: Eye },
  guardian: { label: 'Conselheiro', color: 'text-sky-300 bg-sky-950/40 border-sky-700/50', icon: Shield },
  villager: { label: 'Fiel', color: 'text-amber-200 bg-amber-950/40 border-amber-700/50', icon: User },
}

function PresentFinished({ sessionId, winnerSide }: { sessionId: string; winnerSide: VanaCampSide | null }) {
  const [players, setPlayers] = useState<(VanaCampPlayerPublic & { role: VanaCampRole | null })[]>([])

  useEffect(() => {
    // No fim, todos podem ver os papéis — a view pública não os tem mas RLS
    // já permite SELECT em vanacamp_players a quem tiver o cookie do host. Para
    // a tela de projeção (que corre sob o host) podemos buscar tudo.
    // Para simplicidade fazemos query direta — o host está autenticado.
    const supabase = createClient()
    supabase
      .from('vanacamp_players')
      .select('*')
      .eq('session_id', sessionId)
      .order('display_name', { ascending: true })
      .then(({ data }) => { if (data) setPlayers(data as never) })
  }, [sessionId])

  const isInfWin = winnerSide === 'infiltrators'

  return (
    <main className={`min-h-screen flex flex-col items-center text-center p-10 text-white ${
      isInfWin
        ? 'bg-gradient-to-br from-red-950 via-stone-900 to-red-950'
        : 'bg-gradient-to-br from-amber-600 via-orange-500 to-yellow-400'
    }`}>
      <Trophy className={`w-32 h-32 mb-6 drop-shadow-2xl ${isInfWin ? 'text-red-300' : 'text-amber-100'} animate-in zoom-in duration-700`} />
      <h1 className="text-7xl md:text-8xl font-black mb-4 drop-shadow-lg">
        {isInfWin ? 'Vitória dos Infiltrados!' : 'Vitória dos Desbravadores!'}
      </h1>
      <p className={`text-2xl mb-10 ${isInfWin ? 'text-red-200' : 'text-amber-100'}`}>
        {isInfWin
          ? 'O acampamento foi sabotado. Os fiéis não conseguiram desmascará-los a tempo.'
          : 'Os Infiltrados foram todos desmascarados. O acampamento está a salvo!'}
      </p>

      <section className="bg-black/30 backdrop-blur rounded-2xl p-6 max-w-5xl w-full border border-white/10">
        <h2 className="text-xl uppercase tracking-widest text-white/70 font-bold mb-4">
          Papéis revelados
        </h2>
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {players.map((p) => {
            if (!p.role) return null
            const meta = ROLE_META[p.role]
            const Icon = meta.icon
            return (
              <li
                key={p.id}
                className={`flex items-center gap-2 px-3 py-2 rounded border ${meta.color} ${!p.is_alive ? 'opacity-60' : ''}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="font-medium flex-1 truncate text-sm">{p.display_name}</span>
                {p.is_mayor && <Crown className="w-3 h-3 text-amber-200" />}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
