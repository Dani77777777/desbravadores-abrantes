'use client'

import { forwardRef } from 'react'
import type { VanaCampSide } from '@/types/vana-camp'

interface Winner {
  id: string
  display_name: string
  avatar_url: string | null
  is_mayor: boolean
}

interface Props {
  winnerSide: VanaCampSide
  winners: Winner[]
}

/**
 * Cartão 1080×1080 partilhável com o resultado do VanaCamp:
 *  - Logo + "Vitória dos Infiltrados/Desbravadores"
 *  - A equipa vencedora em linha, com o destacado (Diretor, ou o primeiro) ao
 *    centro e os restantes alternados para os lados.
 * Estático, pronto a ser capturado por html-to-image.
 */
export const VanaCampVictoryCard = forwardRef<HTMLDivElement, Props>(
  ({ winnerSide, winners }, ref) => {
    const infWin = winnerSide === 'infiltrators'

    // Destacado ao centro, restantes alternados para os lados.
    const highlight = winners[0] ?? null
    const rest = winners.slice(1)
    const left: Winner[] = []
    const right: Winner[] = []
    rest.forEach((w, i) => (i % 2 === 0 ? left : right).push(w))
    const ordered = [...left.reverse(), ...(highlight ? [highlight] : []), ...right]

    // Tamanhos adaptados ao nº de elementos para caberem em linha.
    const n = ordered.length
    const side = n <= 4 ? 160 : n <= 7 ? 124 : 96
    const big = Math.round(side * 1.4)
    const date = new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })

    return (
      <div
        ref={ref}
        className={`flex flex-col items-center relative overflow-hidden ${
          infWin
            ? 'bg-gradient-to-br from-red-950 via-stone-900 to-red-950'
            : 'bg-gradient-to-br from-amber-600 via-orange-500 to-yellow-400'
        }`}
        style={{ width: '1080px', height: '1080px', padding: '64px' }}
      >
        {/* Logo + cabeçalho */}
        <div className="flex flex-col items-center gap-3 z-10">
          <img
            src="/images/VanaCamp.png"
            alt=""
            style={{ width: '120px', height: '120px', objectFit: 'contain' }}
            crossOrigin="anonymous"
          />
          <p
            className={`text-sm font-black uppercase tracking-[0.4em] ${infWin ? 'text-red-300' : 'text-amber-950/80'}`}
          >
            VanaCamp
          </p>
          <h1
            className="text-white font-black text-center px-6 drop-shadow-lg"
            style={{ fontSize: '4.5rem', lineHeight: '1.05' }}
          >
            {infWin ? 'Vitória dos Infiltrados!' : 'Vitória dos Desbravadores!'}
          </h1>
          <p className={`text-lg font-bold ${infWin ? 'text-red-200/70' : 'text-amber-950/70'}`}>
            {infWin
              ? 'Enganaram o acampamento até ao fim.'
              : 'Descobriram todos os Infiltrados!'}
          </p>
        </div>

        {/* Brilho no chão */}
        <div
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full blur-3xl pointer-events-none ${
            infWin ? 'bg-red-500/30' : 'bg-yellow-200/40'
          }`}
          style={{ width: '900px', height: '220px' }}
        />

        {/* Equipa vencedora */}
        <div className="flex-1 flex items-center justify-center w-full z-10">
          <div className="flex flex-wrap items-end justify-center gap-x-6 gap-y-8 px-4">
            {ordered.map((w) => {
              const isHi = highlight ? w.id === highlight.id : false
              const sz = isHi ? big : side
              return (
                <div key={w.id} className="flex flex-col items-center" style={{ width: `${sz + 24}px` }}>
                  <div
                    className={`relative rounded-full flex items-center justify-center shadow-2xl ${
                      isHi
                        ? infWin ? 'ring-4 ring-red-300' : 'ring-4 ring-white'
                        : infWin ? 'ring-2 ring-red-400/50' : 'ring-2 ring-white/60'
                    } ${infWin ? 'bg-gradient-to-br from-red-800 to-stone-900' : 'bg-gradient-to-br from-amber-300 to-orange-500'}`}
                    style={{ width: `${sz}px`, height: `${sz}px` }}
                  >
                    <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                      {w.avatar_url ? (
                        <img
                          src={w.avatar_url}
                          alt={w.display_name}
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span
                          className="font-black text-white drop-shadow"
                          style={{ fontSize: `${Math.round(sz * 0.42)}px` }}
                        >
                          {w.display_name[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {w.is_mayor && (
                      <div
                        className="absolute drop-shadow-2xl"
                        style={{ top: `-${Math.round(sz * 0.18)}px`, fontSize: `${Math.round(sz * 0.36)}px`, lineHeight: 1 }}
                      >
                        👑
                      </div>
                    )}
                  </div>
                  <p
                    className="text-white font-black text-center mt-3 drop-shadow-lg leading-tight"
                    style={{ fontSize: isHi ? '1.6rem' : '1.2rem', maxWidth: `${sz + 20}px` }}
                  >
                    {w.display_name}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Marca d'água */}
        <p className="text-white/40 text-sm font-bold tracking-[0.3em] z-10">
          DESBRAVADORES ABRANTES &middot; {date}
        </p>
      </div>
    )
  }
)

VanaCampVictoryCard.displayName = 'VanaCampVictoryCard'
