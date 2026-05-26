'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

/**
 * Faz hard reload da página quando o `status` da sessão mudar relativamente
 * ao valor inicial. Usa realtime (rápido) + polling (fallback de 2s).
 *
 * Hard reload em vez de router.refresh() porque este último por vezes falha
 * em propagar quando o tab está em background, ou quando há React Strict Mode
 * a desmontar/remontar componentes.
 */
export function usePhaseReload(sessionId: string, currentStatus: string) {
  const initialStatus = useRef(currentStatus)

  useEffect(() => {
    // Atualiza referência se o prop mudar legitimamente entre renders do server
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
        window.location.reload()
      }
    }

    const ch = supabase
      .channel(`vc_phase_reload_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanacamp_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const next = (payload.new as { status?: string }).status
          if (next && next !== initialStatus.current) window.location.reload()
        }
      )
      .subscribe()

    const i = setInterval(check, 2000)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
  }, [sessionId])
}
