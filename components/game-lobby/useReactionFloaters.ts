'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Um emoji a subir no projetor. */
export interface LobbyFloater {
  id: number
  emoji: string
  name: string | null
  left: number // % da largura
  drift: number // px de desvio lateral durante a subida
  dur: number // s
  size: number // rem
}

/**
 * 'full'  → espalhados por todo o ecrã (sala de espera).
 * 'edges' → só nas margens esquerda/direita, mais pequenos, para não tapar a
 *           pergunta, as respostas nem o pódio (durante o jogo).
 */
export type FloaterLayout = 'full' | 'edges'

/** Máximo de emojis a voar ao mesmo tempo e por lote. */
const MAX_FLOATERS: Record<FloaterLayout, number> = { full: 45, edges: 30 }
const MAX_FLOATERS_PER_BATCH = 4

function place(layout: FloaterLayout) {
  if (layout === 'full') {
    return { left: 4 + Math.random() * 88, drift: (Math.random() - 0.5) * 180, size: 3 + Math.random() * 1.8 }
  }
  const leftSide = Math.random() < 0.5
  return {
    left: leftSide ? 0.5 + Math.random() * 6.5 : 92 + Math.random() * 5.5,
    drift: (leftSide ? 1 : -1) * Math.random() * 40,
    size: 2.2 + Math.random() * 1.2,
  }
}

/** Emojis a voar no projetor: cada lote de toques vira até 4 emojis espalhados pelo segundo. */
export function useReactionFloaters(layout: FloaterLayout) {
  const [floaters, setFloaters] = useState<LobbyFloater[]>([])
  const countRef = useRef(0)
  const seqRef = useRef(0)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t)
      fn()
    }, ms)
    timersRef.current.add(t)
  }, [])

  const spawn = useCallback((emoji: string, name: string | null) => {
    if (countRef.current >= MAX_FLOATERS[layout]) return
    countRef.current += 1
    const f: LobbyFloater = { id: ++seqRef.current, emoji, name, dur: 2.8 + Math.random() * 1.4, ...place(layout) }
    setFloaters((prev) => [...prev, f])
    later(() => {
      countRef.current -= 1
      setFloaters((prev) => prev.filter((x) => x.id !== f.id))
    }, f.dur * 1000 + 150)
  }, [layout, later])

  /** Alguns emojis do lote, espalhados pelo segundo; o nome só no primeiro. */
  const spawnBatch = useCallback((emojis: string[], name: string) => {
    const shown = Math.min(MAX_FLOATERS_PER_BATCH, emojis.length)
    for (let k = 0; k < shown; k++) {
      const emoji = emojis[Math.floor((k * emojis.length) / shown)]
      later(() => spawn(emoji, k === 0 ? name : null), k * 230)
    }
  }, [later, spawn])

  return { floaters, spawnBatch }
}
