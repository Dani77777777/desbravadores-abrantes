'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Flame } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface Props {
  sessionId: string
  message: string
  status?: string
}

/**
 * Ecrã neutro de espera entre fases.
 *
 * Estratégia dupla para detetar mudança de fase:
 *   1. Subscrição realtime a UPDATEs na sessão → router.refresh()
 *   2. Polling a cada 2s como fallback (caso websocket esteja a ser
 *      throttled em tab em background, etc.)
 *
 * Quando o status muda relativamente ao prop inicial, faz hard reload
 * para garantir que o server component re-corre e mostra a fase nova.
 */
export function WaitingPhase({ sessionId, message, status }: Props) {
  const router = useRouter()
  const initialStatus = useRef(status ?? null)

  useEffect(() => {
    const supabase = createClient()

    async function checkStatus() {
      const { data } = await supabase
        .from('vanacamp_sessions')
        .select('status')
        .eq('id', sessionId)
        .maybeSingle()
      if (!data) return
      if (initialStatus.current && data.status !== initialStatus.current) {
        // Status mudou — força reload completo para o server component re-renderizar
        // com a nova fase. router.refresh() não tem sido fiável em todos os casos.
        window.location.reload()
      } else if (!initialStatus.current) {
        initialStatus.current = data.status
      }
    }

    // Realtime (caminho rápido)
    const ch = supabase
      .channel(`vc_wait_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanacamp_sessions', filter: `id=eq.${sessionId}` },
        () => {
          router.refresh()
          // Também verifica para reload se for preciso
          checkStatus()
        }
      )
      .subscribe()

    // Polling (fallback)
    const i = setInterval(checkStatus, 2000)

    return () => {
      supabase.removeChannel(ch)
      clearInterval(i)
    }
  }, [sessionId, router])

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
