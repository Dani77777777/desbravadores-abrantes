'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

/**
 * Quando o `status` da sessão muda relativamente ao valor inicial, força
 * o servidor a re-renderizar via `router.refresh()`.
 *
 * IMPORTANTE: NÃO usa `window.location.reload()` porque isso reinicia a
 * user-activation do separador e desliga a Vibration API. Tem de ser soft
 * refresh para os jogadores não perderem permissão entre fases.
 *
 * Estratégia dupla:
 *   1. Subscrição realtime a UPDATEs (caminho rápido)
 *   2. Polling a 2s (fallback caso o websocket falhe)
 *
 * O componente client envolvente (useLiveSession etc.) também reage ao
 * status localmente para feedback imediato.
 */
export function usePhaseReload(sessionId: string, currentStatus: string) {
  const router = useRouter()
  const initialStatus = useRef(currentStatus)

  useEffect(() => {
    // Atualiza referência quando o prop muda legitimamente após server refresh
    initialStatus.current = currentStatus
  }, [currentStatus])

  useEffect(() => {
    const supabase = createClient()

    async function check() {
      const { data } = await supabase
        .from('vanacamp_sessions')
        .select('status')
        .eq('id', sessionId)
        .maybeSingle()
      if (!data) return
      if (data.status !== initialStatus.current) {
        router.refresh()
      }
    }

    const ch = supabase
      .channel(`vc_phase_reload_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanacamp_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const next = (payload.new as { status?: string }).status
          if (next && next !== initialStatus.current) router.refresh()
        }
      )
      .subscribe()

    const i = setInterval(check, 2000)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
  }, [sessionId, router])
}
