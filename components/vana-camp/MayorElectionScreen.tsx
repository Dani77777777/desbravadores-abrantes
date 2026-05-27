'use client'

import { useEffect, useState } from 'react'
import { Crown, Check, Bot } from 'lucide-react'
import { getMyMayorVoteContext, submitMayorVote } from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { useLiveSession } from './useLiveSession'
import { useVibrationSignal } from './useVibrationSignal'
import { VibrationFlash } from './VibrationFlash'
import { usePhaseReload } from './usePhaseReload'
import { usePhaseCountdown } from './usePhaseCountdown'

interface Props {
  sessionId: string
  phaseEndsAt: string | null
  phasePausedAt: string | null
  impersonatingBotId?: string
  impersonatingBotName?: string
}

export function MayorElectionScreen({
  sessionId, phaseEndsAt, phasePausedAt, impersonatingBotId, impersonatingBotName,
}: Props) {
  const live = useLiveSession(sessionId, {
    status: 'mayor_election',
    phase_ends_at: phaseEndsAt,
    phase_paused_at: phasePausedAt,
    day_number: 0,
  })
  usePhaseReload(sessionId, 'mayor_election')
  const remaining = usePhaseCountdown(live.phase_ends_at, live.phase_paused_at)

  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getMyMayorVoteContext>> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { needsGesture, flash } = useVibrationSignal(sessionId, ctx?.my_player_id ?? null)

  async function refresh() {
    const r = await getMyMayorVoteContext(sessionId, impersonatingBotId)
    setCtx(r)
  }

  useEffect(() => {
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_mayor_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacamp_votes', filter: `session_id=eq.${sessionId}` }, refresh)
      .subscribe()
    const i = setInterval(refresh, 2000)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, impersonatingBotId])

  if (!ctx || ctx.error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-900 via-stone-900 to-stone-950 text-amber-100">
        {ctx?.error ?? 'A preparar eleição…'}
      </main>
    )
  }

  const tallyByTarget = new Map<string, number>()
  for (const v of ctx.votes ?? []) {
    tallyByTarget.set(v.target_id, (tallyByTarget.get(v.target_id) ?? 0) + 1)
  }

  async function handleVote(targetId: string) {
    setError(null)
    setPending(true)
    const r = await submitMayorVote(sessionId, targetId, impersonatingBotId)
    setPending(false)
    if (r.error) setError(r.error)
    refresh()
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-amber-800 via-amber-950 to-stone-950 text-amber-100">
      <VibrationFlash flash={flash} needsGesture={needsGesture} />
      {impersonatingBotName && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-purple-900/80 border border-purple-500 rounded-full px-3 py-1 flex items-center gap-2 text-purple-100 text-xs z-30">
          <Bot className="w-4 h-4" /> A controlar <strong>{impersonatingBotName}</strong>
        </div>
      )}
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="text-center space-y-2 py-4">
          <Crown className="w-16 h-16 text-amber-300 mx-auto drop-shadow-[0_0_20px_rgba(252,211,77,0.6)]" />
          <h1 className="text-3xl md:text-4xl font-black">Eleger o Diretor do Clube</h1>
          <p className="text-amber-200/70 text-sm">
            O Diretor desempata em caso de igualdade nas votações de expulsão.
          </p>
          {remaining !== null && (
            <p className="text-amber-200 text-2xl font-black mt-1">{remaining}s</p>
          )}
        </header>

        <ul className="space-y-2">
          {(ctx.players ?? []).map((p) => {
            const isSelected = p.id === ctx.current_target_id
            const count = tallyByTarget.get(p.id) ?? 0
            return (
              <li key={p.id}>
                <button
                  onClick={() => handleVote(p.id)}
                  disabled={pending}
                  className={`w-full text-left px-4 py-3 rounded border transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-600/60 border-amber-300 text-white'
                      : 'bg-black/30 border-amber-700/50 hover:bg-black/50 text-amber-100'
                  } disabled:opacity-50`}
                >
                  <span className="font-medium">{p.display_name}</span>
                  <span className="flex items-center gap-3">
                    {count > 0 && (
                      <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {count}
                      </span>
                    )}
                    {isSelected && <Check className="w-5 h-5" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {error && (
          <div className="bg-red-950/60 border border-red-700 text-red-100 rounded p-3 text-sm">
            {error}
          </div>
        )}
      </div>
    </main>
  )
}
