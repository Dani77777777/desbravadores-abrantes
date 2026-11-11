'use client'

import { useEffect, useState } from 'react'
import { Crown, Play, Pause, Plus, FastForward, AlertCircle } from 'lucide-react'
import {
  pausePhase, resumePhase, extendPhase, resolveMayorElection, getMayorElectionProgress,
} from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { useLiveSession } from './useLiveSession'
import { usePhaseReload, useOutOfPhaseRefresh } from './usePhaseReload'
import { usePhaseCountdown } from './usePhaseCountdown'
import { HostAlertPanel } from './HostAlertPanel'

interface Props {
  sessionId: string
  phaseEndsAt: string | null
  phasePausedAt: string | null
  allPlayers: { id: string; display_name: string; is_alive: boolean }[]
}

export function HostMayorElectionMonitor({ sessionId, phaseEndsAt, phasePausedAt, allPlayers }: Props) {
  const live = useLiveSession(sessionId, {
    status: 'mayor_election',
    phase_ends_at: phaseEndsAt,
    phase_paused_at: phasePausedAt,
    day_number: 0,
  })
  usePhaseReload(sessionId, 'mayor_election')
  const remaining = usePhaseCountdown(live.phase_ends_at, live.phase_paused_at)
  const isPaused = !!live.phase_paused_at

  // Quando a eleição é apurada, a fase passa a night_infiltrators → refresh até apanhar.
  const outOfPhase = live.status !== 'mayor_election'
  useOutOfPhaseRefresh(outOfPhase)

  const [tally, setTally] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameById = new Map(allPlayers.map((p) => [p.id, p.display_name]))

  useEffect(() => {
    async function refresh() {
      // Host não é jogador — usa a função host-only para ler os votos.
      const r = await getMayorElectionProgress(sessionId)
      if (r.votes) {
        const counts: Record<string, number> = {}
        for (const v of r.votes) counts[v.target_id] = (counts[v.target_id] ?? 0) + 1
        setTally(counts)
      }
    }
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_host_mayor_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacamp_votes', filter: `session_id=eq.${sessionId}` }, refresh)
      .subscribe()
    const i = setInterval(refresh, 1500)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
  }, [sessionId])

  async function wrap(fn: () => Promise<{ error?: string }>) {
    setBusy(true); setError(null)
    const r = await fn()
    setBusy(false)
    if (r.error) setError(r.error)
  }

  const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)
  const max = sorted[0]?.[1] ?? 0

  if (outOfPhase) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 text-amber-100">
        <Crown className="w-16 h-16 text-amber-300/60 mb-4 animate-pulse" />
        <p className="text-xl font-semibold">Eleição terminada</p>
        <p className="text-stone-400 text-sm mt-2">A começar a noite…</p>
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
      <header className="text-center space-y-2 py-4">
        <Crown className="w-12 h-12 text-amber-300 mx-auto" />
        <h1 className="text-3xl font-black text-amber-100">Eleição do Diretor</h1>
        <p className="text-amber-300/60 text-sm">Dia 1</p>
      </header>

      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-5 text-center">
        <div className="text-xs uppercase tracking-wider text-stone-400 mb-1">
          {isPaused ? 'Em pausa' : 'Tempo restante'}
        </div>
        <div className={`text-6xl font-black font-mono ${isPaused ? 'text-stone-500' : remaining !== null && remaining < 10 ? 'text-red-300' : 'text-amber-100'}`}>
          {remaining ?? '—'}s
        </div>
      </section>

      {sorted.length > 0 && (
        <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4">
          <h3 className="text-amber-200 text-xs uppercase tracking-wider font-semibold mb-2">Contagem em direto</h3>
          <ul className="space-y-1">
            {sorted.map(([id, count]) => {
              const isLeader = count === max
              return (
                <li key={id} className={`flex justify-between items-center px-3 py-2 rounded text-sm ${isLeader ? 'bg-amber-900/30' : 'bg-stone-900/60'}`}>
                  <span className="text-stone-100 flex items-center gap-2">
                    {isLeader && <Crown className="w-4 h-4 text-amber-300" />}
                    {nameById.get(id) ?? '?'}
                  </span>
                  <span className="text-amber-300 font-bold">{count} {count === 1 ? 'voto' : 'votos'}</span>
                </li>
              )
            })}
          </ul>
          {sorted.length > 1 && sorted[0][1] === sorted[1][1] && (
            <p className="text-amber-300 text-xs mt-2">⚠ Empate — sem desempate disponível, ficará sem Diretor.</p>
          )}
        </section>
      )}

      {error && (
        <div className="bg-red-950/50 border border-red-700 text-red-200 rounded p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
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
        <button onClick={() => wrap(() => extendPhase(sessionId, 60))} disabled={busy} className="bg-stone-700 hover:bg-stone-600 disabled:opacity-50 text-white font-semibold py-3 rounded flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> 1min
        </button>
      </div>
      <button onClick={() => wrap(() => resolveMayorElection(sessionId))} disabled={busy} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3 rounded flex items-center justify-center gap-2">
        <FastForward className="w-5 h-5" /> Apurar e seguir para noite
      </button>

      <HostAlertPanel sessionId={sessionId} players={allPlayers} />
    </main>
  )
}
