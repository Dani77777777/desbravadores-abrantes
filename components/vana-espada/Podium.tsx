'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import type { EspadaPlayer } from '@/types/vana-espada'

/**
 * Pódio final — o mesmo do VanaQuest: 3.º → 2.º → 1.º, com um holofote a seguir
 * quem está a ser revelado, confettis quando aparece o vencedor e, no fim, o
 * resto da classificação num painel lateral.
 */
export function Podium({ players }: { players: EspadaPlayer[] }) {
  const podium = [...players].sort((a, b) => b.totalPoints - a.totalPoints)

  // Quantas posições já foram reveladas:
  //   0 = só os pedestais · 1 = 3.º · 2 = 3.º e 2.º · 3 = os três (+ confettis)
  //   4 = entra o resto da classificação
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    const timings = [1200, 2400, 2400, 1200]
    if (revealed >= 4) return
    const t = setTimeout(() => setRevealed((r) => r + 1), timings[revealed])
    return () => clearTimeout(t)
  }, [revealed])

  // 3.º (rank 2) no passo 1, 2.º (rank 1) no passo 2, 1.º (rank 0) no passo 3.
  const isRankRevealed = (rank: number) => revealed >= 3 - rank

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
  const avatarColors: Record<number, string> = {
    0: 'bg-gradient-to-br from-yellow-300 to-yellow-500 ring-yellow-400',
    1: 'bg-gradient-to-br from-slate-200 to-slate-400 ring-slate-300',
    2: 'bg-gradient-to-br from-amber-500 to-amber-700 ring-amber-600',
  }
  const glowColor: Record<number, string> = {
    0: 'from-yellow-400/60',
    1: 'from-slate-300/60',
    2: 'from-amber-600/60',
  }

  const winnerRevealed = isRankRevealed(0) && !!podium[0]

  return (
    <div className="h-screen w-screen bg-gradient-to-b from-slate-950 via-sky-950 to-slate-900 flex flex-col items-center px-6 pt-8 pb-0 gap-4 relative overflow-hidden">
      {winnerRevealed && <ConfettiCannons />}

      <div className="text-center z-10 animate-in fade-in slide-in-from-top duration-700">
        <h1 className="text-white text-4xl md:text-5xl font-black drop-shadow-2xl tracking-tight">
          🏆 Pódio Final
        </h1>
      </div>

      {/* Brilho no chão */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1200px] h-48 rounded-full bg-gradient-to-t from-yellow-400/40 via-yellow-300/20 to-transparent opacity-50 blur-3xl pointer-events-none" />

      {/* Os três pedestais estão sempre lá; os jogadores aparecem um a um */}
      <div className="flex-1 flex items-end justify-center gap-3 md:gap-6 max-w-5xl w-full z-10 pt-4 relative">
        {revealed >= 1 && revealed <= 3 && (
          <SpotlightOnRank
            position={revealed === 1 ? 'right' : revealed === 2 ? 'left' : 'center'}
            color={revealed === 1 ? 'amber' : revealed === 2 ? 'slate' : 'yellow'}
          />
        )}

        {[1, 0, 2].map((rank, idx) => {
          const p = podium[rank]
          const isEmpty = !p
          const isRevealed = isRankRevealed(rank)
          // Alturas pela posição no ecrã: 0 = esquerda (2.º), 1 = centro (1.º), 2 = direita (3.º)
          const heights = ['h-72 md:h-80', 'h-96 md:h-[28rem]', 'h-56 md:h-64']

          return (
            <div key={rank} className="flex-1 max-w-xs flex flex-col items-center relative">
              {isRevealed && !isEmpty && (
                <div
                  className={`absolute -inset-x-4 -top-20 bottom-0 bg-gradient-to-b ${glowColor[rank]} via-transparent to-transparent rounded-3xl blur-2xl opacity-0 animate-in fade-in duration-1000`}
                  style={{ animationFillMode: 'forwards' }}
                />
              )}

              <div
                className={`flex flex-col items-center mb-3 transition-all duration-700 ${
                  isRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
                }`}
              >
                <div
                  className={`relative w-20 h-20 md:w-28 md:h-28 rounded-full transition-transform duration-700 ${
                    isRevealed ? 'scale-100' : 'scale-50'
                  } ${
                    isEmpty
                      ? 'bg-white/5 border-2 border-dashed border-white/15'
                      : `${avatarColors[rank]} ring-4 ring-offset-4 ring-offset-slate-950 shadow-2xl`
                  } flex items-center justify-center`}
                >
                  {/* O círculo interior recorta a foto mas não a coroa */}
                  <div className={`w-full h-full rounded-full ${!isEmpty ? 'overflow-hidden' : ''} flex items-center justify-center`}>
                    {isEmpty ? (
                      <span className="text-3xl text-white/30">—</span>
                    ) : p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt={p.displayName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-3xl md:text-5xl font-black text-white drop-shadow-lg">
                        {p.displayName[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {!isEmpty && rank === 0 && isRevealed && (
                    <div className="absolute -top-4 -right-4 text-4xl md:text-5xl drop-shadow-2xl animate-bounce z-20 pointer-events-none">
                      👑
                    </div>
                  )}
                </div>

                <div className="text-center mt-3 space-y-0.5 max-w-[10rem]">
                  <p
                    className={`font-black leading-tight px-1 drop-shadow-lg ${
                      isEmpty
                        ? 'text-white/30 italic text-sm'
                        : rank === 0
                          ? 'text-white text-xl md:text-2xl'
                          : 'text-white text-base md:text-lg'
                    }`}
                  >
                    {isEmpty ? 'sem participante' : p.displayName}
                  </p>
                  {!isEmpty && (
                    <p className="text-white/80 text-sm md:text-base font-bold tabular-nums">
                      {p.totalPoints} <span className="text-white/50 text-xs">pts</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Pedestal — sempre visível, apagado até ser revelado */}
              <div
                className={`w-full ${pedestalBg[rank]} ${heights[idx]} rounded-t-2xl shadow-2xl relative overflow-hidden transition-all duration-700 ${
                  isRevealed ? 'opacity-100 saturate-100' : 'opacity-25 saturate-0 brightness-75'
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-3 bg-white/30" />
                <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/20 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-7xl md:text-9xl font-black ${numberColor[rank]} drop-shadow-2xl select-none`}>
                    {rank + 1}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {podium.length > 3 && revealed >= 4 && <SideLeaderboard players={podium.slice(3)} />}
    </div>
  )
}

/** Resto da classificação (4.º em diante), com scroll automático se não couber. */
function SideLeaderboard({ players }: { players: EspadaPlayer[] }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let rafId: number
    let direction = 1
    let pos = 0
    let lastTime = performance.now()
    let pauseUntil = lastTime + 1500
    const speedPxPerSec = 20

    const tick = (now: number) => {
      const dt = now - lastTime
      lastTime = now
      const overflow = el.scrollHeight - el.clientHeight
      if (overflow > 4) {
        if (now >= pauseUntil) {
          pos += ((speedPxPerSec * dt) / 1000) * direction
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
  }, [players.length])

  return (
    <div
      className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur rounded-2xl border border-white/20 p-2 md:p-3 z-20 animate-in fade-in slide-in-from-right duration-700 shadow-2xl flex flex-col overflow-hidden"
      style={{ width: 'clamp(16rem, 22vw, 22rem)', maxHeight: '85vh' }}
    >
      <p className="text-amber-300 text-[10px] md:text-xs font-black uppercase tracking-widest text-center mb-2 flex-shrink-0">
        Classificação
      </p>
      <div
        ref={ref}
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {players.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 py-1.5 px-1.5 border-b border-white/10 last:border-0 min-w-0">
            <span className="text-xs md:text-sm font-black w-6 text-center text-white/40 flex-shrink-0">{i + 4}</span>
            <span className="flex-1 text-white font-semibold text-xs md:text-sm truncate min-w-0">{p.displayName}</span>
            <span className="text-white font-black text-xs md:text-sm tabular-nums flex-shrink-0">{p.totalPoints}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Cone de luz que segue a posição a ser revelada. */
function SpotlightOnRank({
  position,
  color,
}: {
  position: 'left' | 'center' | 'right'
  color: 'yellow' | 'slate' | 'amber'
}) {
  const positions = {
    left: 'left-[16%]',
    center: 'left-1/2 -translate-x-1/2',
    right: 'right-[16%]',
  }
  const colors = {
    yellow: 'rgba(250,204,21,0.4)',
    slate: 'rgba(203,213,225,0.35)',
    amber: 'rgba(217,119,6,0.35)',
  }
  return (
    <div
      className={`absolute ${positions[position]} -top-40 w-[400px] h-[600px] pointer-events-none animate-in fade-in duration-700`}
      style={{
        background: `radial-gradient(ellipse at top, ${colors[color]} 0%, transparent 60%)`,
        filter: 'blur(20px)',
      }}
    />
  )
}

/** Canhões de confettis dos dois lados, enquanto o pódio estiver no ecrã. */
function ConfettiCannons() {
  useEffect(() => {
    const colors = ['#fbbf24', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']
    let running = true

    const fire = () => {
      if (!running) return
      confetti({ particleCount: 8, angle: 60, spread: 55, origin: { x: 0, y: 0.9 }, colors })
      confetti({ particleCount: 8, angle: 120, spread: 55, origin: { x: 1, y: 0.9 }, colors })
      setTimeout(fire, 400)
    }

    fire()
    return () => { running = false }
  }, [])

  return null
}
