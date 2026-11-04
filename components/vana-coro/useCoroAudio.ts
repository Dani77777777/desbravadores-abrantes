'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { enterFullscreen } from '@/utils/fullscreen'
import type { VanaCoroPublicRound, VanaCoroSession } from '@/types/vana-coro'

/**
 * Áudio do projetor do VanaCoro. As músicas vivem em /public/sounds/VanaCoro
 * (prompts do Suno no vault do Obsidian: 30 Jogos/Prompts). Enquanto uma música não existir, essa
 * fase fica em silêncio; os efeitos sonoros caem para um som sintetizado.
 */

const BASE = '/sounds/VanaCoro'
const sound = (file: string) => encodeURI(`${BASE}/${file}`)
const MUSIC_VOLUME = 0.35
const SFX_VOLUME = 0.8
/** O som do roubo espera pelo fim dos ❌ gigantes da 3.ª falha. */
const STEAL_DELAY_MS = 1300

type Sfx = 'reveal' | 'strike' | 'buzz' | 'steal'

interface Track {
  file: string
  loop: boolean
}

function trackFor(session: VanaCoroSession): Track | null {
  if (session.status === 'lobby') return { file: 'VanaCoro - Lobby Theme.mp3', loop: true }
  if (session.status === 'finished') return { file: 'VanaCoro - Victory Celebration.mp3', loop: true }
  switch (session.phase) {
    case 'intro':
    case 'faceoff':
      return { file: 'VanaCoro - Faceoff.mp3', loop: true }
    case 'playing':
      return { file: 'VanaCoro - Playing.mp3', loop: true }
    case 'steal':
      return { file: 'VanaCoro - Steal.mp3', loop: true }
    case 'reveal_rest':
    case 'round_end':
      return { file: 'VanaCoro - Round End.mp3', loop: false }
    default:
      return null
  }
}

/** Sons de reserva (Web Audio), para quando o ficheiro não existe. */
function synth(ctx: AudioContext, kind: Sfx) {
  const now = ctx.currentTime
  const tone = (freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now + start)
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + start + dur)
    g.gain.setValueAtTime(gain, now + start)
    g.gain.exponentialRampToValueAtTime(0.001, now + start + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(now + start)
    osc.stop(now + start + dur)
  }
  if (kind === 'reveal') {
    tone(1046, 0, 0.35, 'sine', 0.4)
    tone(1568, 0.12, 0.6, 'sine', 0.35)
  } else if (kind === 'strike') {
    tone(110, 0, 0.9, 'sawtooth', 0.35)
    tone(116, 0, 0.9, 'square', 0.2)
  } else if (kind === 'buzz') {
    tone(660, 0, 0.18, 'square', 0.25)
    tone(880, 0.18, 0.3, 'square', 0.25)
  } else {
    tone(220, 0, 0.5, 'triangle', 0.4, 110)
    tone(165, 0.45, 0.8, 'triangle', 0.4, 82)
  }
}

export function useCoroAudio(session: VanaCoroSession, round: VanaCoroPublicRound | null) {
  const [unlocked, setUnlocked] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const currentRef = useRef('')
  const sfxRef = useRef<Partial<Record<Sfx, HTMLAudioElement | null>>>({})
  const stealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    musicRef.current = new Audio()
    musicRef.current.volume = MUSIC_VOLUME
    for (const name of ['reveal', 'strike', 'buzz', 'steal'] as Sfx[]) {
      const a = new Audio(sound(`sfx-${name}.mp3`))
      a.preload = 'auto'
      a.volume = SFX_VOLUME
      a.addEventListener('error', () => {
        sfxRef.current[name] = null // não existe → som sintetizado
      })
      sfxRef.current[name] = a
    }
    return () => {
      if (stealTimer.current) clearTimeout(stealTimer.current)
      musicRef.current?.pause()
      ctxRef.current?.close().catch(() => {})
    }
  }, [])

  const play = useCallback(
    (name: Sfx) => {
      if (!unlocked) return
      const a = sfxRef.current[name]
      if (a) {
        a.currentTime = 0
        a.play().catch(() => ctxRef.current && synth(ctxRef.current, name))
      } else if (ctxRef.current) {
        synth(ctxRef.current, name)
      }
    },
    [unlocked],
  )

  // Música da fase
  const track = trackFor(session)
  const trackKey = track ? `${track.file}|${session.status === 'playing' ? session.current_round : ''}` : ''
  useEffect(() => {
    const music = musicRef.current
    if (!music || !unlocked) return
    if (!track) {
      music.pause()
      currentRef.current = ''
      return
    }
    if (currentRef.current === trackKey) return
    currentRef.current = trackKey
    music.src = sound(track.file)
    music.loop = track.loop
    music.currentTime = 0
    music.play().catch(() => {})
  }, [trackKey, unlocked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Efeitos nos eventos do jogo
  const revealedCount = round?.slots.filter((s) => s.revealed).length ?? 0
  const prev = useRef({ revealed: revealedCount, strikeSeq: session.strike_seq, buzzed: session.buzzed_team, phase: session.phase, round: session.current_round })
  useEffect(() => {
    const p = prev.current
    const sameRound = p.round === session.current_round
    if (sameRound && revealedCount > p.revealed) play('reveal')
    if (sameRound && session.strike_seq > p.strikeSeq) play('strike')
    if (!p.buzzed && session.buzzed_team) play('buzz')
    const stealStarted = p.phase !== 'steal' && session.phase === 'steal'
    prev.current = { revealed: revealedCount, strikeSeq: session.strike_seq, buzzed: session.buzzed_team, phase: session.phase, round: session.current_round }
    if (stealStarted) stealTimer.current = setTimeout(() => play('steal'), STEAL_DELAY_MS)
  }, [revealedCount, session.strike_seq, session.buzzed_team, session.phase, session.current_round, play])

  /** Tem de ser chamado num clique: desbloqueia o áudio e põe em ecrã inteiro. */
  const unlock = useCallback(() => {
    enterFullscreen({ lockEscape: true })
    try {
      ctxRef.current ??= new AudioContext()
      ctxRef.current.resume().catch(() => {})
    } catch {
      /* sem Web Audio */
    }
    musicRef.current?.play().catch(() => {})
    setUnlocked(true)
  }, [])

  return { unlocked, unlock }
}
