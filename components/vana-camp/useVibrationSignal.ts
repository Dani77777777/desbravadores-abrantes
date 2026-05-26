'use client'

import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { vibrate, type VibrationPattern } from '@/utils/vibrate'

interface VibrateEventPayload {
  target_player_ids?: string[]   // omitido = todos
  target_role?: string           // ou alvo por papel (avaliado server-side)
  pattern?: VibrationPattern
}

/**
 * Subscreve `vanacamp_events` da sessão e dispara vibração quando recebe
 * um evento `vibrate` cujo payload contenha o `myPlayerId` (ou seja "para todos").
 *
 * O servidor emite o evento já resolvido em `target_player_ids` para o cliente
 * só ter de comparar IDs (sem leak de papéis).
 */
export function useVibrationSignal(sessionId: string, myPlayerId: string | null) {
  useEffect(() => {
    if (!myPlayerId) return
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_vibe_${sessionId}_${myPlayerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vanacamp_events',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const ev = payload.new as { event_type?: string; payload?: VibrateEventPayload }
          if (ev.event_type !== 'vibrate') return
          const targets = ev.payload?.target_player_ids
          const isForMe = !targets || targets.includes(myPlayerId)
          if (isForMe) vibrate(ev.payload?.pattern ?? 'alert')
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, myPlayerId])
}
