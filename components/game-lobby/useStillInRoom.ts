'use client'

import { useEffect, useRef } from 'react'

/** Porque é que o jogador deixou de estar na sessão. */
export type RoomGoneReason = 'inactive' | 'removed'

/** Uma ausência (ecrã bloqueado / outra app) a partir disto conta como "inativo". */
const AWAY_MS = 10_000
/** Durante quanto tempo, depois de voltar, uma remoção ainda é atribuída à ausência. */
const RETURN_WINDOW_MS = 60_000

/**
 * Confirma na BD que o jogador ainda existe na sessão.
 *
 * Com o telemóvel bloqueado, o websocket morre. No VanaQuest a presença sai, o anfitrião
 * remove o jogador da sala de espera, e o DELETE do realtime que o avisaria nunca
 * chega. Ao voltar, o ecrã continuava a mostrar a sala e os emojis não iam para lado
 * nenhum (o projetor ignora quem não está na lista). Por isso verificamos:
 *  - ao voltar ao separador (visibilitychange) e ao recuperar a rede (online);
 *  - de `pollMs` em `pollMs` (usado na sala de espera, onde a remoção acontece).
 *
 * `exists` devolve true/false, ou null se a verificação falhou (rede) — aí não se faz nada.
 * O motivo é "inactive" se o telemóvel esteve fora ≥10 s há pouco tempo, senão "removed".
 */
export function useStillInRoom({
  enabled,
  pollMs,
  exists,
  onGone,
}: {
  enabled: boolean
  /** 0 = sem verificação periódica. */
  pollMs: number
  exists: () => Promise<boolean | null>
  onGone: (reason: RoomGoneReason) => void
}) {
  const existsRef = useRef(exists)
  const onGoneRef = useRef(onGone)
  useEffect(() => {
    existsRef.current = exists
    onGoneRef.current = onGone
  })

  const hiddenAtRef = useRef<number | null>(null)
  const lastAwayRef = useRef<{ ms: number; returnedAt: number } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let checking = false

    const check = async () => {
      if (checking) return
      checking = true
      try {
        const ok = await existsRef.current()
        if (cancelled || ok !== false) return
        const away = lastAwayRef.current
        const now = Date.now()
        const wasAway =
          document.hidden ||
          (away != null && away.ms >= AWAY_MS && now - away.returnedAt < RETURN_WINDOW_MS)
        onGoneRef.current(wasAway ? 'inactive' : 'removed')
      } finally {
        checking = false
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        return
      }
      if (hiddenAtRef.current != null) {
        const now = Date.now()
        lastAwayRef.current = { ms: now - hiddenAtRef.current, returnedAt: now }
        hiddenAtRef.current = null
      }
      void check()
    }
    const onOnline = () => { void check() }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    void check()
    const id = pollMs > 0 ? setInterval(() => { if (!document.hidden) void check() }, pollMs) : null

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      if (id) clearInterval(id)
    }
  }, [enabled, pollMs])
}
