'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Moon, Eye, Shield, Skull, Play, Pause, FastForward, Plus, Check, AlertCircle,
} from 'lucide-react'
import {
  getNightProgress,
  advanceNightPhase,
  pausePhase,
  resumePhase,
  extendPhase,
  startNight,
} from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { useLiveSession } from './useLiveSession'
import { usePhaseCountdown } from './usePhaseCountdown'
import { usePhaseReload } from './usePhaseReload'
import { HostAlertPanel } from './HostAlertPanel'

interface Props {
  sessionId: string
  status: 'night_infiltrators' | 'night_seer' | 'night_guardian'
  dayNumber: number
  phaseEndsAt: string | null
  phasePausedAt: string | null
  allPlayers: { id: string; display_name: string; is_alive: boolean }[]
}

const PHASE_META: Record<string, { label: string; icon: typeof Moon; color: string }> = {
  night_infiltrators: { label: 'Turno dos Infiltrados', icon: Skull, color: 'text-red-300' },
  night_seer: { label: 'Turno do Profeta', icon: Eye, color: 'text-purple-300' },
  night_guardian: { label: 'Turno do Conselheiro', icon: Shield, color: 'text-sky-300' },
}

export function HostNightMonitor(props: Props) {
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

  // Se o status "vivo" saiu da categoria noite, a fase mudou na BD mas o
  // servidor ainda não devolveu o componente certo. Mostra ecrã de transição
  // em vez do título obsoleto e força refresh.
  const outOfPhase = !(live.status in PHASE_META)
  useEffect(() => {
    if (outOfPhase) {
      const i = setInterval(() => router.refresh(), 500)
      return () => clearInterval(i)
    }
  }, [outOfPhase, router])

  const currentStatus = (live.status in PHASE_META ? live.status : status) as keyof typeof PHASE_META
  const liveDayNumber = live.day_number ?? dayNumber

  const [progress, setProgress] = useState<{ expected: number; submitted: number; pending_names: string[] }>({
    expected: 0, submitted: 0, pending_names: [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function refresh() {
      const r = await getNightProgress(sessionId)
      if (r.expected !== undefined) {
        setProgress({ expected: r.expected, submitted: r.submitted ?? 0, pending_names: r.pending_names ?? [] })
      }
    }
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_host_night_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacamp_events', filter: `session_id=eq.${sessionId}` }, () => refresh())
      .subscribe()
    const i = setInterval(refresh, 1500)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
  }, [sessionId, currentStatus])

  const meta = PHASE_META[currentStatus] ?? PHASE_META[status]
  const Icon = meta.icon
  const allReady = progress.expected > 0 && progress.submitted >= progress.expected
  const isPaused = !!live.phase_paused_at

  if (outOfPhase) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 text-amber-100">
        <Moon className="w-16 h-16 text-amber-300/60 mb-4 animate-pulse" />
        <p className="text-xl font-semibold">A noite acabou…</p>
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

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
      <header className="text-center space-y-2 py-4">
        <Icon className={`w-12 h-12 mx-auto ${meta.color}`} />
        <h1 className="text-3xl font-black text-amber-100">{meta.label}</h1>
        <p className="text-amber-300/60 text-sm">Dia {liveDayNumber}</p>
      </header>

      {/* Timer */}
      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-5 text-center">
        <div className="text-xs uppercase tracking-wider text-stone-400 mb-1">
          {isPaused ? 'Em pausa' : 'Tempo restante'}
        </div>
        <div className={`text-6xl font-black font-mono ${isPaused ? 'text-stone-500' : remaining !== null && remaining < 10 ? 'text-red-300' : 'text-amber-100'}`}>
          {remaining ?? '—'}s
        </div>
      </section>

      {/* Progresso */}
      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-amber-200 text-sm font-semibold">
            {progress.submitted} / {progress.expected} já agiram
          </span>
          {allReady && (
            <span className="text-emerald-300 text-sm flex items-center gap-1 font-semibold">
              <Check className="w-4 h-4" /> Todos prontos
            </span>
          )}
        </div>
        <div className="h-2 bg-stone-950 rounded overflow-hidden">
          <div
            className={`h-full transition-all ${allReady ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: progress.expected ? `${(progress.submitted / progress.expected) * 100}%` : '0%' }}
          />
        </div>
        {progress.pending_names.length > 0 && (
          <p className="text-stone-400 text-xs mt-2">
            A faltar: {progress.pending_names.join(', ')}
          </p>
        )}
      </section>

      {error && (
        <div className="bg-red-950/50 border border-red-700 text-red-200 rounded p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Controlos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {isPaused ? (
          <button
            onClick={() => wrap(() => resumePhase(sessionId))}
            disabled={busy}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" /> Retomar
          </button>
        ) : (
          <button
            onClick={() => wrap(() => pausePhase(sessionId))}
            disabled={busy}
            className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2"
          >
            <Pause className="w-4 h-4" /> Pausar
          </button>
        )}
        <button
          onClick={() => wrap(() => extendPhase(sessionId, 30))}
          disabled={busy}
          className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> 30s
        </button>
        <button
          onClick={() => wrap(() => extendPhase(sessionId, 60))}
          disabled={busy}
          className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> 1min
        </button>
        <button
          onClick={() => wrap(() => advanceNightPhase(sessionId))}
          disabled={busy}
          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3 rounded flex items-center justify-center gap-2"
        >
          <FastForward className="w-4 h-4" /> Avançar
        </button>
      </div>

      <HostAlertPanel sessionId={sessionId} players={allPlayers} />
    </main>
  )
}

/**
 * Pequeno componente partilhado: botão "Começar Noite" usado nas transições
 * (role_reveal → night, day_result → night).
 */
export function StartNightButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <button
        onClick={async () => {
          setBusy(true); setError(null)
          const r = await startNight(sessionId)
          if (r.error) setError(r.error)
          setBusy(false)
        }}
        disabled={busy}
        className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-3 px-6 rounded flex items-center gap-2 mx-auto"
      >
        <Moon className="w-5 h-5" /> {busy ? 'A começar…' : 'Começar a Noite'}
      </button>
      {error && <p className="text-red-300 text-sm text-center">{error}</p>}
    </div>
  )
}
