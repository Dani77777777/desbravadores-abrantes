'use client'

import { forwardRef } from 'react'
import { Flame } from 'lucide-react'
import { PlayerAvatar } from './PlayerAvatar'

interface Participant {
  id: string
  display_name: string
  total_points: number
  current_streak: number
  max_streak: number
  is_guest: boolean
  avatar_url?: string | null
}

interface Props {
  participants: Participant[]
  questTitle: string
}

/**
 * Card visual idêntico ao pódio final da apresentação, mas:
 *  - Tamanho fixo 1080×1080 (perfeito para partilhar)
 *  - Sem confetti animado (estático)
 *  - Pronto para ser capturado por html-to-image
 */
export const PodiumShareCard = forwardRef<HTMLDivElement, Props>(
  ({ participants, questTitle }, ref) => {
    const podium = [...participants].sort((a, b) => b.total_points - a.total_points)

    const pedestalBg: Record<number, string> = {
      0: 'bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-600',
      1: 'bg-gradient-to-b from-slate-200 via-slate-300 to-slate-500',
      2: 'bg-gradient-to-b from-amber-500 via-amber-700 to-amber-800',
    }
    const numberColor: Record<number, string> = {
      0: 'text-yellow-800',
      1: 'text-slate-700',
      2: 'text-amber-200',
    }
    const avatarRing: Record<number, string> = {
      0: 'ring-yellow-400 bg-gradient-to-br from-yellow-300 to-yellow-500',
      1: 'ring-slate-300 bg-gradient-to-br from-slate-200 to-slate-400',
      2: 'ring-amber-600 bg-gradient-to-br from-amber-500 to-amber-700',
    }

    return (
      <div
        ref={ref}
        className="bg-gradient-to-b from-blue-950 via-blue-900 to-indigo-950 flex flex-col items-center relative overflow-hidden"
        style={{
          width: '1080px',
          height: '1080px',
          padding: '40px',
        }}
      >
        {/* Logo + título */}
        <div className="flex flex-col items-center gap-3 z-10">
          <img
            src="/images/VanaQuest.png"
            alt=""
            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
            crossOrigin="anonymous"
          />
          <p className="text-sky-300 text-sm font-black uppercase tracking-[0.3em]">VanaQuest</p>
          <h1 className="text-white font-black text-center px-6" style={{ fontSize: '3rem', lineHeight: '1.1' }}>
            🏆 {questTitle}
          </h1>
          <p className="text-white/50 text-base font-bold mt-1">
            {participants.length} jogador{participants.length !== 1 ? 'es' : ''} ·{' '}
            {new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Glow no chão */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-t from-yellow-400/40 via-yellow-300/20 to-transparent opacity-50 blur-3xl pointer-events-none"
          style={{ width: '900px', height: '180px' }}
        />

        {/* Pódio */}
        <div className="flex-1 flex items-end justify-center gap-4 w-full max-w-4xl z-10 pt-10">
          {[1, 0, 2].map((rank) => {
            const p = podium[rank]
            const heights = ['320px', '460px', '240px'] // 2nd, 1st, 3rd
            const heightIdx = [0, 1, 2][[1, 0, 2].indexOf(rank)]
            const isEmpty = !p

            return (
              <div
                key={rank}
                className={`flex-1 flex flex-col items-center ${isEmpty ? 'opacity-40' : ''}`}
              >
                {/* Avatar + nome */}
                <div className="flex flex-col items-center mb-3" style={{ minHeight: '200px' }}>
                  <div
                    className={`relative rounded-full ${
                      isEmpty
                        ? 'bg-white/5 border-2 border-dashed border-white/15'
                        : `${avatarRing[rank]} ring-4 shadow-2xl`
                    } flex items-center justify-center`}
                    style={{ width: '110px', height: '110px' }}
                  >
                    <div className={`w-full h-full rounded-full ${!isEmpty ? 'overflow-hidden' : ''} flex items-center justify-center`}>
                      {isEmpty ? (
                        <span className="text-3xl text-white/30">—</span>
                      ) : p!.avatar_url ? (
                        <img
                          src={p!.avatar_url}
                          alt={p!.display_name}
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-4xl font-black text-white drop-shadow-lg">
                          {p!.display_name[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {!isEmpty && rank === 0 && (
                      <div
                        className="absolute drop-shadow-2xl"
                        style={{ top: '-18px', right: '-18px', fontSize: '40px', lineHeight: 1 }}
                      >
                        👑
                      </div>
                    )}
                  </div>

                  <div className="text-center mt-3 px-2">
                    <p
                      className={`font-black leading-tight drop-shadow-lg ${
                        isEmpty
                          ? 'text-white/30 italic text-sm'
                          : rank === 0
                            ? 'text-white text-2xl'
                            : 'text-white text-xl'
                      }`}
                      style={{ maxWidth: '180px' }}
                    >
                      {isEmpty ? 'sem participante' : p!.display_name}
                    </p>
                    {!isEmpty && (
                      <p className="text-white/80 text-base font-bold tabular-nums mt-0.5">
                        {p!.total_points.toFixed(1)} <span className="text-white/50 text-xs">pts</span>
                      </p>
                    )}
                    {!isEmpty && p!.max_streak >= 2 && (
                      <p className="text-orange-400 text-xs font-bold flex items-center justify-center gap-1 mt-0.5">
                        <Flame style={{ width: '12px', height: '12px' }} /> ×{p!.max_streak}
                      </p>
                    )}
                  </div>
                </div>

                {/* Pedestal */}
                <div
                  className={`w-full ${pedestalBg[rank]} rounded-t-2xl shadow-2xl relative overflow-hidden ${isEmpty ? 'opacity-50 grayscale' : ''}`}
                  style={{ height: heights[heightIdx] }}
                >
                  <div className="absolute top-0 left-0 right-0 bg-white/30" style={{ height: '10px' }} />
                  <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-black/20 to-transparent" style={{ width: '30px' }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className={`font-black ${numberColor[rank]} drop-shadow-2xl select-none`}
                      style={{ fontSize: '140px', lineHeight: 1 }}
                    >
                      {rank + 1}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Marca d'água */}
        <p className="text-white/30 text-xs font-bold tracking-widest mt-4 z-10">
          DESBRAVADORES ABRANTES
        </p>
      </div>
    )
  }
)

PodiumShareCard.displayName = 'PodiumShareCard'
