'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sun, Sunset, Vote, Play, Pause, FastForward, Plus, Check, AlertCircle, Crown, Moon,
} from 'lucide-react'
import {
  getDayVoteProgress,
  startDayDiscussion,
  startDayVote,
  resolveDayVote,
  pausePhase,
  resumePhase,
  extendPhase,
  startNight,
} from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { useLiveSession } from './useLiveSession'
import { usePhaseReload } from './usePhaseReload'
import { usePhaseCountdown } from './usePhaseCountdown'
import { HostAlertPanel } from './HostAlertPanel'

interface Props {
  sessionId: string
  status: 'day_announce' | 'day_discussion' | 'day_vote' | 'day_result'
  dayNumber: number
  phaseEndsAt: string | null
  phasePausedAt: string | null
  allPlayers: { id: string; display_name: string; is_alive: boolean }[]
}

const META = {
  day_announce: { label: 'O Sol nasce', icon: Sun, accent: 'text-amber-200' },
  day_discussion: { label: 'Assembleia', icon: Sun, accent: 'text-amber-200' },
  day_vote: { label: 'Votação', icon: Vote, accent: 'text-orange-300' },
  day_result: { label: 'Veredito', icon: Sunset, accent: 'text-orange-300' },
} as const

export function HostDayMonitor(props: Props) {
  const { sessionId, status, dayNumber, phaseEndsAt, phasePausedAt, allPlayers } = props
  const router = useRouter()
  const live = useLiveSession(sessionId, {
    status,
    phase_ends_at: phaseEndsAt,
    phase_paused_at: phasePausedAt,
    day_number: dayNumber,
  })
  usePhaseReload(sessionId, status)
  const remaining = usePhaseCountdown(live.phase_ends_at, live.phase_paused_at)

  const outOfPhase = !(live.status in META)
  useEffect(() => {
    if (outOfPhase) {
      const i = setInterval(() => router.refresh(), 500)
      return () => clearInterval(i)
    }
  }, [outOfPhase, router])

  const currentStatus = (live.status in META ? live.status : status) as keyof typeof META
  const liveDay = live.day_number ?? dayNumber

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ expected: number; submitted: number; pending: string[]; tally: Record<string, { count: number; name: string }> }>({
    expected: 0, submitted: 0, pending: [], tally: {},
  })

  // Polling do progress da votação (só durante day_vote)
  useEffect(() => {
    if (currentStatus !== 'day_vote') return
    async function refresh() {
      const r = await getDayVoteProgress(sessionId)
      if (r.expected !== undefined) {
        setProgress({
          expected: r.expected,
          submitted: r.submitted ?? 0,
          pending: r.pending_names ?? [],
          tally: r.tally ?? {},
        })
      }
    }
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_host_day_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacamp_votes', filter: `session_id=eq.${sessionId}` }, refresh)
      .subscribe()
    const i = setInterval(refresh, 1500)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
  }, [sessionId, currentStatus])

  const meta = META[currentStatus]
  const Icon = meta.icon
  const isPaused = !!live.phase_paused_at
  const allVoted = progress.expected > 0 && progress.submitted >= progress.expected

  if (outOfPhase) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 text-amber-100">
        <Sun className="w-16 h-16 text-amber-300/60 mb-4 animate-pulse" />
        <p className="text-xl font-semibold">O dia acabou…</p>
        <p className="text-stone-400 text-sm mt-2">A carregar a próxima fase.</p>
      </main>
    )
  }

  async function wrap(fn: () => Promise<{ error?: string }>) {
    setBusy(true); setError(null)
    const r = await fn()
    setBusy(false)
    if (r.error) setError(r.error)
  }

  // Sorted tally para mostrar quem está em risco
  const tallySorted = Object.entries(progress.tally).sort(([, a], [, b]) => b.count - a.count)

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
      <header className="text-center space-y-2 py-4">
        <Icon className={`w-12 h-12 mx-auto ${meta.accent}`} />
        <h1 className="text-3xl font-black text-amber-100">{meta.label}</h1>
        <p className="text-amber-300/60 text-sm">Dia {liveDay}</p>
      </header>

      {/* Timer */}
      {currentStatus !== 'day_result' && (
        <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-5 text-center">
          <div className="text-xs uppercase tracking-wider text-stone-400 mb-1">
            {isPaused ? 'Em pausa' : 'Tempo restante'}
          </div>
          <div className={`text-6xl font-black font-mono ${isPaused ? 'text-stone-500' : remaining !== null && remaining < 10 ? 'text-red-300' : 'text-amber-100'}`}>
            {remaining ?? '—'}s
          </div>
        </section>
      )}

      {/* Progress (só na votação) */}
      {currentStatus === 'day_vote' && (
        <>
          <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-amber-200 text-sm font-semibold">
                {progress.submitted} / {progress.expected} já votaram
              </span>
              {allVoted && (
                <span className="text-emerald-300 text-sm flex items-center gap-1 font-semibold">
                  <Check className="w-4 h-4" /> Todos votaram
                </span>
              )}
            </div>
            <div className="h-2 bg-stone-950 rounded overflow-hidden">
              <div
                className={`h-full transition-all ${allVoted ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: progress.expected ? `${(progress.submitted / progress.expected) * 100}%` : '0%' }}
              />
            </div>
            {progress.pending.length > 0 && (
              <p className="text-stone-400 text-xs mt-2">
                A faltar: {progress.pending.join(', ')}
              </p>
            )}
          </section>

          {tallySorted.length > 0 && (
            <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4">
              <h3 className="text-amber-200 text-xs uppercase tracking-wider font-semibold mb-2">
                Contagem em direto
              </h3>
              <ul className="space-y-1">
                {tallySorted.map(([id, t]) => (
                  <li key={id} className="flex justify-between items-center bg-stone-900/60 px-3 py-2 rounded text-sm">
                    <span className="text-stone-100">{t.name}</span>
                    <span className="text-amber-300 font-bold">{t.count} {t.count === 1 ? 'voto' : 'votos'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {error && (
        <div className="bg-red-950/50 border border-red-700 text-red-200 rounded p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Controlos por fase */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {currentStatus === 'day_announce' && (
          <button
            onClick={() => wrap(() => startDayDiscussion(sessionId))}
            disabled={busy}
            className="col-span-2 md:col-span-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3 rounded flex items-center justify-center gap-2"
          >
            <Sun className="w-5 h-5" /> Começar discussão
          </button>
        )}

        {currentStatus === 'day_discussion' && (
          <>
            {isPaused ? (
              <button onClick={() => wrap(() => resumePhase(sessionId))} disabled={busy} className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> Retomar
              </button>
            ) : (
              <button onClick={() => wrap(() => pausePhase(sessionId))} disabled={busy} className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
                <Pause className="w-4 h-4" /> Pausar
              </button>
            )}
            <button onClick={() => wrap(() => extendPhase(sessionId, 60))} disabled={busy} className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> 1min
            </button>
            <button onClick={() => wrap(() => extendPhase(sessionId, 120))} disabled={busy} className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> 2min
            </button>
            <button onClick={() => wrap(() => startDayVote(sessionId))} disabled={busy} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-3 rounded flex items-center justify-center gap-2">
              <Vote className="w-4 h-4" /> Ir à votação
            </button>
          </>
        )}

        {currentStatus === 'day_vote' && (
          <>
            {isPaused ? (
              <button onClick={() => wrap(() => resumePhase(sessionId))} disabled={busy} className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> Retomar
              </button>
            ) : (
              <button onClick={() => wrap(() => pausePhase(sessionId))} disabled={busy} className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
                <Pause className="w-4 h-4" /> Pausar
              </button>
            )}
            <button onClick={() => wrap(() => extendPhase(sessionId, 30))} disabled={busy} className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> 30s
            </button>
            <button onClick={() => wrap(() => resolveDayVote(sessionId))} disabled={busy} className="col-span-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold py-3 rounded flex items-center justify-center gap-2">
              <FastForward className="w-5 h-5" /> Apurar votos
            </button>
          </>
        )}

        {currentStatus === 'day_result' && (
          <button
            onClick={() => wrap(() => startNight(sessionId))}
            disabled={busy}
            className="col-span-2 md:col-span-4 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-3 rounded flex items-center justify-center gap-2"
          >
            <Moon className="w-5 h-5" /> Começar próxima noite
          </button>
        )}
      </div>

      {currentStatus === 'day_vote' && tallySorted.length > 0 && tallySorted[0][1].count > 0 && (
        <p className="text-stone-500 text-xs text-center">
          Maior candidato: <strong className="text-amber-200">{tallySorted[0][1].name}</strong>{' '}
          ({tallySorted[0][1].count} {tallySorted[0][1].count === 1 ? 'voto' : 'votos'})
          {tallySorted.length > 1 && tallySorted[0][1].count === tallySorted[1][1].count && (
            <span className="text-amber-300"> &middot; empate <Crown className="w-3 h-3 inline" /></span>
          )}
        </p>
      )}

      <HostAlertPanel sessionId={sessionId} players={allPlayers} />
    </main>
  )
}
