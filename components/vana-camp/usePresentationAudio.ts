'use client'

/**
 * Áudio do ecrã de projeção do VanaCamp (soundboard em /public/sounds/VanaCamp).
 *
 * Duas peças:
 *   - `usePresentationAudio` — hook montado uma vez na <Presentation/>. Gere a
 *     música de fundo por fase (com crossfade), os SFX de transição de fase e
 *     os SFX vindos de eventos realtime (votos, eleição do Diretor).
 *   - `playSfx` — toca um efeito pontual; enquanto toca, baixa a música de
 *     fundo (ducking) e repõe o volume no fim.
 *
 * Desbloqueio (mesmo padrão do VanaEspada/VanaQuest): até ao primeiro
 * clique/tecla/toque na página não toca nada e a Presentation mostra o aviso
 * "clica para ativar". Esse gesto liga a música da fase atual e põe o
 * projetor em ecrã inteiro — os browsers só deixam fazer as duas coisas
 * dentro de um gesto do utilizador.
 */

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { VanaCampSide } from '@/types/vana-camp'
import { enterFullscreen } from '@/utils/fullscreen'

const BASE = '/sounds/VanaCamp'

export type SfxName =
  | 'role-reveal'
  | 'night-start'
  | 'infiltrators-wake'
  | 'seer-wake'
  | 'guardian-wake'
  | 'death-announce'
  | 'save'
  | 'peaceful-morning'
  | 'vote-cast'
  | 'expelled'
  | 'tie'
  | 'mayor-elected'

type MusicKey =
  | 'lobby'
  | 'mayor'
  | 'night'
  | 'debate'
  | 'verdict'
  | 'victory_desbravadores'
  | 'victory_infiltrators'

const MUSIC: Record<MusicKey, { file: string; volume: number }> = {
  lobby: { file: `${BASE}/VanaCamp - Lobby Theme.mp3`, volume: 0.5 },
  mayor: { file: `${BASE}/VanaCamp - Mayor Election.mp3`, volume: 0.5 },
  night: { file: `${BASE}/VanaCamp - Night Falls.mp3`, volume: 0.45 },
  // A assembleia é para falarem por cima — volume bem baixo.
  debate: { file: `${BASE}/VanaCamp - The Debate.mp3`, volume: 0.22 },
  verdict: { file: `${BASE}/VanaCamp - The Verdict.mp3`, volume: 0.5 },
  victory_desbravadores: { file: `${BASE}/VanaCamp - Victory Desbravadores.mp3`, volume: 0.6 },
  victory_infiltrators: { file: `${BASE}/VanaCamp - Victory Infiltrados.mp3`, volume: 0.6 },
}

/** Fator aplicado à música enquanto um SFX está a tocar. */
const DUCK_FACTOR = 0.3

// ────────────────────────────────────────────────────────────────────
// Estado de módulo (a Presentation monta isto uma única vez por página)
// ────────────────────────────────────────────────────────────────────

let currentMusic: { key: MusicKey; audio: HTMLAudioElement; baseVolume: number } | null = null
let duckCount = 0
const fadeTimers = new WeakMap<HTMLAudioElement, ReturnType<typeof setInterval>>()

/**
 * false até ao primeiro gesto do utilizador na página. Enquanto for false a
 * Presentation mostra o overlay "clica para ativar o áudio e o ecrã inteiro".
 * Vive no módulo para sobreviver aos `router.refresh()` entre fases.
 */
let audioUnlocked = false
const unlockListeners = new Set<(unlocked: boolean) => void>()

function clearFade(audio: HTMLAudioElement) {
  const t = fadeTimers.get(audio)
  if (t) clearInterval(t)
  fadeTimers.delete(audio)
}

function fadeTo(audio: HTMLAudioElement, target: number, ms: number, onDone?: () => void) {
  clearFade(audio)
  const steps = Math.max(1, Math.round(ms / 50))
  const step = (target - audio.volume) / steps
  let n = 0
  const t = setInterval(() => {
    n++
    audio.volume = Math.min(1, Math.max(0, audio.volume + step))
    if (n >= steps) {
      clearFade(audio)
      audio.volume = target
      onDone?.()
    }
  }, 50)
  fadeTimers.set(audio, t)
}

/** Volume alvo da música atual, tendo em conta o ducking. */
function musicTargetVolume(): number {
  if (!currentMusic) return 0
  return currentMusic.baseVolume * (duckCount > 0 ? DUCK_FACTOR : 1)
}

/**
 * Primeiro gesto do utilizador: ecrã inteiro + música da fase atual.
 * Tem de correr dentro do handler do clique/tecla/toque.
 */
function unlockAudio() {
  if (audioUnlocked) return
  audioUnlocked = true
  unlockListeners.forEach((fn) => fn(true))
  enterFullscreen()
  const m = currentMusic
  if (m && m.audio.paused) {
    m.audio.play()
      .then(() => fadeTo(m.audio, musicTargetVolume(), 800))
      .catch(() => {})
  }
}

function stopMusic(fadeMs = 1000) {
  const m = currentMusic
  currentMusic = null
  if (!m) return
  fadeTo(m.audio, 0, fadeMs, () => {
    m.audio.pause()
    m.audio.src = ''
  })
}

function playMusic(key: MusicKey | null) {
  if (currentMusic?.key === key) return
  stopMusic(1000)
  if (!key || typeof Audio === 'undefined') return

  const def = MUSIC[key]
  const audio = new Audio(def.file)
  audio.loop = true
  audio.volume = 0
  currentMusic = { key, audio, baseVolume: def.volume }

  // Antes do primeiro clique fica só preparada; o unlockAudio() põe-na a tocar.
  if (!audioUnlocked) return
  audio.play()
    .then(() => fadeTo(audio, musicTargetVolume(), 1200))
    .catch(() => {})
}

/**
 * Toca um efeito sonoro pontual, baixando a música de fundo enquanto dura.
 */
export function playSfx(name: SfxName, opts: { volume?: number } = {}) {
  if (typeof Audio === 'undefined' || !audioUnlocked) return
  const audio = new Audio(`${BASE}/sfx-${name}.mp3`)
  audio.volume = opts.volume ?? 0.9

  duckCount++
  if (currentMusic) fadeTo(currentMusic.audio, musicTargetVolume(), 200)

  let released = false
  const release = () => {
    if (released) return
    released = true
    duckCount = Math.max(0, duckCount - 1)
    if (duckCount === 0 && currentMusic) {
      fadeTo(currentMusic.audio, musicTargetVolume(), 400)
    }
  }
  audio.addEventListener('ended', release, { once: true })
  audio.addEventListener('error', release, { once: true })
  audio.play().catch(release)
}

// ────────────────────────────────────────────────────────────────────
// Mapa fase → música
// ────────────────────────────────────────────────────────────────────

function musicForStatus(status: string, winnerSide: VanaCampSide | null): MusicKey | null {
  switch (status) {
    case 'lobby':
    case 'role_preview':
      return 'lobby'
    case 'mayor_election':
      return 'mayor'
    case 'night_infiltrators':
    case 'night_seer':
    case 'night_guardian':
      return 'night'
    case 'day_discussion':
      return 'debate'
    case 'day_vote':
      return 'verdict'
    case 'finished':
      // Sem vencedor conhecido ainda → silêncio (o update com winner chega logo)
      if (!winnerSide) return null
      return winnerSide === 'infiltrators' ? 'victory_infiltrators' : 'victory_desbravadores'
    // role_reveal, day_announce e day_result vivem só de SFX
    default:
      return null
  }
}

// ────────────────────────────────────────────────────────────────────
// Hook principal
// ────────────────────────────────────────────────────────────────────

export function usePresentationAudio(
  sessionId: string,
  status: string,
  winnerSide: VanaCampSide | null,
) {
  const statusRef = useRef(status)
  const prevStatusRef = useRef<string | null>(null)
  const nightWakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [unlocked, setUnlocked] = useState(audioUnlocked)

  // Primeiro clique/tecla/toque em qualquer sítio da página → áudio + ecrã inteiro
  useEffect(() => {
    const fn = (u: boolean) => setUnlocked(u)
    unlockListeners.add(fn)
    if (audioUnlocked) return () => { unlockListeners.delete(fn) }

    const handler = () => unlockAudio()
    document.addEventListener('click', handler)
    document.addEventListener('keydown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      unlockListeners.delete(fn)
      document.removeEventListener('click', handler)
      document.removeEventListener('keydown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [])

  // Música de fundo por fase (crossfade tratado em playMusic)
  useEffect(() => {
    statusRef.current = status
    playMusic(musicForStatus(status, winnerSide))
  }, [status, winnerSide])

  // SFX de transição de fase.
  // No primeiro render prev === null: não tocamos nada, para um refresh do
  // projetor a meio de uma fase não repetir o efeito dessa fase.
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status
    if (prev === null || prev === status) return

    if (nightWakeTimerRef.current) {
      clearTimeout(nightWakeTimerRef.current)
      nightWakeTimerRef.current = null
    }

    if (status === 'role_reveal') {
      playSfx('role-reveal')
    } else if (status === 'night_infiltrators') {
      // Uivo a anunciar a noite; os infiltrados "acordam" depois do uivo
      playSfx('night-start')
      nightWakeTimerRef.current = setTimeout(() => playSfx('infiltrators-wake'), 4000)
    } else if (status === 'night_seer') {
      playSfx('seer-wake')
    } else if (status === 'night_guardian') {
      playSfx('guardian-wake')
    }
  }, [status])

  // SFX por eventos realtime: tick por voto e fanfarra do Diretor eleito
  useEffect(() => {
    const supabase = createClient()
    let lastVoteTick = 0
    const ch = supabase
      .channel(`vc_pres_audio_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vanacamp_votes', filter: `session_id=eq.${sessionId}` },
        () => {
          const s = statusRef.current
          if (s !== 'day_vote' && s !== 'mayor_election') return
          // Bots votam em rajada — no máximo um tick a cada 300ms
          const now = Date.now()
          if (now - lastVoteTick < 300) return
          lastVoteTick = now
          playSfx('vote-cast', { volume: 0.55 })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vanacamp_events', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const ev = payload.new as { event_type?: string }
          if (ev.event_type === 'mayor_elected') playSfx('mayor-elected')
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  // Ao desmontar a apresentação, pára tudo
  useEffect(() => () => {
    if (nightWakeTimerRef.current) clearTimeout(nightWakeTimerRef.current)
    stopMusic(300)
  }, [])

  return { audioBlocked: !unlocked }
}
