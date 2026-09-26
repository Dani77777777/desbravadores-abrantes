'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createClient } from '@/utils/supabase/client'
import { lobbyTopic, LOBBY_EMOJIS, LOBBY_THEMES, type LobbyGame } from './content'

/** Toques mais rápidos do que isto não contam (evita "metralhadora"). */
const MIN_TAP_GAP_MS = 110
const FLUSH_MS = 1000
const MAX_TAPS_PER_BATCH = 12

/**
 * Teclado de reações no TELEMÓVEL, na sala de espera. Cada toque manda um emoji
 * para o projetor e enche a "Energia da sala".
 *
 * Os toques juntam-se e seguem num lote por segundo, por HTTP (httpSend), SEM
 * subscrever o canal: o telemóvel não recebe as reações dos outros, por isso não
 * há N² de mensagens (ver useLobbyHype).
 */
export function LobbyReactionPad({
  game,
  sessionId,
  playerId,
}: {
  game: LobbyGame
  sessionId: string
  playerId: string | null
}) {
  const emojis = LOBBY_EMOJIS[game]
  const theme = LOBBY_THEMES[game]
  const pendingRef = useRef<number[]>([])
  const lastTapRef = useRef(0)
  const seqRef = useRef(0)
  const [taps, setTaps] = useState(0)
  const [bursts, setBursts] = useState<{ id: number; btn: number; drift: number }[]>([])

  useEffect(() => {
    if (!playerId) return
    const supabase = createClient()
    const ch = supabase.channel(lobbyTopic(game, sessionId))
    const flush = () => {
      if (!pendingRef.current.length) return
      const batch = pendingRef.current.splice(0).slice(0, MAX_TAPS_PER_BATCH)
      ch.httpSend('tap', { pid: playerId, e: batch }).catch(() => {})
    }
    const id = setInterval(flush, FLUSH_MS)
    return () => {
      clearInterval(id)
      flush()
      supabase.removeChannel(ch)
    }
  }, [game, sessionId, playerId])

  // Usa o timeStamp do evento (e não Date.now) para medir o intervalo entre toques.
  const tap = (i: number, now: number) => {
    if (!playerId || now - lastTapRef.current < MIN_TAP_GAP_MS) return
    lastTapRef.current = now
    pendingRef.current.push(i)
    setTaps((t) => t + 1)
    try { navigator.vibrate?.(8) } catch {}

    const id = ++seqRef.current
    const burst = { id, btn: i, drift: ((id * 37) % 61) - 30 } // desvio "aleatório" mas determinista
    setBursts((prev) => [...prev.slice(-11), burst])
    setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== burst.id)), 750)
  }

  return (
    <div className="w-full">
      <p className={`${theme.accent} text-xs font-black uppercase tracking-widest mb-2.5`}>
        ⚡ Dá energia à sala!
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        {emojis.map((emoji, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => tap(i, e.timeStamp)}
            disabled={!playerId}
            className="relative aspect-square rounded-2xl bg-white/10 border border-white/15 text-4xl flex items-center justify-center active:scale-90 active:bg-white/25 transition-transform duration-75 select-none touch-manipulation disabled:opacity-40"
            aria-label={`Enviar ${emoji}`}
          >
            {emoji}
            {bursts.filter((b) => b.btn === i).map((b) => (
              <span
                key={b.id}
                className="lobby-tap absolute left-1/2 top-1 text-3xl pointer-events-none"
                style={{ '--drift': `${b.drift}px` } as CSSProperties}
              >
                {emoji}
              </span>
            ))}
          </button>
        ))}
      </div>
      <p className="text-white/60 text-xs mt-2.5 tabular-nums">
        {taps === 0 ? 'Toca e vê o teu emoji no ecrã grande 👀' : `${taps} ${taps === 1 ? 'toque de energia enviado' : 'toques de energia enviados'} 🔥`}
      </p>
    </div>
  )
}
