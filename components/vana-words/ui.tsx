import { TEAM_LABELS } from '@/types/vana-words'
import type { TeamId } from '@/types/vana-words'
import { TEAM_GRADIENT, VW } from './theme'

/** Quadradinho colorido + rótulo da equipa (tradução do chip do mockup) */
export function TeamChip({ team, label }: { team: TeamId; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: team === 'a' ? VW.amber : VW.blue }}>
      <span className="w-2.5 h-2.5 rounded-[3px] inline-block" style={{ background: TEAM_GRADIENT[team] }} />
      {label ?? TEAM_LABELS[team]}
    </span>
  )
}

/** "…" a piscar (animação vw-blip), tradução do indicador de espera do mockup */
export function BlipDots({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`inline-flex gap-[3px] ${className}`} style={style}>
      <span style={{ animation: 'vw-blip 1.4s infinite' }}>•</span>
      <span style={{ animation: 'vw-blip 1.4s infinite .2s' }}>•</span>
      <span style={{ animation: 'vw-blip 1.4s infinite .4s' }}>•</span>
    </span>
  )
}

/** Avatar circular (foto de perfil, se existir, senão iniciais), anel dourado + coroa quando é o Arauto */
export function Avatar({
  initials,
  team,
  isArauto,
  avatarUrl,
  size = 46,
}: {
  initials: string
  team: TeamId
  isArauto?: boolean
  avatarUrl?: string | null
  size?: number
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center font-extrabold overflow-hidden"
        style={{
          background: avatarUrl ? undefined : TEAM_GRADIENT[team],
          color: '#12131f',
          fontSize: size * 0.32,
          border: '2px solid rgba(255,255,255,.3)',
          boxShadow: isArauto ? `0 0 0 2px ${VW.gold}, 0 4px 10px rgba(0,0,0,.4)` : '0 3px 8px rgba(0,0,0,.35)',
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {isArauto && (
        <span
          className="absolute left-1/2 -translate-x-1/2 leading-none"
          style={{ top: -size * 0.28, fontSize: size * 0.32, color: VW.gold, textShadow: '0 1px 2px rgba(0,0,0,.7)' }}
        >
          ♛
        </span>
      )}
    </div>
  )
}

/** Bolha "+N" para membros da equipa que não cabem nos avatares visíveis */
export function OverflowAvatar({ count, size = 46 }: { count: number; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.28,
        color: VW.mut,
        background: 'rgba(255,255,255,.03)',
        border: '1.5px dashed rgba(255,255,255,.25)',
      }}
    >
      +{count}
    </div>
  )
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
