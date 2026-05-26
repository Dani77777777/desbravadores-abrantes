'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

/**
 * Re-renderiza a página sempre que o estado da sessão muda.
 * Usar em componentes de fase para que avancem quando o host transita.
 */
export function useSessionRealtime(sessionId: string) {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_session_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanacamp_sessions', filter: `id=eq.${sessionId}` },
        () => router.refresh()
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, router])
}
