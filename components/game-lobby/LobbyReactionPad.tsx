'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { lobbyTopic, LOBBY_EMOJIS, LOBBY_THEMES, type LobbyGame } from './content'
import { MAX_TAPS_PER_BATCH, sendReactionTaps } from './reactions'

/** Toques mais rápidos do que isto não contam (evita "metralhadora"). */
const MIN_TAP_GAP_MS = 110
const FLUSH_MS = 1000

/**
 * Teclado de reações no TELEMÓVEL. Cada toque manda um emoji para o projetor.
 *  - 'pad' → grelha grande na sala de espera (enche a "Energia da sala");
 *  - 'bar' → barra fixa no fundo durante o resto do jogo (os emojis sobem pelas
 *            margens do projetor). Com `hidden` desaparece (ex.: enquanto se
 *            responde) sem perder o que ainda está por enviar.
 *
 * Os toques juntam-se e seguem num lote por segundo, por HTTP (httpSend), SEM
 * subscrever o canal: o telemóvel não recebe as reações dos outros, por isso não
 * há N² de mensagens (ver reactions.ts).
 */
export function LobbyReactionPad({
  game,
  sessionId,
  playerId,
  variant = 'pad',
  hidden = false,
}: {
  game: LobbyGame
  sessionId: string
  playerId: string | null
  variant?: 'pad' | 'bar'
  hidden?: boolean
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
    const topic = lobbyTopic(game, sessionId)
    const flush = () => {
      if (!pendingRef.current.length) return
      sendReactionTaps(topic, playerId, pendingRef.current.splice(0).slice(0, MAX_TAPS_PER_BATCH))
    }
    const id = setInterval(flush, FLUSH_MS)
    return () => {
      clearInterval(id)
      flush()
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

  const buttons = (small: boolean) =>
    emojis.map((emoji, i) => (
      <button
        key={i}
        type="button"
        onClick={(e) => tap(i, e.timeStamp)}
        disabled={!playerId}
        className={`relative flex items-center justify-center bg-white/10 border border-white/15 active:scale-90 active:bg-white/25 transition-transform duration-75 select-none touch-manipulation disabled:opacity-40 ${
          small ? 'h-12 rounded-xl text-2xl' : 'aspect-square rounded-2xl text-4xl'
        }`}
        aria-label={`Enviar ${emoji}`}
      >
        {emoji}
        {bursts.filter((b) => b.btn === i).map((b) => (
          <span
            key={b.id}
            className={`lobby-tap absolute left-1/2 top-1 pointer-events-none ${small ? 'text-2xl' : 'text-3xl'}`}
            style={{ '--drift': `${b.drift}px` } as CSSProperties}
          >
            {emoji}
          </span>
        ))}
      </button>
    ))

  if (variant === 'bar') {
    if (hidden || !playerId) return null
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/55 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.6rem)] backdrop-blur-md animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="mx-auto grid max-w-sm grid-cols-6 gap-1.5">{buttons(true)}</div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <p className={`${theme.accent} text-xs font-black uppercase tracking-widest mb-2.5`}>
        ⚡ Dá energia à sala!
      </p>
      <div className="grid grid-cols-3 gap-2.5">{buttons(false)}</div>
      <p className="text-white/60 text-xs mt-2.5 tabular-nums">
        {taps === 0 ? 'Toca e vê o teu emoji no ecrã grande 👀' : `${taps} ${taps === 1 ? 'toque de energia enviado' : 'toques de energia enviados'} 🔥`}
      </p>
    </div>
  )
}
