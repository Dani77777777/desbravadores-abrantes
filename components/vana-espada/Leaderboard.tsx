'use client'

import { useEffect, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import type { EspadaPlayer } from '@/types/vana-espada'

/** Pontos antes desta ronda. Vem da BD, por isso sobrevive a um refresh do projetor. */
const pointsBefore = (p: EspadaPlayer) => p.totalPoints - (p.lastRoundPoints ?? 0)

// px entre linhas. O VanaQuest usa 158, mas aí a 6.ª linha fica cortada num
// projetor 1080p; com 140 cabe o top 6 inteiro.
const ROW_HEIGHT = 140
const VISIBLE_ROWS = 6
const COUNT_DURATION = 1800
const COUNT_DELAY = 400 // pequena pausa antes de começar a contar

/**
 * Classificação do projetor — o mesmo ecrã do VanaQuest.
 *
 * Os pontos sobem a contar desde o total de antes da ronda até ao novo, com o
 * "+N" ganho ao lado. As linhas ficam na ordem antiga enquanto contam e só no fim
 * deslizam para as posições novas: assim vê-se quem ultrapassou quem.
 *
 * Montar uma vez por ronda (`key` = ronda) para a animação arrancar do zero.
 */
export function Leaderboard({ players }: { players: EspadaPlayer[] }) {
  const [animatedPoints, setAnimatedPoints] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((p) => [p.id, pointsBefore(p)]))
  )
  const [showFinalOrder, setShowFinalOrder] = useState(false)

  // Congela os valores de partida e de chegada no momento em que o ecrã aparece:
  // o polling dos jogadores continua a correr e não pode reiniciar a contagem.
  const snapshotRef = useRef(
    players.map((p) => ({ id: p.id, start: pointsBefore(p), end: p.totalPoints }))
  )

  useEffect(() => {
    const snapshot = snapshotRef.current
    const startTime = performance.now() + COUNT_DELAY
    let rafId: number

    const tick = (now: number) => {
      const elapsed = now - startTime
      if (elapsed < 0) {
        rafId = requestAnimationFrame(tick)
        return
      }
      const t = Math.min(1, elapsed / COUNT_DURATION)
      const eased = 1 - Math.pow(1 - t, 3)
      setAnimatedPoints(
        Object.fromEntries(snapshot.map((s) => [s.id, s.start + (s.end - s.start) * eased]))
      )
      if (t < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    // A troca de posições começa antes de a contagem acabar — a sobreposição
    // dá mais vida do que esperar pelo fim.
    const swapTimer = setTimeout(() => setShowFinalOrder(true), 1100)

    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(swapTimer)
    }
  }, [])

  const startOrder = [...players].sort((a, b) => pointsBefore(b) - pointsBefore(a))
  const endOrder = [...players].sort((a, b) => b.totalPoints - a.totalPoints)
  const ordered = showFinalOrder ? endOrder : startOrder
  const indexById = new Map(ordered.map((p, idx) => [p.id, idx]))

  // Top 6 em qualquer das ordens, para ninguém aparecer ou desaparecer de repente a
  // meio da troca. Quem cai do top 6 desliza para a 7.ª posição e esbate-se.
  const visibleIds = new Set([
    ...startOrder.slice(0, VISIBLE_ROWS).map((p) => p.id),
    ...endOrder.slice(0, VISIBLE_ROWS).map((p) => p.id),
  ])
  const top = players.filter((p) => visibleIds.has(p.id))

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 flex flex-col p-6 md:p-8 gap-4 overflow-hidden relative">
      <div className="text-center space-y-1">
        <p className="text-amber-300 text-base font-black uppercase tracking-[0.3em]">Classificação</p>
        <h2
          className="text-white font-black flex items-center justify-center gap-3"
          style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
        >
          <Trophy className="w-12 h-12 md:w-16 md:h-16 text-amber-300" /> Top jogadores
        </h2>
      </div>

      <div
        className="flex-1 max-w-6xl mx-auto w-full relative"
        style={{ minHeight: `${Math.min(top.length, VISIBLE_ROWS) * ROW_HEIGHT}px` }}
      >
        {top.map((p) => {
          const i = indexById.get(p.id) ?? 0
          const value = animatedPoints[p.id] ?? p.totalPoints
          const delta = p.lastRoundPoints ?? 0

          return (
            <div
              key={p.id}
              className="absolute left-0 right-0 top-0 will-change-transform"
              style={{
                transform: `translate3d(0, ${i * ROW_HEIGHT}px, 0)`,
                opacity: i < VISIBLE_ROWS ? 1 : 0,
                transition: 'transform 1200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 600ms ease-out 500ms',
              }}
            >
              <div className={`flex items-center gap-5 rounded-3xl px-5 py-4 md:px-6 md:py-5 border-2 shadow-2xl backdrop-blur-sm ${
                i === 0 ? 'bg-amber-400/20 border-amber-400/40'
                  : i === 1 ? 'bg-gray-300/15 border-gray-300/30'
                  : i === 2 ? 'bg-amber-700/15 border-amber-700/30'
                  : 'bg-white/10 border-white/10'
              }`}>
                <div
                  className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center font-black flex-shrink-0 transition-colors ${
                    i === 0 ? 'bg-amber-400 text-amber-900'
                      : i === 1 ? 'bg-gray-300 text-gray-800'
                      : i === 2 ? 'bg-amber-700 text-amber-50'
                      : 'bg-white/10 text-white'
                  }`}
                  style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}
                >
                  {i + 1}
                </div>
                <PlayerAvatar
                  name={p.displayName}
                  avatarUrl={p.avatarUrl}
                  className="w-16 h-16 md:w-20 md:h-20"
                  textClassName="text-2xl"
                  fallbackBg="bg-white/15"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-white font-black truncate leading-tight"
                    style={{ fontSize: 'clamp(1.5rem, 3vw, 2.75rem)' }}
                  >
                    {p.displayName}
                  </p>
                  {p.isGuest && <p className="text-sky-300/70 text-base font-semibold mt-1">convidado</p>}
                </div>

                {delta > 0 && (
                  <span
                    className="bg-green-500/30 border border-green-400/40 rounded-full px-4 py-1.5 text-green-300 font-black tabular-nums animate-in slide-in-from-right fade-in duration-500"
                    style={{ fontSize: 'clamp(1rem, 1.5vw, 1.5rem)' }}
                  >
                    +{delta}
                  </span>
                )}

                <div className="text-right min-w-[8rem] md:min-w-[11rem]">
                  <p
                    className="text-white font-black tabular-nums leading-none"
                    style={{ fontSize: 'clamp(2.5rem, 4.5vw, 4rem)' }}
                  >
                    {Math.round(value)}
                  </p>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-wider mt-1">pontos</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
