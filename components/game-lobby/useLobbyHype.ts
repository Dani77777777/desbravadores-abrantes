'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { createClient } from '@/utils/supabase/client'

/**
 * "Motor" da sala de espera no PROJETOR (VanaQuest + VanaEspada):
 *  - recebe as reações que os telemóveis enviam e põe-nas a voar;
 *  - enche a barra "Energia da sala" (cada toque conta) e sobe de nível;
 *  - anuncia quem entra ("X entrou na sala!") e os marcos (5, 10, 20… jogadores).
 *
 * Realtime: só o projetor SUBSCREVE o tópico da sala. Os telemóveis enviam por
 * HTTP (httpSend) sem subscrever, por isso cada toque chega a UM cliente e não a
 * todos — o N² de mensagens que em junho saturou o realtime não pode voltar aqui.
 * Cada telemóvel junta os toques e envia no máximo um lote por segundo.
 */

export interface LobbyPlayer {
  id: string
  name: string
  avatarUrl?: string | null
  isGuest?: boolean
}

export interface LobbyFloater {
  id: number
  emoji: string
  name: string | null
  left: number // % da largura
  drift: number // px de desvio lateral durante a subida
  dur: number // s
  size: number // rem
}

type CelebrationKind = { kind: 'level'; level: number } | { kind: 'milestone'; count: number }
export type LobbyCelebration = CelebrationKind & { key: number }

export interface LobbyArrival {
  key: number
  text: string
  player: LobbyPlayer | null
}

const MILESTONES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100]
/** Toques necessários por jogador para encher o nível 1 (cada nível pede +50%). */
const ENERGY_PER_PLAYER = 30
const MIN_LEVEL_TARGET = 60
/** Sem toques há X ms, a barra começa a descer devagar (~5%/s). */
const DECAY_AFTER_MS = 2500
const DECAY_PER_TICK = 0.005
const TICK_MS = 100
/** Limites anti-abuso por lote/telemóvel (o cliente já respeita, o projetor confirma). */
const MAX_TAPS_PER_BATCH = 12
const MIN_BATCH_GAP_MS = 700
/** Máximo de emojis a voar ao mesmo tempo e por lote. */
const MAX_FLOATERS = 45
const MAX_FLOATERS_PER_BATCH = 4
const ARRIVAL_MS = 1700
const CELEBRATION_MS = 3200
const FRESH_MS = 2600

const SOUNDS = '/sounds/VanaQuest - soundboard'
const sound = (file: string) => encodeURI(`${SOUNDS}/${file}`)

function levelTarget(playerCount: number, level: number) {
  return Math.max(MIN_LEVEL_TARGET, playerCount * ENERGY_PER_PLAYER) * (1 + 0.5 * (level - 1))
}

export function useLobbyHype({
  topic,
  players,
  loaded,
  emojis,
}: {
  topic: string
  players: LobbyPlayer[]
  /** true depois da 1.ª leitura dos jogadores — quem já lá estava não é "anunciado". */
  loaded: boolean
  emojis: string[]
}) {
  const [energy, setEnergy] = useState(0)
  const [level, setLevel] = useState(1)
  const [floaters, setFloaters] = useState<LobbyFloater[]>([])
  const [arrival, setArrival] = useState<LobbyArrival | null>(null)
  const [celebration, setCelebration] = useState<LobbyCelebration | null>(null)
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set())

  const playersRef = useRef<Map<string, LobbyPlayer>>(new Map())
  playersRef.current = new Map(players.map((p) => [p.id, p]))
  const emojisRef = useRef(emojis)
  emojisRef.current = emojis

  const rawRef = useRef(0)
  const levelRef = useRef(1)
  const lastTapRef = useRef(0)
  const lastBatchRef = useRef<Map<string, number>>(new Map())
  const floaterCountRef = useRef(0)
  const seqRef = useRef(0)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const knownRef = useRef<Set<string> | null>(null)
  const milestoneRef = useRef(0)
  const arrivalQueueRef = useRef<LobbyPlayer[]>([])
  const arrivalBusyRef = useRef(false)
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const popRef = useRef<HTMLAudioElement | null>(null)
  const levelUpRef = useRef<HTMLAudioElement | null>(null)

  /** setTimeout que é limpo sozinho quando a sala de espera desmonta. */
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t)
      fn()
    }, ms)
    timersRef.current.add(t)
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current)
    }
  }, [])

  // ── Sons (só o projetor toca; o áudio é desbloqueado pelo clique do ecrã) ──
  useEffect(() => {
    const make = (file: string, volume: number) => {
      const el = new Audio(sound(file))
      el.preload = 'auto'
      el.volume = volume
      return el
    }
    popRef.current = make('player-answered.mp3', 0.6)
    levelUpRef.current = make('lightning - x2 and x3 points.mp3', 0.7)
    return () => {
      popRef.current?.pause()
      levelUpRef.current?.pause()
      popRef.current = null
      levelUpRef.current = null
    }
  }, [])

  const play = (el: HTMLAudioElement | null) => {
    if (!el) return
    try {
      el.currentTime = 0
      el.play().catch(() => {})
    } catch {}
  }

  const celebrate = useCallback((c: CelebrationKind) => {
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current)
    setCelebration({ ...c, key: ++seqRef.current })
    celebrationTimerRef.current = setTimeout(() => setCelebration(null), CELEBRATION_MS)
    confetti({
      particleCount: c.kind === 'level' ? 160 : 110,
      spread: c.kind === 'level' ? 110 : 80,
      startVelocity: 45,
      origin: { y: c.kind === 'level' ? 0.95 : 0.6 },
      zIndex: 60,
    })
  }, [])

  // ── Energia ─────────────────────────────────────────────────────
  const addTaps = useCallback((n: number) => {
    if (n <= 0) return
    lastTapRef.current = Date.now()
    rawRef.current += n
    const target = levelTarget(playersRef.current.size, levelRef.current)
    if (rawRef.current >= target) {
      levelRef.current += 1
      rawRef.current = 0
      setLevel(levelRef.current)
      play(levelUpRef.current)
      celebrate({ kind: 'level', level: levelRef.current })
    }
    setEnergy(rawRef.current / levelTarget(playersRef.current.size, levelRef.current))
  }, [celebrate])

  // Descida lenta quando ninguém toca — obriga a sala a manter o ritmo.
  useEffect(() => {
    const id = setInterval(() => {
      if (rawRef.current <= 0 || Date.now() - lastTapRef.current < DECAY_AFTER_MS) return
      const target = levelTarget(playersRef.current.size, levelRef.current)
      rawRef.current = Math.max(0, rawRef.current - target * DECAY_PER_TICK)
      setEnergy(rawRef.current / target)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // ── Emojis a voar ───────────────────────────────────────────────
  const spawnFloater = useCallback((emoji: string, name: string | null) => {
    if (floaterCountRef.current >= MAX_FLOATERS) return
    floaterCountRef.current += 1
    const f: LobbyFloater = {
      id: ++seqRef.current,
      emoji,
      name,
      left: 4 + Math.random() * 88,
      drift: (Math.random() - 0.5) * 180,
      dur: 2.8 + Math.random() * 1.4,
      size: 3 + Math.random() * 1.8,
    }
    setFloaters((prev) => [...prev, f])
    later(() => {
      floaterCountRef.current -= 1
      setFloaters((prev) => prev.filter((x) => x.id !== f.id))
    }, f.dur * 1000 + 150)
  }, [later])

  // ── Reações vindas dos telemóveis ───────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(topic, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'tap' }, ({ payload }) => {
      const pid = payload?.pid
      const player = typeof pid === 'string' ? playersRef.current.get(pid) : undefined
      if (!player || !Array.isArray(payload?.e)) return

      const now = Date.now()
      if (now - (lastBatchRef.current.get(pid) ?? 0) < MIN_BATCH_GAP_MS) return
      lastBatchRef.current.set(pid, now)

      const list = emojisRef.current
      const taps = (payload.e as unknown[])
        .slice(0, MAX_TAPS_PER_BATCH)
        .filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < list.length)
      if (!taps.length) return

      addTaps(taps.length)

      // Alguns emojis do lote, espalhados pelo segundo; o nome só no primeiro.
      const shown = Math.min(MAX_FLOATERS_PER_BATCH, taps.length)
      for (let k = 0; k < shown; k++) {
        const idx = taps[Math.floor((k * taps.length) / shown)]
        later(() => spawnFloater(list[idx], k === 0 ? player.name : null), k * 230)
      }
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [topic, addTaps, spawnFloater, later])

  // ── Entradas + marcos ───────────────────────────────────────────
  const showNextArrival = useCallback(() => {
    const queue = arrivalQueueRef.current
    if (!queue.length) {
      arrivalBusyRef.current = false
      setArrival(null)
      return
    }
    arrivalBusyRef.current = true
    // Muita gente de uma vez (ex.: todos a ler o QR) → uma só faixa.
    const batch = queue.length > 3 ? queue.splice(0) : queue.splice(0, 1)
    setArrival({
      key: ++seqRef.current,
      text: batch.length > 1 ? `${batch.length} jogadores entraram!` : `${batch[0].name} entrou na sala!`,
      player: batch.length > 1 ? null : batch[0],
    })
    play(popRef.current)
    later(showNextArrival, ARRIVAL_MS)
  }, [later])

  useEffect(() => {
    if (!loaded) return
    // 1.ª leitura: quem já estava na sala não é anunciado.
    if (!knownRef.current) {
      knownRef.current = new Set(players.map((p) => p.id))
      milestoneRef.current = MILESTONES.filter((m) => m <= players.length).pop() ?? 0
      return
    }
    const known = knownRef.current
    const fresh = players.filter((p) => !known.has(p.id))
    if (fresh.length) {
      fresh.forEach((p) => known.add(p.id))
      arrivalQueueRef.current.push(...fresh)
      if (!arrivalBusyRef.current) showNextArrival()

      const ids = fresh.map((p) => p.id)
      setFreshIds((prev) => new Set([...prev, ...ids]))
      later(() => setFreshIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      }), FRESH_MS)
    }

    const reached = MILESTONES.filter((m) => m <= players.length && m > milestoneRef.current).pop()
    if (reached) {
      milestoneRef.current = reached
      celebrate({ kind: 'milestone', count: reached })
    }
  }, [players, loaded, showNextArrival, celebrate, later])

  return { energy, level, floaters, arrival, celebration, freshIds }
}

export type LobbyHype = ReturnType<typeof useLobbyHype>
