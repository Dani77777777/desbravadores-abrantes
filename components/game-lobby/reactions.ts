'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'

// Reações em emoji (sala de espera + resto do jogo).
//
// Realtime: os telemóveis só ENVIAM (httpSend, sem subscrever) e só o projetor
// SUBSCREVE — cada toque chega a UM cliente, nunca a todos (o N² de mensagens que
// em junho saturou o realtime não pode voltar). Os lotes são de no máximo 1/s.
//
// Cada página tem UM canal por tópico, partilhado por quem precisa dele: a sala de
// espera e o jogo trocam de ecrã sem fechar e reabrir a ligação (o supabase-js
// devolve o canal antigo enquanto ele ainda está a fechar, o que perdia reações).

/** Limites anti-abuso por lote/telemóvel (o cliente já respeita, o projetor confirma). */
export const MAX_TAPS_PER_BATCH = 12
const MIN_BATCH_GAP_MS = 700
/** Depois do último ouvinte sair, o canal fica aberto um bocado (para a mudança de ecrã). */
const CLOSE_DELAY_MS = 3000

type TapHandler = (payload: unknown) => void

interface Bus {
  channel: RealtimeChannel
  handlers: Set<TapHandler>
  closeTimer: ReturnType<typeof setTimeout> | null
}

const buses = new Map<string, Bus>()

/** PROJETOR: ouvir os lotes de toques de um tópico. Devolve a função para deixar de ouvir. */
export function onReactionTaps(topic: string, handler: TapHandler): () => void {
  let bus = buses.get(topic)
  if (!bus) {
    const supabase = createClient()
    const channel = supabase.channel(topic, { config: { broadcast: { self: false } } })
    const created: Bus = { channel, handlers: new Set(), closeTimer: null }
    channel.on('broadcast', { event: 'tap' }, ({ payload }) => created.handlers.forEach((h) => h(payload)))
    channel.subscribe()
    buses.set(topic, created)
    bus = created
  }
  const current = bus
  if (current.closeTimer) {
    clearTimeout(current.closeTimer)
    current.closeTimer = null
  }
  current.handlers.add(handler)

  return () => {
    current.handlers.delete(handler)
    if (current.handlers.size > 0) return
    current.closeTimer = setTimeout(() => {
      if (current.handlers.size > 0) return
      buses.delete(topic)
      createClient().removeChannel(current.channel)
    }, CLOSE_DELAY_MS)
  }
}

const senders = new Map<string, RealtimeChannel>()

/** TELEMÓVEL: enviar um lote de índices de emoji (sem subscrever o canal). */
export function sendReactionTaps(topic: string, pid: string, taps: number[]) {
  if (!taps.length) return
  let channel = senders.get(topic)
  if (!channel) {
    channel = createClient().channel(topic)
    senders.set(topic, channel)
  }
  channel.httpSend('tap', { pid, e: taps.slice(0, MAX_TAPS_PER_BATCH) }).catch(() => {})
}

/**
 * PROJETOR: valida um lote recebido. Só conta jogadores da sessão, no máximo um
 * lote por jogador a cada 700 ms, e só índices da lista de emojis (ninguém
 * consegue pôr texto no ecrã). Devolve null se o lote não vale.
 */
export function parseTapBatch<P>(
  payload: unknown,
  players: Map<string, P>,
  lastBatch: Map<string, number>,
  emojiCount: number,
): { player: P; taps: number[] } | null {
  const p = payload as { pid?: unknown; e?: unknown } | null
  const pid = p?.pid
  const player = typeof pid === 'string' ? players.get(pid) : undefined
  if (!player || !Array.isArray(p?.e)) return null

  const now = Date.now()
  if (now - (lastBatch.get(pid as string) ?? 0) < MIN_BATCH_GAP_MS) return null
  lastBatch.set(pid as string, now)

  const taps = (p.e as unknown[])
    .slice(0, MAX_TAPS_PER_BATCH)
    .filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < emojiCount)
  return taps.length ? { player, taps } : null
}
