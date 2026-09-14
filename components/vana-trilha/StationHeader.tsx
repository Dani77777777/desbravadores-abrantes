import { STATION_THEME } from '@/utils/vana-trilha-labels'
import type { VanaTrilhaStation } from '@/types/vana-trilha'

interface Props {
  station: VanaTrilhaStation
  /** Mostra a citação (no ecrã inicial); durante o jogo fica mais compacto. */
  showVerse?: boolean
  className?: string
}

export default function StationHeader({ station, showVerse = true, className = '' }: Props) {
  const theme = STATION_THEME[station.color]
  return (
    <div className={`overflow-hidden rounded-3xl bg-gradient-to-br ${theme.gradient} text-white shadow-lg ${className}`}>
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-white/20 leading-none backdrop-blur">
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">Etapa</span>
          <span className="text-lg font-black">{station.id}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black leading-tight sm:text-xl">{station.name}</p>
          <p className="truncate text-xs font-semibold opacity-90 sm:text-sm">
            {station.subtitle} · {station.reference}
          </p>
        </div>
      </div>
      {showVerse && (
        <blockquote className="border-t border-white/20 bg-black/10 px-4 py-3 text-sm italic leading-snug sm:px-5">
          «{station.verse}»
          <span className="mt-1 block text-xs font-bold not-italic opacity-80">{station.verse_reference}</span>
        </blockquote>
      )}
    </div>
  )
}
