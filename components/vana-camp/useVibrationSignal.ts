'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { vibrate, type VibrationPattern } from '@/utils/vibrate'
import { useWakeLock } from './useWakeLock'

interface VibrateEventPayload {
  target_player_ids?: string[]
  target_role?: string
  pattern?: VibrationPattern
}

/**
 * Janela de recuperação: ao (re)subscrever o canal ou ao voltar a `visible`,
 * sinais `vibrate` mais recentes do que isto são disparados se ainda não
 * tiverem sido consumidos. Mais antigos são ignorados (já não são relevantes).
 */
const MISSED_SIGNAL_WINDOW_MS = 30_000

/**
 * Estado partilhado: já houve user-gesture neste separador?
 * Em separadores abertos via target="_blank" o user-activation não é herdado.
 */
let hasUserGesture = false
const gestureListeners = new Set<() => void>()

/**
 * IDs de eventos `vibrate` já consumidos. A nível de módulo para sobreviver
 * a trocas de ecrã (DayScreen → NightScreen, etc.) — sem isto a recuperação
 * ao montar repetiria vibrações já disparadas pelo ecrã anterior.
 */
const consumedSignalIds = new Set<string>()

function notifyGesture() {
  if (hasUserGesture) return
  hasUserGesture = true
  try { navigator.vibrate?.(0) } catch {}
  gestureListeners.forEach((fn) => fn())
}

/**
 * Hook que:
 *   1. Faz "priming" da Vibration API ao primeiro click/touch/keydown
 *   2. Pede um Screen Wake Lock (ecrã bloqueado = websocket congelado + vibrate ignorado)
 *   3. Subscreve eventos `vibrate` da sessão
 *   4. Recupera sinais perdidos (postgres_changes não tem replay) quando:
 *      - o canal (re)subscreve com sucesso — cobre quedas de websocket e
 *        a janela de troca de ecrã entre fases
 *      - o separador volta a ficar visível — cobre ecrã bloqueado / background
 *   5. Se a vibração falhou por falta de user-gesture, repete-a ao primeiro toque
 *   6. Quando o sinal é para o myPlayerId (ou para todos):
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

  useWakeLock()

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

  // Subscrição aos eventos vibrate + recuperação de sinais perdidos
  useEffect(() => {
    if (!myPlayerId) return
    const supabase = createClient()
    let disposed = false
    // Último sinal cuja vibração falhou (ex.: sem user-gesture ainda) —
    // repetido ao primeiro toque se ainda estiver fresco.
    let pendingRetry: { pattern: VibrationPattern; at: number } | null = null

    function isForMe(payload?: VibrateEventPayload) {
      const targets = payload?.target_player_ids
      return !targets || targets.includes(myPlayerId!)
    }

    function handleSignal(id: string, payload?: VibrateEventPayload) {
      if (consumedSignalIds.has(id)) return
      consumedSignalIds.add(id)
      const pattern = payload?.pattern ?? 'alert'
      const ok = vibrate(pattern)
      if (!ok) pendingRetry = { pattern, at: Date.now() }
      // Flash sempre — feedback visual ajuda em iOS e na maioria dos casos
      setFlash(Date.now())
      if (typeof console !== 'undefined') {
        console.log('[vana-camp] vibrate signal', {
          id,
          pattern,
          vibrate_returned: ok,
          user_gesture: hasUserGesture,
        })
      }
    }

    /**
     * postgres_changes não tem replay: eventos emitidos enquanto o websocket
     * esteve em baixo ou o separador escondido perdem-se. Consulta a tabela
     * diretamente e dispara os sinais recentes ainda não consumidos.
     */
    async function recoverMissedSignals() {
      const since = new Date(Date.now() - MISSED_SIGNAL_WINDOW_MS).toISOString()
      const { data } = await supabase
        .from('vanacamp_events')
        .select('id, payload')
        .eq('session_id', sessionId)
        .eq('event_type', 'vibrate')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
      if (disposed || !data) return
      for (const ev of data) {
        const payload = ev.payload as VibrateEventPayload | undefined
        if (isForMe(payload)) handleSignal(ev.id, payload)
      }
    }

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
          const ev = payload.new as { id: string; event_type?: string; payload?: VibrateEventPayload }
          if (ev.event_type !== 'vibrate') return
          if (!isForMe(ev.payload)) return
          handleSignal(ev.id, ev.payload)
        }
      )
      .subscribe((status) => {
        // Dispara na primeira subscrição e em cada rejoin após queda do websocket
        if (status === 'SUBSCRIBED') recoverMissedSignals()
      })

    const onVisibility = () => {
      if (document.visibilityState === 'visible') recoverMissedSignals()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // O Chrome bloqueia vibrate() sem sticky activation — ao primeiro toque
    // repete o último sinal falhado, se ainda estiver dentro da janela.
    const onGesture = () => {
      if (pendingRetry && Date.now() - pendingRetry.at < MISSED_SIGNAL_WINDOW_MS) {
        vibrate(pendingRetry.pattern)
      }
      pendingRetry = null
    }
    gestureListeners.add(onGesture)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      gestureListeners.delete(onGesture)
      supabase.removeChannel(ch)
    }
  }, [sessionId, myPlayerId])

  return { needsGesture, flash }
}
