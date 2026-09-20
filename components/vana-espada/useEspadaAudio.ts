'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EspadaStatus } from '@/types/vana-espada'

/**
 * Banda sonora do projetor, com a soundboard do VanaQuest.
 *
 * É a mesma biblioteca de propósito: os miúdos já associam aquelas músicas aos
 * jogos do clube, e o VanaEspada tem exatamente os mesmos momentos (sala de
 * espera → tempo de resposta → revelação → classificação → pódio).
 *
 * Só o projetor toca som. Os telemóveis ficam calados — 30 telemóveis a tocar a
 * mesma música com meio segundo de diferença é um pesadelo num salão.
 */
const SOUNDS = '/sounds/VanaQuest - soundboard'

// encodeURI por causa dos espaços nos nomes dos ficheiros (essencial na Vercel).
const sound = (file: string) => encodeURI(`${SOUNDS}/${file}`)

const TRACKS = {
  lobby: sound('VanaQuest - Lobby Theme.mp3'),
  round: sound('VanaQuest - Think Fast.mp3'),
  standings: sound('VanaQuest - Standings.mp3'),
  podium: sound('VanaQuest - Podium Intro.mp3'),
  victory: sound('VanaQuest - Victory Celebration.mp3'),
}

// O "lightning" do VanaQuest fica de fora de propósito: ali anuncia uma pergunta
// a dobrar ou a triplicar, e aqui todas as rondas valem o mesmo. Tocá-lo a cada
// ronda só gastava o efeito e prometia uma coisa que não existe.
const SFX = {
  answered: sound('player-answered.mp3'),
  roundEnd: sound('theend.mp3'),
  points: sound('earning points.mp3'),
}

/** Que música toca em cada estado. '' = silêncio. */
function trackForStatus(status: EspadaStatus): string {
  switch (status) {
    case 'lobby':
      return TRACKS.lobby
    case 'round_ready':
    case 'round_active':
      return TRACKS.round
    case 'leaderboard':
      return TRACKS.standings
    case 'finished':
      return TRACKS.podium
    // round_reveal fica em silêncio: deixa o "theend" e a revelação respirarem.
    default:
      return ''
  }
}

export function useEspadaAudio(status: EspadaStatus, musicEnabled: boolean) {
  const [unlocked, setUnlocked] = useState(false)

  const musicRef = useRef<HTMLAudioElement | null>(null)
  const currentTrackRef = useRef<string>('')
  const sfxRef = useRef<Record<keyof typeof SFX, HTMLAudioElement | null>>({
    answered: null,
    roundEnd: null,
    points: null,
  })

  // ── Criar os elementos <audio> uma vez ─────────────────────────
  // Vivem fora da árvore JSX para sobreviverem às mudanças de ecrã (cada estado
  // do projetor é um `return` diferente).
  useEffect(() => {
    if (typeof window === 'undefined') return

    const make = (src: string, label: string, volume: number) => {
      const el = new Audio()
      el.src = src
      el.preload = 'auto'
      el.volume = volume
      el.addEventListener('error', () => console.warn(`[VanaEspada] Falhou ${label}:`, src, el.error))
      return el
    }

    const music = make('', 'música', 0.5)
    const onEnded = () => {
      // O "Podium Intro" não faz loop: quando acaba, entra a "Victory Celebration".
      if (!decodeURIComponent(currentTrackRef.current || '').includes('Podium Intro')) return
      currentTrackRef.current = TRACKS.victory
      music.src = TRACKS.victory
      music.loop = true
      music.play().catch(() => {})
    }
    music.addEventListener('ended', onEnded)
    musicRef.current = music

    sfxRef.current = {
      answered: make(SFX.answered, 'sfx-respondeu', 0.6),
      roundEnd: make(SFX.roundEnd, 'sfx-fim-da-ronda', 0.7),
      points: make(SFX.points, 'sfx-pontos', 0.7),
    }

    return () => {
      music.pause()
      music.removeEventListener('ended', onEnded)
      musicRef.current = null
    }
  }, [])

  // ── Trocar de música conforme o estado ─────────────────────────
  useEffect(() => {
    const el = musicRef.current
    if (!el) return

    if (!musicEnabled || !unlocked) {
      el.pause()
      return
    }

    const next = trackForStatus(status)
    if (!next) {
      el.pause()
      return
    }

    if (currentTrackRef.current !== next) {
      currentTrackRef.current = next
      el.src = next
      el.loop = status !== 'finished'
      el.play().catch(() => {})
    } else if (el.paused) {
      el.play().catch(() => {})
    }
  }, [status, musicEnabled, unlocked])

  // ── Desbloquear o áudio na primeira interação ──────────────────
  // Os browsers só deixam tocar depois de um clique/tecla/toque.
  useEffect(() => {
    if (unlocked) return
    const unlock = () => setUnlocked(true)
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [unlocked])

  // Aviso em ecrã inteiro, montado direto no DOM para sobreviver aos vários
  // `return` do projetor (cada estado devolve uma árvore diferente).
  useEffect(() => {
    if (unlocked || typeof document === 'undefined') return

    const overlay = document.createElement('div')
    overlay.id = 'espada-audio-unlock'
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:100;background:rgba(2,6,23,0.75);backdrop-filter:blur(8px);' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;animation:espadaFade .3s ease-out'
    overlay.innerHTML = `
      <style>@keyframes espadaFade{from{opacity:0}to{opacity:1}}</style>
      <div style="background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.2);border-radius:28px;
                  padding:36px 44px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.6);max-width:30rem;margin:0 16px">
        <div style="font-size:3.25rem;margin-bottom:10px">🔊</div>
        <p style="color:#fff;font-size:1.6rem;font-weight:900;margin:0">Clica para ativar o áudio</p>
        <p style="color:#fcd34d;font-size:.9rem;margin-top:10px">Os browsers exigem uma interação antes de tocar música</p>
      </div>
    `
    const handler = () => setUnlocked(true)
    overlay.addEventListener('click', handler)
    document.body.appendChild(overlay)

    return () => {
      overlay.removeEventListener('click', handler)
      overlay.remove()
    }
  }, [unlocked])

  // ── Efeitos sonoros ────────────────────────────────────────────
  // Tocam sempre que o áudio esteja desbloqueado, mesmo com a música desligada:
  // o anfitrião desliga a música para falar por cima, não os avisos.
  //
  // Devolve uma promessa que resolve quando o som começou MESMO a tocar (true) ou
  // quando não pôde tocar (false — áudio ainda bloqueado, ficheiro em falta…).
  // Quem precisa de sincronizar uma animação com o som espera por ela.
  const playSfx = useCallback((name: keyof typeof SFX): Promise<boolean> => {
    const el = sfxRef.current[name]
    if (!el) return Promise.resolve(false)
    try {
      el.currentTime = 0
      return el.play().then(() => true, () => false)
    } catch {
      // Um SFX perdido não estraga o jogo.
      return Promise.resolve(false)
    }
  }, [])

  return { unlocked, playSfx }
}
