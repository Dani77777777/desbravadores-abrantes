'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

interface PhaseState {
  status: string
  phase_ends_at: string | null
  phase_paused_at: string | null
  day_number: number
}

/**
 * Subscreve UPDATEs em vanacamp_sessions e mantém o estado da fase em sync
 * sem depender do router.refresh() (que tem latência e às vezes não propaga
 * para componentes client a tempo).
 *
 * Também chama router.refresh() quando o `status` muda (para re-renderizar
 * a fase nova), mas o timer/pausa são geridos via state local instantâneo.
 */
export function useLiveSession(
  sessionId: string,
  initial: PhaseState,
): PhaseState {
  const router = useRouter()
  const [state, setState] = useState<PhaseState>(initial)

  useEffect(() => {
    setState(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.status, initial.phase_ends_at, initial.phase_paused_at, initial.day_number])

  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_live_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanacamp_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const next = payload.new as PhaseState
          setState((prev) => {
            // Se a fase mudou, força refresh do server para mostrar a nova UI
            if (next.status !== prev.status) {
              router.refresh()
            }
            return {
              status: next.status,
              phase_ends_at: next.phase_ends_at,
              phase_paused_at: next.phase_paused_at,
              day_number: next.day_number,
            }
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, router])

  return state
}
