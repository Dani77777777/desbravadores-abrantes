'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import confetti from 'canvas-confetti'
import { Crown } from 'lucide-react'
import { CORO_BG, TEAM_STYLE } from './BoardUI'
import { teamName } from './useCoroLive'
import type { VanaCoroPlayer, VanaCoroSession, VanaCoroTeam } from '@/types/vana-coro'

/**
 * Pódio final do VanaCoro, feito para 2 equipas (o pódio de 3 lugares dos outros
 * jogos deixava sempre um vazio). A sequência:
 *
 *   1. "Fim do jogo!" — o título entra.
 *   2. As duas equipas lado a lado, com os pontos a contar ao mesmo tempo.
 *   3. "E a equipa vencedora é…" — suspense, as duas a pulsar.
 *   4. A vencedora cresce, ganha a coroa e os confettis; a outra fica com "Boa luta!".
 *      Empate: as duas em destaque.
 *
 * Com "reduzir movimento" ligado no sistema, mostra logo o fim.
 */

type Step = 'intro' | 'scores' | 'tease' | 'final'
const TIMELINE: [Step, number][] = [
  ['intro', 0],
  ['scores', 1800],
  ['tease', 5200],
  ['final', 8000],
]
const COUNT_MS = 2800
const CONFETTI_COLORS = ['#fbbf24', '#f472b6', '#c084fc', '#38bdf8', '#ffffff']

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** Pontos a contar de 0 até ao valor final. */
function useCountUp(target: number, running: boolean, instant: boolean): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!running) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - start) / COUNT_MS)
      // Abranda no fim, para dar suspense
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, running, instant])
  return value
}

export function TeamPodium({ session, players }: { session: VanaCoroSession; players: VanaCoroPlayer[] }) {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
  const [step, setStep] = useState<Step>('intro')
  const current: Step = reduced ? 'final' : step

  useEffect(() => {
    if (reduced) return
    const timers = TIMELINE.slice(1).map(([s, at]) => setTimeout(() => setStep(s), at))
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  const scores = { a: session.team_a_score, b: session.team_b_score }
  const winner: VanaCoroTeam | null = scores.a === scores.b ? null : scores.a > scores.b ? 'a' : 'b'
  const final = current === 'final'

  // Confettis quando a vencedora aparece (e mais uns pelos lados)
  useEffect(() => {
    if (!final || reduced) return
    const origin = winner === 'a' ? 0.25 : winner === 'b' ? 0.75 : 0.5
    confetti({ particleCount: 180, spread: 100, startVelocity: 55, origin: { x: origin, y: 0.55 }, colors: CONFETTI_COLORS })
    const t1 = setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors: CONFETTI_COLORS }), 400)
    const t2 = setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors: CONFETTI_COLORS }), 650)
    const loop = setInterval(
      () => confetti({ particleCount: 40, spread: 120, startVelocity: 35, origin: { x: Math.random(), y: -0.05 }, colors: CONFETTI_COLORS }),
      1600,
    )
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearInterval(loop)
    }
  }, [final, reduced, winner])

  const caption =
    current === 'intro'
      ? 'Fim do jogo!'
      : current === 'scores'
        ? 'O JA disse… e quem ouviu melhor foi…'
        : current === 'tease'
          ? winner
            ? 'E a equipa vencedora é…'
            : 'E o resultado é…'
          : winner
            ? `${teamName(session, winner)} ganha! 🏆`
            : 'Empate! As duas equipas ouviram o JA 🤝'

  return (
    <div className={`relative flex min-h-screen flex-col items-center justify-center gap-10 overflow-hidden px-6 py-12 text-white ${CORO_BG}`}>
      <p
        key={current}
        className={`text-center font-black tracking-tight drop-shadow-2xl animate-in fade-in zoom-in-75 duration-700 ${
          final ? 'text-5xl text-amber-300 lg:text-7xl' : 'text-4xl lg:text-6xl'
        } ${current === 'tease' ? 'animate-pulse' : ''}`}
      >
        {caption}
      </p>

      {current !== 'intro' && (
        <div className="grid w-full max-w-6xl grid-cols-2 items-end gap-6 lg:gap-12">
          {(['a', 'b'] as VanaCoroTeam[]).map((t) => (
            <TeamCard
              key={t}
              team={t}
              name={teamName(session, t)}
              score={scores[t]}
              members={players.filter((p) => p.team === t).map((p) => p.display_name)}
              state={!final ? (current === 'tease' ? 'tease' : 'counting') : winner === null ? 'tie' : winner === t ? 'winner' : 'loser'}
              instant={reduced}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TeamCard({
  team,
  name,
  score,
  members,
  state,
  instant,
}: {
  team: VanaCoroTeam
  name: string
  score: number
  members: string[]
  state: 'counting' | 'tease' | 'winner' | 'loser' | 'tie'
  instant: boolean
}) {
  const shown = useCountUp(score, true, instant)
  const highlight = state === 'winner' || state === 'tie'
  const style = TEAM_STYLE[team]

  return (
    <div
      className={`relative flex flex-col items-center rounded-[2.5rem] px-6 pb-8 pt-12 text-center ring-4 transition-all duration-700 animate-in slide-in-from-bottom-10 fade-in ${style.soft} ${
        highlight
          ? `${style.ring} scale-105 shadow-[0_0_90px_rgba(251,191,36,.45)]`
          : state === 'loser'
            ? 'scale-90 opacity-60 ring-transparent'
            : `ring-white/10 ${state === 'tease' ? 'animate-pulse' : ''}`
      }`}
    >
      {highlight && (
        <Crown className="absolute -top-14 h-24 w-24 text-amber-300 drop-shadow-[0_6px_20px_rgba(251,191,36,.7)] animate-in zoom-in-50 duration-700 lg:-top-16 lg:h-28 lg:w-28" />
      )}
      <p className={`max-w-full truncate text-4xl font-black lg:text-6xl ${style.text}`}>{name}</p>
      <p className="mt-2 text-8xl font-black tabular-nums lg:text-[10rem] lg:leading-none">{shown}</p>
      <p className="text-sm font-bold uppercase tracking-widest text-white/50">pontos</p>
      {state === 'loser' && <p className="mt-3 text-xl font-bold text-white/80">Boa luta! 💪</p>}
      {members.length > 0 && (
        <p className="mt-5 line-clamp-2 max-w-full text-base text-white/70 lg:text-lg">{members.join(' · ')}</p>
      )}
    </div>
  )
}
