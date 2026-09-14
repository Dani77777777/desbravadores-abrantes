'use client'

import { Heart } from 'lucide-react'
import { VANATRILHA_DAILY_LIVES } from '@/types/vana-trilha'

interface Props {
  lives: number
  max?: number
  /** Mostra um escudo verde (Fonte de Elim ativa). */
  shielded?: boolean
  size?: 'sm' | 'md'
}

export default function LivesIndicator({ lives, max = VANATRILHA_DAILY_LIVES, shielded = false, size = 'md' }: Props) {
  const iconClass = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`${lives} de ${max} vidas${shielded ? ', protegido pela Fonte de Elim' : ''}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const alive = i < lives
        return (
          <Heart
            key={`${i}-${alive}`}
            className={`${iconClass} transition-all duration-300 ${
              alive
                ? 'fill-rose-500 text-rose-500'
                : 'fill-slate-200 text-slate-300 animate-in zoom-in-50 duration-300'
            }`}
          />
        )
      })}
      {shielded && (
        <span
          className="ml-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-700 animate-in fade-in"
          title="Fonte de Elim: se errares a próxima, não perdes vida"
        >
          🌴 Protegido
        </span>
      )}
    </div>
  )
}
