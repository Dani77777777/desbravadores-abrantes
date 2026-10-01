'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Users } from 'lucide-react'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { lobbyTopic, LOBBY_EMOJIS, LOBBY_THEMES, type LobbyGame } from './content'
import { LobbyTips } from './LobbyTips'
import { useLobbyHype, type LobbyHype, type LobbyPlayer } from './useLobbyHype'
import type { LobbyFloater } from './useReactionFloaters'

// Sala de espera no PROJETOR, partilhada pelo VanaQuest e pelo VanaEspada.

/**
 * Ecrã completo da sala de espera: PIN + QR, nuvem de jogadores, dicas a rodar,
 * barra de energia e a camada das reações. O motor (useLobbyHype) só vive
 * enquanto este ecrã está montado — quando o jogo arranca, desliga-se sozinho.
 */
export function ProjectorLobbyScreen({
  game,
  sessionId,
  players,
  loaded,
  pin,
  joinUrl,
  joinLabel,
  logo,
  eyebrow,
  title,
  background,
  emptyIcon,
  children,
}: {
  game: LobbyGame
  sessionId: string
  players: LobbyPlayer[]
  loaded: boolean
  pin: string
  joinUrl: string
  /** Endereço curto mostrado por baixo do PIN (ex.: "site.pt/jogos/vana-quest"). */
  joinLabel: string
  logo: ReactNode
  eyebrow: string
  title: string
  /** Classes do fundo (gradiente de cada jogo). */
  background: string
  emptyIcon: ReactNode
  /** Extra por cima (ex.: o QR em grande). */
  children?: ReactNode
}) {
  const theme = LOBBY_THEMES[game]
  const hype = useLobbyHype({
    topic: lobbyTopic(game, sessionId),
    players,
    loaded,
    emojis: LOBBY_EMOJIS[game],
  })
  const qrSize = 'min(210px, 24vh)'

  return (
    <div className={`h-[100dvh] w-screen overflow-hidden flex flex-col ${background}`}>
      <div className="flex items-center justify-between px-10 pt-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          {logo}
          <div>
            <p className="text-white/50 text-xs font-bold uppercase tracking-[0.3em]">{eyebrow}</p>
            <h1 className="text-white font-black text-3xl">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-white/10 rounded-2xl px-5 py-2.5 border border-white/15">
          <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
          <span key={players.length} className="lobby-pop text-white font-black text-xl tabular-nums">
            {players.length}
          </span>
          <span className="text-white font-bold text-xl">jogador{players.length !== 1 ? 'es' : ''}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-8 px-10 py-5 max-w-7xl mx-auto w-full">
        {/* PIN + QR */}
        <div className="w-[26rem] flex-shrink-0 flex flex-col items-center justify-center gap-5">
          <div className={`w-full backdrop-blur-sm rounded-3xl border p-6 text-center ${theme.card}`}>
            <p className={`${theme.accent} text-xs font-black uppercase tracking-[0.25em] mb-2`}>Entra com o PIN</p>
            <p className="text-7xl font-black text-white tracking-[0.12em] tabular-nums leading-none">{pin}</p>
            <p className="text-white/60 text-sm mt-3">
              em <span className="text-white font-semibold">{joinLabel}</span>
            </p>
          </div>
          <div className="bg-white rounded-3xl p-5 shadow-2xl">
            <QRCodeSVG value={joinUrl} size={210} style={{ width: qrSize, height: qrSize }} />
          </div>
        </div>

        {/* Jogadores na sala */}
        <div className={`flex-1 min-w-0 backdrop-blur-sm rounded-3xl border p-6 flex flex-col min-h-0 ${theme.card}`}>
          <p className={`${theme.accent} text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-2 flex-shrink-0`}>
            <Users className="w-4 h-4" /> Jogadores na sala
          </p>
          <LobbyPlayerCloud game={game} players={players} freshIds={hype.freshIds} emptyIcon={emptyIcon} />
        </div>
      </div>

      <div className="grid grid-cols-[1.35fr_1fr] gap-6 px-10 pb-6 max-w-7xl mx-auto w-full h-36 flex-shrink-0">
        <LobbyTips game={game} variant="projector" />
        <LobbyEnergyBar game={game} energy={hype.energy} level={hype.level} />
      </div>

      <LobbyOverlay game={game} hype={hype} />
      {children}
    </div>
  )
}

/** Atraso de animação estável por jogador (os avatares não flutuam todos em sincronia). */
function hashDelay(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % 3600
}

// ── Nuvem de jogadores ────────────────────────────────────────────
export function LobbyPlayerCloud({
  game,
  players,
  freshIds,
  emptyIcon,
}: {
  game: LobbyGame
  players: LobbyPlayer[]
  freshIds: Set<string>
  emptyIcon: ReactNode
}) {
  const theme = LOBBY_THEMES[game]
  const ref = useRef<HTMLDivElement | null>(null)
  const compact = players.length > 24
  const empty = players.length === 0

  // Scroll automático e lento quando a nuvem transborda (vai e volta, com pausas).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let rafId: number
    let direction = 1
    let pos = el.scrollTop
    let last = performance.now()
    let pauseUntil = last + 1500
    const speedPxPerSec = 20

    const tick = (now: number) => {
      const dt = now - last
      last = now
      const overflow = el.scrollHeight - el.clientHeight
      if (overflow > 4) {
        if (now >= pauseUntil) {
          pos += (speedPxPerSec * dt / 1000) * direction
          if (pos >= overflow) {
            pos = overflow
            direction = -1
            pauseUntil = now + 1800
          } else if (pos <= 0) {
            pos = 0
            direction = 1
            pauseUntil = now + 1800
          }
          el.scrollTop = pos
        }
      } else {
        pos = 0
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [empty])

  if (empty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 animate-pulse">
          {emptyIcon}
        </div>
        <p className={`${theme.accent} text-lg`}>À espera de jogadores...</p>
        <p className="text-white/50 text-sm mt-1">Lê o QR code ou escreve o PIN no telemóvel</p>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 overflow-y-auto flex flex-wrap content-start justify-center gap-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {players.map((p) => {
        const fresh = freshIds.has(p.id)
        return (
          <span key={p.id} className={`inline-block ${fresh ? 'lobby-pop' : 'animate-in fade-in duration-500'}`}>
            <span
              className={`lobby-bob inline-flex items-center gap-2 rounded-full border ${
                fresh ? 'bg-white/25 border-white/60 ring-2 ring-amber-300/70' : 'bg-white/10 border-white/10'
              } ${compact ? 'pl-1 pr-3 py-1' : 'pl-1.5 pr-4 py-1.5'} transition-colors duration-700`}
              style={{ '--d': `-${hashDelay(p.id)}ms` } as CSSProperties}
            >
              <PlayerAvatar
                name={p.name}
                avatarUrl={p.avatarUrl}
                className={compact ? 'w-7 h-7' : 'w-9 h-9'}
                textClassName={compact ? 'text-xs' : 'text-sm'}
                fallbackBg={theme.avatarBg}
              />
              <span className={`text-white font-bold truncate max-w-[11rem] ${compact ? 'text-sm' : 'text-base'}`}>
                {p.name}
              </span>
              {p.isGuest && <span className="text-[10px] text-white/50">convidado</span>}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ── Barra "Energia da sala" ───────────────────────────────────────
export function LobbyEnergyBar({ game, energy, level }: { game: LobbyGame; energy: number; level: number }) {
  const theme = LOBBY_THEMES[game]
  const pct = Math.max(0, Math.min(1, energy)) * 100
  const hot = pct >= 80
  return (
    <div className={`h-full rounded-3xl border backdrop-blur-sm px-6 py-4 flex flex-col justify-center ${theme.card}`}>
      <div className="flex items-center justify-between mb-2.5">
        <p className={`${theme.accent} text-xs font-black uppercase tracking-widest`}>⚡ Energia da sala</p>
        <span key={level} className="lobby-pop text-white font-black text-sm bg-white/15 rounded-full px-3 py-1">
          Nível {level}
        </span>
      </div>
      <div
        className={`relative h-8 rounded-full bg-black/30 overflow-hidden transition-shadow duration-300 ${
          hot ? 'shadow-[0_0_28px_rgba(251,146,60,0.65)]' : ''
        }`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300 via-orange-500 to-red-500 overflow-hidden transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        >
          <div className="lobby-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        </div>
        <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-black drop-shadow tabular-nums">
          {Math.round(pct)}%{hot ? ' 🔥' : ''}
        </span>
      </div>
      <p className="text-white/60 text-sm mt-2">Toquem nos emojis no telemóvel para encher a barra!</p>
    </div>
  )
}

// ── Camada por cima de tudo: emojis a voar, entradas, festas ─────
export function LobbyOverlay({ game, hype }: { game: LobbyGame; hype: LobbyHype }) {
  const theme = LOBBY_THEMES[game]
  const { floaters, arrival, celebration } = hype

  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
      <FloatingEmojis floaters={floaters} />

      {arrival && (
        <div className="absolute top-24 inset-x-0 flex justify-center">
          <div
            key={arrival.key}
            className="lobby-banner flex items-center gap-3 bg-white text-slate-900 rounded-full pl-2 pr-6 py-2 shadow-2xl"
            style={{ '--dur': '1.7s' } as CSSProperties}
          >
            {arrival.player ? (
              <PlayerAvatar
                name={arrival.player.name}
                avatarUrl={arrival.player.avatarUrl}
                className="w-11 h-11"
                textClassName="text-lg"
                fallbackBg={game === 'vana-espada' ? 'bg-amber-500' : 'bg-blue-500'}
              />
            ) : (
              <span className="w-11 h-11 rounded-full bg-amber-300 flex items-center justify-center text-2xl">🎉</span>
            )}
            <span className="font-black text-2xl">{arrival.text}</span>
          </div>
        </div>
      )}

      {celebration && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            key={celebration.key}
            className="lobby-banner text-center bg-slate-950/70 backdrop-blur-md border border-white/20 rounded-[2rem] px-14 py-9 shadow-2xl"
            style={{ '--dur': '3.2s' } as CSSProperties}
          >
            {celebration.kind === 'level' ? (
              <>
                <p className="text-7xl mb-2">⚡🔥⚡</p>
                <p className="text-white font-black text-6xl">Energia no máximo!</p>
                <p className={`${theme.accent} font-black text-2xl mt-3 uppercase tracking-[0.2em]`}>
                  Nível {celebration.level} desbloqueado
                </p>
              </>
            ) : (
              <>
                <p className="text-7xl mb-2">🎉</p>
                <p className="text-white font-black text-6xl">{celebration.count} jogadores!</p>
                <p className={`${theme.accent} font-black text-2xl mt-3 uppercase tracking-[0.2em]`}>
                  A sala está a encher
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Os emojis a subir (sala de espera e durante o jogo). */
export function FloatingEmojis({ floaters }: { floaters: LobbyFloater[] }) {
  return (
    <>
      {floaters.map((f) => (
        <div
          key={f.id}
          className="lobby-rise absolute -bottom-4 flex flex-col items-center"
          style={{ left: `${f.left}%`, '--drift': `${f.drift}px`, '--dur': `${f.dur}s` } as CSSProperties}
        >
          <span className="leading-none drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]" style={{ fontSize: `${f.size}rem` }}>
            {f.emoji}
          </span>
          {f.name && (
            <span className="mt-1 text-xs font-bold text-white bg-black/35 rounded-full px-2 py-0.5 whitespace-nowrap max-w-[10rem] truncate">
              {f.name}
            </span>
          )}
        </div>
      ))}
    </>
  )
}
