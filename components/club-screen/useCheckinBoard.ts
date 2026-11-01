'use client'

import { useEffect, useState } from 'react'
import { getCheckinBoard, type CheckinBoard } from '@/lib/actions/checkin'

/**
 * Quem já marcou presença e o código do QR de agora, pedidos ao servidor de `everyMs`
 * em `everyMs` (o QR muda a cada 30 s e a tabela dos convidados só o servidor lê).
 */
export function useCheckinBoard(eventId: string | null, everyMs: number) {
  const [board, setBoard] = useState<CheckinBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    const load = async () => {
      try {
        const r = await getCheckinBoard(eventId)
        if (cancelled) return
        if ('error' in r) setError(r.error)
        else {
          setBoard(r)
          setError(null)
        }
      } catch {
        /* sem rede: tenta outra vez na próxima volta */
      }
    }
    load()
    const t = setInterval(load, everyMs)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [eventId, everyMs, tick])

  const current = board && board.event.id === eventId ? board : null
  return { board: current, error: eventId ? error : null, refresh: () => setTick((n) => n + 1) }
}
