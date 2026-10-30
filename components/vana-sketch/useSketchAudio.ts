'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { VanaSketchSession, VanaSketchGuess } from '@/types/vana-sketch'
import { useCountdown } from './ui'
import { enterFullscreen } from '@/utils/fullscreen'

/**
 * Áudio do projetor do VanaSketch (soundboard em /public/sounds/VanaSketch) —
 * mesmo padrão do VanaWords: uma música por fase + SFX nos eventos do jogo.
 * A música pode ser desligada pelo host; os SFX tocam sempre.
 */

const BASE = '/sounds/VanaSketch'
export const sketchSound = (file: string) => encodeURI(`${BASE}/${file}`)

const LAST_SECONDS = 10
const MUSIC_VOLUME = 0.5

interface Track { src: string; loop: boolean }

function trackFor(session: VanaSketchSession, left: number | null): Track | null {
  if (session.status === 'lobby') return { src: sketchSound('VanaSketch - Lobby Theme.mp3'), loop: true }
  if (session.status === 'finished') return { src: sketchSound('VanaSketch - Victory Celebration.mp3'), loop: true }
  if (session.status !== 'playing') return null
  switch (session.phase) {
    case 'choosing':
      return { src: sketchSound('VanaSketch - The Choosing.mp3'), loop: true }
    case 'drawing':
      return left !== null && left <= LAST_SECONDS
        ? { src: sketchSound('VanaSketch - Last Seconds.mp3'), loop: true }
        : { src: sketchSound('VanaSketch - Drawing Time.mp3'), loop: true }
    case 'round_end':
      // Toca uma vez e fica em silêncio até à ronda seguinte
      return { src: sketchSound('VanaSketch - Word Reveal.mp3'), loop: false }
    default:
      return null
  }
}

const SFX = {
  correct: { file: 'sfx-correct-guess.mp3', volume: 0.7 },
  // Chegam muitos palpites errados seguidos — fica baixinho
  wrong: { file: 'sfx-wrong-guess.mp3', volume: 0.35 },
  yourTurn: { file: 'sfx-your-turn.mp3', volume: 0.7 },
  tick: { file: 'sfx-tick.mp3', volume: 0.5 },
  timeUp: { file: 'sfx-time-up.mp3', volume: 0.75 },
} as const
type SfxName = keyof typeof SFX

export function useSketchAudio(
  session: VanaSketchSession,
  guesses: VanaSketchGuess[],
  musicEnabled: boolean,
) {
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const currentSrcRef = useRef('')
  const sfxRef = useRef<Partial<Record<SfxName, HTMLAudioElement>>>({})

  const left = useCountdown(session.status === 'playing' && session.phase === 'drawing' ? session.round_ends_at : null)
  const track = trackFor(session, left)
  // Cópias para o handler de desbloqueio (corre fora do render)
  const trackRef = useRef(track)
  const musicEnabledRef = useRef(musicEnabled)
  useEffect(() => {
    trackRef.current = track
    musicEnabledRef.current = musicEnabled
  })

  // Elementos <audio> criados uma vez (sobrevivem às mudanças de fase)
  useEffect(() => {
    const music = new Audio()
    music.preload = 'auto'
    musicRef.current = music
    for (const [name, def] of Object.entries(SFX) as [SfxName, (typeof SFX)[SfxName]][]) {
      const a = new Audio(sketchSound(def.file))
      a.preload = 'auto'
      a.volume = def.volume
      a.addEventListener('error', () => console.warn('[VS] Falhou a carregar', def.file, a.error))
      sfxRef.current[name] = a
    }
    return () => {
      music.pause()
      musicRef.current = null
      Object.values(sfxRef.current).forEach((a) => a?.pause())
      sfxRef.current = {}
    }
  }, [])

  const playSfx = useCallback((name: SfxName) => {
    const el = sfxRef.current[name]
    if (!el || !audioUnlocked) return
    try {
      el.currentTime = 0
      el.play().catch(() => {})
    } catch {}
  }, [audioUnlocked])

  const startTrack = useCallback((t: Track) => {
    const el = musicRef.current
    if (!el) return
    currentSrcRef.current = t.src
    el.src = t.src
    el.loop = t.loop
    el.volume = MUSIC_VOLUME
    el.play().catch((err) => console.warn('[VS] Erro a tocar música:', err, t.src))
  }, [])

  // Desbloquear na primeira interação — a música arranca dentro do próprio
  // gesto, que é o que os browsers mais exigentes (Safari) aceitam
  const unlock = useCallback(() => {
    setAudioUnlocked(true)
    enterFullscreen()
    const t = trackRef.current
    if (t && musicEnabledRef.current && currentSrcRef.current !== t.src) startTrack(t)
  }, [startTrack])

  useEffect(() => {
    if (audioUnlocked) return
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [audioUnlocked, unlock])

  // Música conforme o estado/fase (e o interruptor do host)
  const trackSrc = track?.src ?? ''
  useEffect(() => {
    const el = musicRef.current
    if (!el) return
    if (!musicEnabled || !audioUnlocked || !trackRef.current) {
      el.pause()
      if (!trackRef.current) currentSrcRef.current = ''
      return
    }
    if (currentSrcRef.current !== trackSrc) startTrack(trackRef.current)
    // Voltar a ligar a música: retoma, exceto o Word Reveal que já tocou até ao fim
    else if (el.paused && !el.ended) el.play().catch(() => {})
  }, [trackSrc, musicEnabled, audioUnlocked, startTrack])

  // SFX: palpites novos (certo / errado). Sem som na primeira carga e em
  // ressincronizações (muitos de uma vez), para não haver rajadas.
  const knownGuessesRef = useRef<Set<string> | null>(null)
  const knownRoundRef = useRef(session.round_number)
  useEffect(() => {
    const ids = new Set(guesses.map((g) => g.id))
    const prev = knownGuessesRef.current
    const sameRound = knownRoundRef.current === session.round_number
    knownGuessesRef.current = ids
    knownRoundRef.current = session.round_number
    if (!prev || !sameRound) return
    const fresh = guesses.filter((g) => !prev.has(g.id))
    if (!fresh.length || fresh.length > 3) return
    playSfx(fresh.some((g) => g.is_correct) ? 'correct' : 'wrong')
  }, [guesses, session.round_number, playSfx])

  // SFX: novo desenhador (início da escolha) e fim da ronda por tempo
  const prevPhaseRef = useRef(session.phase)
  const prevRoundRef = useRef(session.round_number)
  const prevEndsAtRef = useRef(session.round_ends_at)
  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    const prevRound = prevRoundRef.current
    const prevEndsAt = prevEndsAtRef.current
    prevPhaseRef.current = session.phase
    prevRoundRef.current = session.round_number
    prevEndsAtRef.current = session.round_ends_at

    if (session.phase === 'choosing' && (prevPhase !== 'choosing' || prevRound !== session.round_number)) {
      playSfx('yourTurn')
    }
    if (prevPhase === 'drawing' && session.phase === 'round_end' && prevEndsAt
        && Date.now() >= new Date(prevEndsAt).getTime() - 1500) {
      playSfx('timeUp')
    }
  }, [session.phase, session.round_number, session.round_ends_at, playSfx])

  // SFX: tique-taque nos últimos 10 segundos
  const lastTickRef = useRef<number | null>(null)
  useEffect(() => {
    if (left === null || left < 1 || left > LAST_SECONDS) { lastTickRef.current = null; return }
    if (lastTickRef.current === left) return
    lastTickRef.current = left
    playSfx('tick')
  }, [left, playSfx])

  return { audioUnlocked, unlock }
}
