'use client'

import { Flame } from 'lucide-react'
import { usePhaseReload } from './usePhaseReload'

interface Props {
  sessionId: string
  message: string
  status?: string
}

/**
 * Ecrã neutro de espera entre fases. Usa `usePhaseReload` (soft refresh via
 * router.refresh) para reagir a mudanças sem perder user-activation.
 */
export function WaitingPhase({ sessionId, message, status }: Props) {
  usePhaseReload(sessionId, status ?? 'unknown')

  return (
    <main className="min-h-screen flex items-center justify-center text-center p-8">
      <div className="space-y-3">
        <Flame className="w-12 h-12 text-amber-400 mx-auto animate-pulse" />
        <p className="text-amber-100 text-xl font-bold">{message}</p>
        {status && <p className="text-stone-500 text-xs">({status})</p>}
      </div>
    </main>
  )
}
