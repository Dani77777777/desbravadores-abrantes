'use client'

import { useEffect } from 'react'

/**
 * Mantém o ecrã aceso enquanto o componente está montado (Screen Wake Lock API).
 *
 * Motivo: com o ecrã bloqueado, o Android congela o websocket do Supabase e o
 * Chrome ignora navigator.vibrate() — os sinais de vibração perdem-se.
 *
 * O browser liberta o lock automaticamente quando a página deixa de estar
 * visível, por isso voltamos a pedi-lo em cada regresso a `visible`.
 *
 * Suporte: Chrome/Edge (Android e desktop), Safari 16.4+. Falha silenciosamente
 * onde não existe ou quando o browser recusa (ex.: modo poupança de bateria).
 */
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    const wakeLock = navigator.wakeLock

    let sentinel: WakeLockSentinel | null = null
    let disposed = false

    async function request() {
      if (disposed || document.visibilityState !== 'visible') return
      try {
        sentinel = await wakeLock.request('screen')
      } catch {
        // Recusado pelo browser — não há alternativa, o resto do sistema
        // (recuperação de sinais perdidos) cobre este caso.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') request()
    }

    request()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel?.release().catch(() => {})
    }
  }, [])
}
