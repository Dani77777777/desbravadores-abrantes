'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { VanaCoroPublicSlot, VanaCoroTeam } from '@/types/vana-coro'

// Peças visuais do VanaCoro partilhadas pelo projetor e pelos telemóveis.

export const TEAM_STYLE: Record<VanaCoroTeam, { bg: string; text: string; ring: string; soft: string }> = {
  a: { bg: 'bg-sky-500', text: 'text-sky-300', ring: 'ring-sky-400', soft: 'bg-sky-500/15' },
  b: { bg: 'bg-rose-500', text: 'text-rose-300', ring: 'ring-rose-400', soft: 'bg-rose-500/15' },
}

export const CORO_BG = 'bg-gradient-to-br from-fuchsia-900 via-purple-950 to-indigo-950'

const KEYFRAMES = `
@keyframes coroFlip { 0% { transform: rotateX(90deg); opacity: .2 } 60% { transform: rotateX(-12deg); opacity: 1 } 100% { transform: rotateX(0) } }
@keyframes coroStrike { 0% { transform: scale(.3); opacity: 0 } 15% { transform: scale(1.15); opacity: 1 } 30% { transform: scale(1) } 85% { opacity: 1 } 100% { opacity: 0 } }
`

/** O quadro: N espaços; os escondidos mostram só o número. */
export function CoroBoard({ slots, size = 'big' }: { slots: VanaCoroPublicSlot[]; size?: 'big' | 'small' }) {
  const big = size === 'big'
  return (
    <div className={`w-full ${big ? 'space-y-3' : 'space-y-1.5'}`} style={{ perspective: 800 }}>
      <style>{KEYFRAMES}</style>
      {slots.map((s) => (
        <div
          key={`${s.rank}-${s.revealed}`}
          className={`flex items-center overflow-hidden rounded-xl ring-2 ${
            s.revealed
              ? s.scored === false
                ? 'bg-gradient-to-r from-slate-600 to-slate-700 ring-slate-400/40'
                : 'bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 ring-amber-200'
              : 'bg-gradient-to-r from-blue-800 to-indigo-800 ring-blue-400/40'
          } ${big ? 'h-16 sm:h-20 lg:h-24' : 'h-11'}`}
          style={s.revealed ? { animation: 'coroFlip .7s ease-out' } : undefined}
        >
          {s.revealed ? (
            <>
              <span className={`flex h-full items-center justify-center ${big ? 'w-16 text-3xl lg:w-24 lg:text-5xl' : 'w-10 text-xl'}`}>
                {s.emoji}
              </span>
              <span
                className={`min-w-0 flex-1 truncate font-black uppercase tracking-tight ${
                  s.scored === false ? 'text-white/80' : 'text-purple-950'
                } ${big ? 'text-2xl sm:text-3xl lg:text-5xl' : 'text-base'}`}
              >
                {s.label}
              </span>
              <span
                className={`flex h-full items-center justify-center font-black tabular-nums ${
                  s.scored === false ? 'bg-black/20 text-white/70' : 'bg-purple-950 text-yellow-300'
                } ${big ? 'w-20 text-3xl lg:w-28 lg:text-5xl' : 'w-12 text-lg'}`}
              >
                {s.points}
              </span>
            </>
          ) : (
            <span className="flex w-full justify-center">
              <span
                className={`flex items-center justify-center rounded-full bg-blue-950 font-black text-white ring-2 ring-blue-300/50 ${
                  big ? 'h-12 w-12 text-2xl lg:h-16 lg:w-16 lg:text-4xl' : 'h-8 w-8 text-base'
                }`}
              >
                {s.rank}
              </span>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/** Fila de ❌ pequenos (falhas da ronda). */
export function StrikeMarks({ strikes, size = 'big' }: { strikes: number; size?: 'big' | 'small' }) {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`flex items-center justify-center rounded-lg font-black ${size === 'big' ? 'h-12 w-12' : 'h-7 w-7'} ${
            i < strikes ? 'bg-red-600 text-white' : 'bg-white/10 text-white/20'
          }`}
        >
          <X className={size === 'big' ? 'h-8 w-8' : 'h-4 w-4'} strokeWidth={4} />
        </span>
      ))}
    </div>
  )
}

/** ❌ gigantes em ecrã inteiro durante ~1,2 s cada vez que strikeSeq sobe. */
export function StrikeOverlay({ strikeSeq, count }: { strikeSeq: number; count: number }) {
  const [prevSeq, setPrevSeq] = useState(strikeSeq)
  const [show, setShow] = useState<{ key: number; count: number } | null>(null)

  // Ajuste durante o render (padrão do React para reagir a uma prop que mudou)
  if (strikeSeq !== prevSeq) {
    setPrevSeq(strikeSeq)
    if (strikeSeq > prevSeq) setShow({ key: strikeSeq, count: Math.max(1, Math.min(3, count)) })
  }

  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(null), 1300)
    return () => clearTimeout(t)
  }, [show])

  if (!show) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center gap-6 bg-red-950/40">
      <style>{KEYFRAMES}</style>
      {Array.from({ length: show.count }, (_, i) => (
        <span
          key={`${show.key}-${i}`}
          className="flex h-48 w-48 items-center justify-center rounded-3xl border-[10px] border-red-500 bg-red-600 text-white shadow-[0_0_80px_rgba(239,68,68,.8)] lg:h-64 lg:w-64"
          style={{ animation: 'coroStrike 1.3s ease-out forwards' }}
        >
          <X className="h-40 w-40 lg:h-56 lg:w-56" strokeWidth={5} />
        </span>
      ))}
    </div>
  )
}
