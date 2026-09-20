'use client'

import { useEffect, useState } from 'react'
import { VS, vsHand } from './theme'

/** Avatar circular (foto ou iniciais). */
export function SketchAvatar({
  name,
  avatarUrl,
  size = 40,
  highlight,
}: {
  name: string
  avatarUrl?: string | null
  size?: number
  highlight?: boolean
}) {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        color: '#1b1233',
        background: avatarUrl ? undefined : 'linear-gradient(160deg,#ff8fc0,#ff5da2)',
        border: '2px solid rgba(255,255,255,.3)',
        boxShadow: highlight ? `0 0 0 2px ${VS.amber}, 0 4px 10px rgba(0,0,0,.4)` : '0 3px 8px rgba(0,0,0,.35)',
      }}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
    </div>
  )
}

/** Contagem decrescente sincronizada com round_ends_at (timestamp do servidor). */
export function useCountdown(endsAt: string | null): number | null {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    if (!endsAt) { setLeft(null); return }
    const target = new Date(endsAt).getTime()
    const tick = () => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [endsAt])
  return left
}

/** Relógio visual grande (fica vermelho nos últimos 10s). */
export function CountdownBadge({ endsAt, size = 'md' }: { endsAt: string | null; size?: 'md' | 'lg' }) {
  const left = useCountdown(endsAt)
  if (left === null) return null
  const urgent = left <= 10
  return (
    <span
      className={`${vsHand.className} inline-flex items-center justify-center rounded-2xl border font-bold tabular-nums ${
        size === 'lg' ? 'min-w-[92px] px-4 py-1 text-5xl' : 'min-w-[64px] px-3 py-0.5 text-3xl'
      }`}
      style={{
        color: urgent ? '#ff6b6b' : VS.ink,
        borderColor: urgent ? 'rgba(255,107,107,.5)' : VS.pline,
        background: urgent ? 'rgba(255,107,107,.12)' : VS.panel,
        animation: urgent && left > 0 ? 'pulse 1s ease-in-out infinite' : undefined,
      }}
    >
      {left}s
    </span>
  )
}

/** Palavra mascarada em letra manuscrita grande ("_ _ _ _"). */
export function MaskedWord({ masked, revealed, size = 'md' }: { masked: string | null; revealed?: string | null; size?: 'md' | 'lg' }) {
  const text = revealed ?? masked
  if (!text) return null
  return (
    <span
      className={`${vsHand.className} font-bold tracking-[0.15em] ${size === 'lg' ? 'text-6xl' : 'text-3xl'}`}
      style={{ color: revealed ? VS.teal : VS.ink }}
    >
      {text}
    </span>
  )
}
