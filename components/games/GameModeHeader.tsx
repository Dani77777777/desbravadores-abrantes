import { MonitorPlay, Smartphone } from 'lucide-react'
import type { GameModeInfo } from '@/utils/games'
import { displayFont } from '@/components/landing/fonts'

const ICON = { 'ao-vivo': MonitorPlay, 'a-solo': Smartphone } as const
const ACCENT = {
  'ao-vivo': 'from-indigo-400 to-violet-600 shadow-indigo-950/50',
  'a-solo': 'from-emerald-400 to-teal-600 shadow-emerald-950/50',
} as const

/**
 * Cabeçalho de um grupo de jogos ("Ao vivo" / "A solo") no Centro de Jogos e na
 * landing: ícone, título, quantos jogos tem, como se joga e o que é preciso.
 */
export function GameModeHeader({ mode, count, className = '' }: { mode: GameModeInfo; count: number; className?: string }) {
  const Icon = ICON[mode.id]
  return (
    <div className={`flex flex-col gap-4 border-b border-white/10 pb-5 text-white sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="flex items-start gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg ${ACCENT[mode.id]}`}
          aria-hidden
        >
          <Icon className="h-6 w-6 text-white" />
        </span>
        <div>
          <h2 className={`${displayFont.className} flex items-baseline gap-2 text-3xl font-extrabold tracking-tight sm:text-4xl`}>
            {mode.title}
            <span className="text-base font-bold text-blue-200/60">
              {count} {count === 1 ? 'jogo' : 'jogos'}
            </span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-blue-100/75 sm:text-base">{mode.description}</p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2 sm:justify-end" aria-label={`Como se joga: ${mode.title}`}>
        {mode.tags.map((tag) => (
          <li
            key={tag}
            className="rounded-full bg-white/[0.07] px-3 py-1 text-xs font-semibold text-blue-100 ring-1 ring-inset ring-white/10"
          >
            {tag}
          </li>
        ))}
      </ul>
    </div>
  )
}
