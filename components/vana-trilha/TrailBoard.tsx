'use client'

import { Flag, Tent } from 'lucide-react'
import Pawn from './Pawn'
import { dailyBoard } from '@/utils/vana-trilha'
import { STATION_THEME, TILE_EMOJI, TILE_LABEL } from '@/utils/vana-trilha-labels'
import { VANATRILHA_DAILY_LENGTH, getStation, type VanaTrilhaRunStatus } from '@/types/vana-trilha'
import './VanaTrilha.css'

interface Props {
  station: number
  position: number
  status?: VanaTrilhaRunStatus | 'idle'
  /** Muda sempre que o peão se move, para reiniciar a animação de salto. */
  moveKey?: number | string
  /** Esconde as casas especiais (usado na demonstração). */
  hideSpecials?: boolean
  className?: string
}

type Layout = { cols: number; rows: number; cells: { col: number; row: number }[] }

// Telemóvel: serpentina 5 + 4 (cabe em 360px sem scroll horizontal).
const MOBILE: Layout = {
  cols: 5,
  rows: 2,
  cells: [
    { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }, { col: 4, row: 0 },
    { col: 4, row: 1 }, { col: 3, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 1 },
  ],
}

// Ecrã largo: trilha horizontal.
const WIDE: Layout = {
  cols: VANATRILHA_DAILY_LENGTH + 1,
  rows: 1,
  cells: Array.from({ length: VANATRILHA_DAILY_LENGTH + 1 }, (_, i) => ({ col: i, row: 0 })),
}

function center(layout: Layout, i: number) {
  const c = layout.cells[i]
  return { x: ((c.col + 0.5) / layout.cols) * 100, y: ((c.row + 0.5) / layout.rows) * 100 }
}

function Board({ layout, station, position, status, moveKey, hideSpecials, heightClass, nodeClass }: Props & {
  layout: Layout
  heightClass: string
  nodeClass: string
}) {
  const tiles = hideSpecials ? dailyBoard(0) : dailyBoard(station)
  const theme = STATION_THEME[getStation(station).color]
  const points = layout.cells.map((_, i) => center(layout, i))
  const pawn = points[Math.min(Math.max(position, 0), VANATRILHA_DAILY_LENGTH)]
  const playing = status === 'playing'

  return (
    <div className={`relative w-full ${heightClass}`}>
      {/* caminho */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#E7C98B"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#B45309"
          strokeWidth="2"
          strokeDasharray="2 6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.5"
        />
      </svg>

      {/* casas */}
      {tiles.map((tile, i) => {
        const p = points[i]
        const reached = i <= position && status !== 'idle'
        const isStart = i === 0
        const isEnd = i === VANATRILHA_DAILY_LENGTH
        const isTarget = playing && i === position + 1
        const label = isStart
          ? 'Partida'
          : isEnd
            ? `Casa ${i}: Terra Prometida da etapa`
            : `Casa ${i}${tile !== 'normal' ? `: ${TILE_LABEL[tile]}` : ''}`

        return (
          <div
            key={i}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 font-black shadow-sm transition-colors duration-300 ${nodeClass} ${
              isEnd
                ? reached
                  ? 'border-yellow-500 bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-900'
                  : 'border-yellow-400 bg-yellow-50 text-yellow-600'
                : reached
                  ? `${theme.bg} border-white text-white`
                  : tile !== 'normal'
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-amber-200 bg-white text-slate-400'
            } ${isTarget ? 'vt-pulse-ring border-amber-500' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={label}
            aria-label={label}
          >
            {isStart ? (
              <Tent className="h-4 w-4" />
            ) : isEnd ? (
              <Flag className="h-4 w-4" />
            ) : tile !== 'normal' ? (
              <span className="text-base leading-none">{TILE_EMOJI[tile]}</span>
            ) : (
              <span className="text-xs">{i}</span>
            )}
          </div>
        )
      })}

      {/* peão */}
      <div
        className="vt-pawn pointer-events-none absolute z-10"
        style={{ left: `${pawn.x}%`, top: `${pawn.y}%`, transform: 'translate(-50%, -88%)' }}
      >
        <div key={moveKey} className={moveKey !== undefined ? 'vt-hop' : ''}>
          <Pawn className="h-9 w-8 sm:h-11 sm:w-9" />
        </div>
      </div>
    </div>
  )
}

export default function TrailBoard(props: Props) {
  const { className = '', position, status = 'playing' } = props
  return (
    <div
      className={`rounded-3xl border border-amber-100 bg-gradient-to-b from-amber-50 to-orange-50/60 px-2 pb-2 pt-7 ${className}`}
      role="img"
      aria-label={`Trilha da etapa: o peão está na casa ${position} de ${VANATRILHA_DAILY_LENGTH}.`}
    >
      <div className="md:hidden">
        <Board {...props} status={status} layout={MOBILE} heightClass="h-36" nodeClass="h-10 w-10" />
      </div>
      <div className="hidden md:block">
        <Board {...props} status={status} layout={WIDE} heightClass="h-20" nodeClass="h-12 w-12" />
      </div>
    </div>
  )
}
