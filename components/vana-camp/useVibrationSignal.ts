'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { vibrate, type VibrationPattern } from '@/utils/vibrate'

interface VibrateEventPayload {
  target_player_ids?: string[]
  target_role?: string
  pattern?: VibrationPattern
}

/**
 * Estado partilhado: já houve user-gesture neste separador?
 * Em separadores abertos via target="_blank" o user-activation não é herdado.
 */
let hasUserGesture = false
const gestureListeners = new Set<() => void>()

function notifyGesture() {
  if (hasUserGesture) return
  hasUserGesture = true
  try { navigator.vibrate?.(0) } catch {}
  gestureListeners.forEach((fn) => fn())
}

/**
 * Hook que:
 *   1. Faz "priming" da Vibration API ao primeiro click/touch/keydown
 *   2. Subscreve eventos `vibrate` da sessão
 *   3. Quando o sinal é para o myPlayerId (ou para todos):
 *      - dispara navigator.vibrate()
 *      - dispara também um flash visual (caso o vibrate falhe)
 *      - faz console.log para diagnóstico
 *
 * Retorna `{ needsGesture, flash }`:
 *   - needsGesture: ainda não houve interação no separador (mostra banner)
 *   - flash: timestamp do último sinal recebido (para animar UI)
 */
export function useVibrationSignal(sessionId: string, myPlayerId: string | null) {
  const [needsGesture, setNeedsGesture] = useState<boolean>(() => !hasUserGesture)
  const [flash, setFlash] = useState<number>(0)

  // Priming — qualquer interação activa a Vibration API
  useEffect(() => {
    if (hasUserGesture) return
    const handler = () => notifyGesture()
    document.addEventListener('click', handler, { passive: true })
    document.addEventListener('touchstart', handler, { passive: true })
    document.addEventListener('keydown', handler)
    const listener = () => setNeedsGesture(false)
    gestureListeners.add(listener)
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('keydown', handler)
      gestureListeners.delete(listener)
    }
  }, [])

  // Subscrição aos eventos vibrate
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
          if (!isForMe) return

          const ok = vibrate(ev.payload?.pattern ?? 'alert')
          // Flash sempre — feedback visual ajuda em iOS e na maioria dos casos
          setFlash(Date.now())
          if (typeof console !== 'undefined') {
            console.log('[vana-camp] vibrate signal received', {
              pattern: ev.payload?.pattern,
              vibrate_returned: ok,
              user_gesture: hasUserGesture,
            })
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, myPlayerId])

  return { needsGesture, flash }
}
