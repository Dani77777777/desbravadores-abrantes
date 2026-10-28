'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import confetti from 'canvas-confetti'

/**
 * Pódio final cinematográfico, partilhado pelos jogos ao vivo (VanaQuest,
 * VanaEspada, VanaSketch). A sequência:
 *
 *   1. Abertura — o palco escurece, o título entra e os pedestais sobem.
 *   2. "Em 3.º lugar…" → revela o 3.º (pontos a contar).
 *   3. "Em 2.º lugar…" → revela o 2.º.
 *   4. "E o grande vencedor é…" — suspense: holofotes a varrer o palco e o
 *      pedestal do 1.º a pulsar.
 *   5. Destaque do vencedor em ecrã inteiro, com uma explosão de confettis.
 *   6. Pódio completo, confettis contínuos e o resto da classificação ao lado.
 *
 * Com menos de 3 jogadores os passos dos lugares vazios são saltados. Com
 * "reduzir movimento" ligado no sistema, salta logo para o pódio completo.
 */

export interface PodiumEntry {
  id: string
  name: string
  avatarUrl?: string | null
  points: number
  /** Linha extra por baixo dos pontos (ex.: melhor sequência no VanaQuest) */
  extra?: ReactNode
}

interface Props {
  /** Ordenadas do 1.º para o último */
  entries: PodiumEntry[]
  /** Fundo do palco (classes Tailwind e/ou estilo) */
  backgroundClassName?: string
  backgroundStyle?: CSSProperties
  /** Cor do anel à volta dos avatares — igual ao fundo (ex.: 'ring-offset-blue-950') */
  ringOffsetClassName: string
  /** Fonte dos títulos e legendas */
  displayFontClassName?: string
  formatPoints?: (points: number) => string
  title?: string
}

type Step =
  | { kind: 'intro' }
  | { kind: 'tease'; rank: number }
  | { kind: 'reveal'; rank: number }
  | { kind: 'takeover' }
  | { kind: 'final' }

const DURATION: Record<Step['kind'], number> = {
  intro: 2400,
  tease: 1500,
  reveal: 2300,
  takeover: 4200,
  final: Infinity,
}
const WINNER_TEASE_MS = 3400

const CAPTION: Record<number, string> = {
  2: 'Em 3.º lugar…',
  1: 'Em 2.º lugar…',
  0: 'E o grande vencedor é…',
}

const PEDESTAL_BG: Record<number, string> = {
  0: 'bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-600',
  1: 'bg-gradient-to-b from-slate-200 via-slate-300 to-slate-500',
  2: 'bg-gradient-to-b from-amber-500 via-amber-700 to-amber-800',
}
const NUMBER_COLOR: Record<number, string> = { 0: 'text-yellow-800', 1: 'text-slate-700', 2: 'text-amber-200' }
const AVATAR_BG: Record<number, string> = {
  0: 'bg-gradient-to-br from-yellow-300 to-yellow-500 ring-yellow-400',
  1: 'bg-gradient-to-br from-slate-200 to-slate-400 ring-slate-300',
  2: 'bg-gradient-to-br from-amber-500 to-amber-700 ring-amber-600',
}
const GLOW: Record<number, string> = { 0: 'rgba(250,204,21,0.45)', 1: 'rgba(203,213,225,0.38)', 2: 'rgba(217,119,6,0.4)' }
// Posição no ecrã: esquerda = 2.º, centro = 1.º, direita = 3.º
const VISUAL_ORDER = [1, 0, 2]
const HEIGHTS: Record<number, string> = { 0: 'h-96 md:h-[28rem]', 1: 'h-72 md:h-80', 2: 'h-56 md:h-64' }
const SPOT_LEFT: Record<number, string> = { 1: '18%', 0: '50%', 2: '82%' }

const KEYFRAMES = `
@keyframes cp-rise { from { transform: scaleY(0) } to { transform: scaleY(1) } }
@keyframes cp-sweep-l { 0%,100% { transform: rotate(-28deg) } 50% { transform: rotate(18deg) } }
@keyframes cp-sweep-r { 0%,100% { transform: rotate(28deg) } 50% { transform: rotate(-18deg) } }
@keyframes cp-pulse { 0%,100% { filter: brightness(1) } 50% { filter: brightness(1.45) } }
@keyframes cp-shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-4px) rotate(-3deg) } 75% { transform: translateX(4px) rotate(3deg) } }
@keyframes cp-pop { 0% { transform: scale(.3); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
@keyframes cp-caption { 0% { opacity: 0; transform: translateY(16px) scale(.96); letter-spacing: .02em } 100% { opacity: 1; transform: none; letter-spacing: .04em } }
`

// Os passos só dependem de quantos lugares do pódio estão ocupados (0 a 3)
function buildSteps(filled: number): Step[] {
  const steps: Step[] = [{ kind: 'intro' }]
  for (const rank of [2, 1]) {
    if (rank < filled) steps.push({ kind: 'tease', rank }, { kind: 'reveal', rank })
  }
  if (filled > 0) steps.push({ kind: 'tease', rank: 0 }, { kind: 'takeover' })
  steps.push({ kind: 'final' })
  return steps
}

export function CinematicPodium({
  entries,
  backgroundClassName = '',
  backgroundStyle,
  ringOffsetClassName,
  displayFontClassName = '',
  formatPoints = (n) => String(Math.round(n)),
  title = '🏆 Pódio Final',
}: Props) {
  // `entries` chega como um array novo a cada render (os jogos atualizam o
  // ecrã de poucos em poucos segundos) — por isso nada aqui depende da
  // referência do array, senão os temporizadores recomeçavam a cada render.
  const filled = Math.min(entries.length, 3)
  const steps = useMemo(() => buildSteps(filled), [filled])
  const [index, setIndex] = useState(0)

  // Quem tem "reduzir movimento" ligado vê logo o pódio completo
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setIndex(steps.length - 1)
  }, [steps.length])

  const step = steps[Math.min(index, steps.length - 1)]
  const stepMs = step.kind === 'tease' && step.rank === 0 ? WINNER_TEASE_MS : DURATION[step.kind]
  useEffect(() => {
    if (!Number.isFinite(stepMs)) return
    const t = setTimeout(() => setIndex((i) => i + 1), stepMs)
    return () => clearTimeout(t)
  }, [index, stepMs])

  const isRevealed = (rank: number) =>
    steps.findIndex((s) => (s.kind === 'reveal' && s.rank === rank) || (rank === 0 && s.kind === 'takeover')) <= index
  const winnerTease = step.kind === 'tease' && step.rank === 0
  const isFinal = step.kind === 'final'
  const focusRank = step.kind === 'tease' || step.kind === 'reveal' ? step.rank : null

  return (
    <div
      className={`relative flex h-screen w-full flex-col items-center gap-4 overflow-hidden px-6 pt-8 ${backgroundClassName}`}
      style={backgroundStyle}
    >
      <style>{KEYFRAMES}</style>

      {isFinal && <ConfettiCannons />}

      <h1
        className={`z-10 text-center text-4xl font-black tracking-tight text-white drop-shadow-2xl md:text-6xl animate-in fade-in zoom-in-50 duration-1000 ${displayFontClassName}`}
      >
        {title}
      </h1>

      {/* Legenda de suspense */}
      <div className="z-20 flex h-16 items-center justify-center md:h-20">
        {step.kind === 'tease' && (
          <p
            key={`caption-${step.rank}`}
            className={`text-center text-3xl font-black text-white drop-shadow-[0_4px_24px_rgba(0,0,0,.8)] md:text-5xl ${displayFontClassName}`}
            style={{ animation: 'cp-caption .7s cubic-bezier(.2,.8,.2,1) both' }}
          >
            {CAPTION[step.rank]}
          </p>
        )}
      </div>

      {/* Escurecer o palco no suspense do vencedor */}
      <div
        className="pointer-events-none absolute inset-0 z-[5] bg-black transition-opacity duration-700"
        style={{ opacity: step.kind === 'intro' ? 0.35 : winnerTease ? 0.55 : 0 }}
      />

      {/* Holofotes a varrer o palco antes do vencedor */}
      {winnerTease && (
        <>
          <div
            className="pointer-events-none absolute -top-10 left-[8%] z-[6] h-[120vh] w-48 origin-top"
            style={{ background: 'linear-gradient(to bottom, rgba(255,240,180,.55), transparent 75%)', filter: 'blur(14px)', animation: 'cp-sweep-l 1.6s ease-in-out infinite' }}
          />
          <div
            className="pointer-events-none absolute -top-10 right-[8%] z-[6] h-[120vh] w-48 origin-top"
            style={{ background: 'linear-gradient(to bottom, rgba(255,240,180,.55), transparent 75%)', filter: 'blur(14px)', animation: 'cp-sweep-r 1.6s ease-in-out infinite' }}
          />
        </>
      )}

      {/* Holofote fixo sobre quem está a ser revelado */}
      {focusRank !== null && !winnerTease && (
        <div
          key={`spot-${focusRank}`}
          className="pointer-events-none absolute -top-40 z-[6] h-[640px] w-[420px] -translate-x-1/2 animate-in fade-in duration-700"
          style={{ left: SPOT_LEFT[focusRank], background: `radial-gradient(ellipse at top, ${GLOW[focusRank]} 0%, transparent 62%)`, filter: 'blur(18px)' }}
        />
      )}

      {/* Brilho no chão */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-48 w-[1200px] -translate-x-1/2 rounded-full bg-gradient-to-t from-yellow-400/40 via-yellow-300/20 to-transparent opacity-50 blur-3xl" />

      {/* Pedestais */}
      <div className="relative z-10 flex w-full max-w-5xl flex-1 items-end justify-center gap-3 md:gap-6">
        {VISUAL_ORDER.map((rank, idx) => {
          const p = entries[rank]
          const revealed = !!p && isRevealed(rank)
          const pulsing = winnerTease && rank === 0
          return (
            <div key={rank} className="relative flex max-w-xs flex-1 flex-col items-center">
              {revealed && (
                <div
                  className="pointer-events-none absolute -inset-x-4 -top-20 bottom-0 rounded-3xl blur-2xl animate-in fade-in duration-1000"
                  style={{ background: `linear-gradient(to bottom, ${GLOW[rank]}, transparent 70%)` }}
                />
              )}

              {/* Avatar, nome e pontos */}
              <div className="mb-3 flex min-h-[11rem] flex-col items-center justify-end md:min-h-[14rem]">
                {revealed ? (
                  <div className="flex flex-col items-center" style={{ animation: 'cp-pop .8s cubic-bezier(.2,.9,.3,1.2) both' }}>
                    <Avatar entry={p} rank={rank} ringOffsetClassName={ringOffsetClassName} size="md" />
                    <div className="mt-3 max-w-[11rem] space-y-0.5 text-center">
                      <p className={`px-1 font-black leading-tight text-white drop-shadow-lg ${rank === 0 ? 'text-xl md:text-2xl' : 'text-base md:text-lg'}`}>
                        {p.name}
                      </p>
                      <p className="text-sm font-bold tabular-nums text-white/85 md:text-base">
                        <CountUp value={p.points} format={formatPoints} /> <span className="text-xs text-white/50">pts</span>
                      </p>
                      {p.extra}
                    </div>
                  </div>
                ) : p ? (
                  // Ainda por revelar: um "?" que treme no suspense do vencedor
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-white/25 bg-white/5 text-4xl font-black text-white/40 md:h-28 md:w-28 md:text-5xl"
                    style={pulsing ? { animation: 'cp-shake .25s linear infinite' } : undefined}
                  >
                    ?
                  </div>
                ) : (
                  <p className="text-sm italic text-white/30">sem participante</p>
                )}
              </div>

              <div
                className={`relative w-full origin-bottom overflow-hidden rounded-t-2xl shadow-2xl transition-[filter,opacity] duration-700 ${PEDESTAL_BG[rank]} ${HEIGHTS[rank]} ${
                  revealed || pulsing ? 'opacity-100' : 'opacity-30 saturate-0'
                }`}
                style={{
                  animation: [
                    `cp-rise .9s cubic-bezier(.2,.8,.2,1) ${0.35 + idx * 0.18}s both`,
                    pulsing ? 'cp-pulse .5s ease-in-out infinite' : '',
                  ].filter(Boolean).join(', '),
                }}
              >
                <div className="absolute left-0 right-0 top-0 h-3 bg-white/30" />
                <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/20 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`select-none text-7xl font-black drop-shadow-2xl md:text-9xl ${NUMBER_COLOR[rank]}`}>{rank + 1}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Destaque do vencedor em ecrã inteiro */}
      {step.kind === 'takeover' && entries[0] && (
        <WinnerTakeover
          entry={entries[0]}
          ringOffsetClassName={ringOffsetClassName}
          displayFontClassName={displayFontClassName}
          formatPoints={formatPoints}
        />
      )}

      {isFinal && entries.length > 3 && <RestOfLeaderboard entries={entries.slice(3)} formatPoints={formatPoints} />}
    </div>
  )
}

const AVATAR_SIZE = {
  md: { box: 'h-20 w-20 md:h-28 md:w-28 ring-4 ring-offset-4', initial: 'text-3xl md:text-5xl', crown: '-right-4 -top-4 text-4xl md:text-5xl' },
  xl: { box: 'h-44 w-44 md:h-60 md:w-60 ring-8 ring-offset-8', initial: 'text-7xl md:text-9xl', crown: '-right-8 -top-10 text-6xl md:text-8xl' },
}

function Avatar({
  entry,
  rank,
  ringOffsetClassName,
  size,
}: {
  entry: PodiumEntry
  rank: number
  ringOffsetClassName: string
  size: keyof typeof AVATAR_SIZE
}) {
  const s = AVATAR_SIZE[size]
  return (
    <div className={`relative flex items-center justify-center rounded-full shadow-2xl ${AVATAR_BG[rank]} ${ringOffsetClassName} ${s.box}`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt={entry.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className={`font-black text-white drop-shadow-lg ${s.initial}`}>{entry.name[0]?.toUpperCase()}</span>
        )}
      </div>
      {rank === 0 && (
        <div className={`pointer-events-none absolute z-20 animate-bounce drop-shadow-2xl ${s.crown}`}>👑</div>
      )}
    </div>
  )
}

function WinnerTakeover({
  entry,
  ringOffsetClassName,
  displayFontClassName,
  formatPoints,
}: {
  entry: PodiumEntry
  ringOffsetClassName: string
  displayFontClassName: string
  formatPoints: (n: number) => string
}) {
  // Explosão de confettis à entrada do vencedor
  useEffect(() => {
    const colors = ['#fde047', '#facc15', '#f59e0b', '#ffffff', '#fb7185', '#60a5fa']
    confetti({ particleCount: 160, spread: 100, startVelocity: 55, origin: { y: 0.6 }, colors })
    const t1 = setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.75 }, colors }), 350)
    const t2 = setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.75 }, colors }), 550)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-500">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(250,204,21,.45) 0%, transparent 65%)', filter: 'blur(10px)' }}
      />
      <div style={{ animation: 'cp-pop 1s cubic-bezier(.2,.9,.3,1.25) both' }}>
        <Avatar entry={entry} rank={0} ringOffsetClassName={ringOffsetClassName} size="xl" />
      </div>
      <div className="relative z-10 text-center" style={{ animation: 'cp-caption .8s .35s cubic-bezier(.2,.8,.2,1) both' }}>
        <p className={`max-w-[90vw] truncate text-5xl font-black text-white drop-shadow-[0_6px_30px_rgba(250,204,21,.6)] md:text-8xl ${displayFontClassName}`}>
          {entry.name}
        </p>
        <p className="mt-3 text-3xl font-black tabular-nums text-yellow-300 md:text-5xl">
          <CountUp value={entry.points} format={formatPoints} duration={1800} /> <span className="text-xl text-yellow-200/70 md:text-2xl">pts</span>
        </p>
      </div>
    </div>
  )
}

// Número a contar de 0 até ao valor (ease-out)
function CountUp({ value, format, duration = 1200 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setShown(value * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{format(shown)}</>
}

// Confettis contínuos dos dois lados, depois de o pódio estar completo
function ConfettiCannons() {
  useEffect(() => {
    const colors = ['#fbbf24', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']
    let running = true
    const fire = () => {
      if (!running) return
      confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0, y: 0.9 }, colors })
      confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1, y: 0.9 }, colors })
      setTimeout(fire, 450)
    }
    fire()
    return () => { running = false }
  }, [])
  return null
}

// Resto da classificação (4.º em diante) num painel lateral, com auto-scroll
function RestOfLeaderboard({ entries, formatPoints }: { entries: PodiumEntry[]; formatPoints: (n: number) => string }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    let direction = 1
    let pos = 0
    let last = performance.now()
    let pauseUntil = last + 1500
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const overflow = el.scrollHeight - el.clientHeight
      if (overflow > 4 && now >= pauseUntil) {
        pos += (20 * dt / 1000) * direction
        if (pos >= overflow) { pos = overflow; direction = -1; pauseUntil = now + 1800 }
        else if (pos <= 0) { pos = 0; direction = 1; pauseUntil = now + 1800 }
        el.scrollTop = pos
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [entries.length])

  return (
    <div
      className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-2 shadow-2xl backdrop-blur animate-in fade-in slide-in-from-right duration-700 md:right-6 md:p-3"
      style={{ width: 'clamp(15rem, 21vw, 21rem)', maxHeight: '80vh' }}
    >
      <p className="mb-2 shrink-0 text-center text-[10px] font-black uppercase tracking-widest text-white/60 md:text-xs">Classificação</p>
      <div ref={ref} className="space-y-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((e, i) => (
          <div key={e.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1.5 text-sm">
            <span className="w-7 shrink-0 text-center font-black text-white/50">{i + 4}º</span>
            <span className="min-w-0 flex-1 truncate font-bold text-white">{e.name}</span>
            <span className="shrink-0 font-black tabular-nums text-white/80">{formatPoints(e.points)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
