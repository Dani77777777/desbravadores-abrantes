'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

interface PhaseState {
  status: string
  phase_ends_at: string | null
  phase_paused_at: string | null
  day_number: number
  /** Lado vencedor — vem no MESMO update que põe status='finished', evitando
   *  mostrar o vencedor errado por instantes na transição. */
  winner_side?: string | null
}

/**
 * Mantém o estado da fase (status, timer, pausa) em sync sem depender de
 * router.refresh() para o timer/pausa.
 *
 * Estratégia tripla (defesa em profundidade):
 *   1. Realtime: UPDATE em vanacamp_sessions → state local
 *   2. Polling a 1s: query direta à BD (fallback se websocket falhar/throttle)
 *   3. router.refresh() apenas quando o `status` muda (para re-render dos
 *      componentes de fase). Para timer/pausa NÃO chama refresh — só atualiza
 *      state — para não perder user-activation.
 */
export function useLiveSession(
  sessionId: string,
  initial: PhaseState,
): PhaseState {
  const router = useRouter()
  const [state, setState] = useState<PhaseState>(initial)

  // Atualiza se os props iniciais mudarem (após router.refresh server-side)
  useEffect(() => {
    setState((prev) => {
      // Se valores são iguais, evita re-render
      if (
        prev.status === initial.status &&
        prev.phase_ends_at === initial.phase_ends_at &&
        prev.phase_paused_at === initial.phase_paused_at &&
        prev.day_number === initial.day_number &&
        (prev.winner_side ?? null) === (initial.winner_side ?? null)
      ) return prev
      return initial
    })
  }, [initial.status, initial.phase_ends_at, initial.phase_paused_at, initial.day_number, initial.winner_side])

  useEffect(() => {
    const supabase = createClient()
    let isMounted = true

    function apply(next: PhaseState) {
      if (!isMounted) return
      setState((prev) => {
        if (
          prev.status === next.status &&
          prev.phase_ends_at === next.phase_ends_at &&
          prev.phase_paused_at === next.phase_paused_at &&
          prev.day_number === next.day_number &&
          (prev.winner_side ?? null) === (next.winner_side ?? null)
        ) return prev
        // Status mudou → re-render do server p/ trocar de componente
        if (next.status !== prev.status) router.refresh()
        return next
      })
    }

    async function fetchOnce() {
      const { data } = await supabase
        .from('vanacamp_sessions')
        .select('status, phase_ends_at, phase_paused_at, day_number, winner_side')
        .eq('id', sessionId)
        .maybeSingle()
      if (data) apply(data as PhaseState)
    }

    // Realtime — caminho rápido
    const ch = supabase
      .channel(`vc_live_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanacamp_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const next = payload.new as PhaseState
          apply({
            status: next.status,
            phase_ends_at: next.phase_ends_at,
            phase_paused_at: next.phase_paused_at,
            day_number: next.day_number,
            winner_side: next.winner_side ?? null,
          })
        }
      )
      .subscribe()

    // Polling de 1s — fallback robusto
    const i = setInterval(fetchOnce, 1000)

    return () => {
      isMounted = false
      supabase.removeChannel(ch)
      clearInterval(i)
    }
  }, [sessionId, router])

  return state
}
