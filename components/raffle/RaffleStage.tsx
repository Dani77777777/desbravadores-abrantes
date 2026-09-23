'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { Trophy } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials, type RaffleDraw, type RaffleEntry } from '@/utils/raffle'
import { playTick, playWin } from '@/utils/raffle-sound'

const SPIN_MS_FIRST = 4200
const SPIN_MS_NEXT = 3000
const PAUSE_MS = 1800

export function EntryAvatar({ entry, className }: { entry: RaffleEntry; className?: string }) {
  return (
    <Avatar className={className}>
      {entry.avatar && <AvatarImage src={entry.avatar} alt="" className="object-cover" />}
      <AvatarFallback className="bg-blue-100 font-black text-blue-800">{initials(entry.name)}</AvatarFallback>
    </Avatar>
  )
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Rolo de nomes: 2 nomes de margem em cima, o nome atual, nomes ao acaso, o vencedor
 * e 2 nomes de margem em baixo. Os nomes intermédios são decorativos (cada ecrã
 * gera os seus); só o vencedor é igual em todos.
 */
function buildStrip(pool: RaffleEntry[], winner: RaffleEntry, current: RaffleEntry | null, spins: number) {
  const others = pool.filter((p) => p.id !== winner.id)
  const src = others.length > 0 ? others : [winner]
  const pick = (prev?: RaffleEntry) => {
    if (src.length === 1) return src[0]
    let e = randomFrom(src)
    while (prev && e.id === prev.id) e = randomFrom(src)
    return e
  }
  const items: RaffleEntry[] = [pick(), pick()]
  items.push(current ?? pick(items[1]))
  for (let i = 0; i < spins; i++) items.push(pick(items[items.length - 1]))
  const target = items.length
  items.push(winner, pick(winner), pick())
  return { items, start: 2, target }
}

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4)

export function RaffleStage({
  draw,
  variant,
  sound,
  instant = false,
  onDone,
}: {
  draw: RaffleDraw
  variant: 'phone' | 'projector'
  sound: boolean
  /** Mostrar logo o resultado (ex.: o projetor abriu a meio de um sorteio). */
  instant?: boolean
  onDone?: () => void
}) {
  const total = draw.winners.length
  const skip = instant || draw.revealAll
  const [step, setStep] = useState(skip ? total : 0) // vencedor a rodar (total = acabou)
  const [revealed, setRevealed] = useState(skip ? total : 0)
  const [reel, setReel] = useState(() =>
    buildStrip(draw.pool, draw.winners[0], null, 0),
  )
  const [pos, setPos] = useState(reel.start)

  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const soundRef = useRef(sound)
  soundRef.current = sound
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const isProjector = variant === 'projector'
  const rowH = isProjector ? 128 : 76

  const stopAll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (timerRef.current) clearTimeout(timerRef.current)
    rafRef.current = null
    timerRef.current = null
  }

  // "Revelar todos" carregado no telemóvel
  useEffect(() => {
    if (!draw.revealAll) return
    stopAll()
    setStep(total)
    setRevealed(total)
  }, [draw.revealAll, total])

  // Máquina de passos: roda até ao vencedor `step`, celebra, pausa, segue.
  useEffect(() => {
    if (step >= total) {
      onDoneRef.current?.()
      return
    }
    const winner = draw.winners[step]
    const current = step > 0 ? draw.winners[step - 1] : null
    const duration = step === 0 ? SPIN_MS_FIRST : SPIN_MS_NEXT
    const spins = Math.max(12, Math.round(duration / 110))
    const strip = buildStrip(draw.pool, winner, current, spins)
    setReel(strip)
    setPos(strip.start)

    const distance = strip.target - strip.start
    let t0: number | null = null
    let lastIdx = strip.start
    const frame = (now: number) => {
      if (t0 === null) t0 = now
      const t = Math.min(1, (now - t0) / duration)
      const p = strip.start + distance * easeOutQuart(t)
      setPos(p)
      const idx = Math.round(p)
      if (idx !== lastIdx) {
        lastIdx = idx
        if (soundRef.current) playTick(1 + t * 0.4)
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame)
        return
      }
      rafRef.current = null
      setRevealed(step + 1)
      if (soundRef.current) playWin()
      confetti({
        particleCount: isProjector ? 160 : 90,
        spread: 80,
        startVelocity: isProjector ? 55 : 40,
        origin: { y: 0.45 },
        zIndex: 200,
      })
      timerRef.current = setTimeout(() => setStep(step + 1), step + 1 < total ? PAUSE_MS : 900)
    }
    rafRef.current = requestAnimationFrame(frame)
    return stopAll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => stopAll, [])

  const done = step >= total
  const landed = !done && revealed === step + 1
  const winners = draw.winners.slice(0, revealed)

  // ── Resultado final ────────────────────────────────────────
  if (done) {
    if (total === 1) {
      const w = draw.winners[0]
      return (
        <div className="flex flex-col items-center text-center animate-in fade-in zoom-in-90 duration-500">
          <Trophy className={isProjector ? 'mb-6 h-20 w-20 text-amber-300' : 'mb-4 h-12 w-12 text-amber-300'} />
          <EntryAvatar
            entry={w}
            className={isProjector ? 'size-56 ring-8 ring-amber-300' : 'size-32 ring-4 ring-amber-300'}
          />
          <p className={`mt-6 font-black leading-tight text-white ${isProjector ? 'text-7xl' : 'text-4xl'}`}>{w.name}</p>
        </div>
      )
    }
    return (
      <div className="w-full animate-in fade-in duration-500">
        <p className={`mb-6 text-center font-black uppercase tracking-widest text-amber-300 ${isProjector ? 'text-3xl' : 'text-lg'}`}>
          <Trophy className={`mr-2 inline ${isProjector ? 'h-8 w-8' : 'h-5 w-5'}`} />
          {total} sorteados
        </p>
        <WinnerGrid winners={draw.winners} big={isProjector} />
      </div>
    )
  }

  // ── A rodar ────────────────────────────────────────────────
  const first = Math.max(0, Math.floor(pos) - 2)
  const last = Math.min(reel.items.length - 1, Math.ceil(pos) + 2)
  const rows: { entry: RaffleEntry; i: number }[] = []
  for (let i = first; i <= last; i++) rows.push({ entry: reel.items[i], i })

  return (
    <div className="flex w-full flex-col items-center">
      {total > 1 && (
        <p className={`mb-4 font-black uppercase tracking-widest text-blue-200 ${isProjector ? 'text-2xl' : 'text-sm'}`}>
          {step + 1}.º de {total}
        </p>
      )}

      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-slate-950/60 shadow-2xl ring-1 ring-white/10"
        style={{ height: rowH * 3 }}
      >
        {/* Moldura central */}
        <div
          className={`pointer-events-none absolute inset-x-3 z-10 rounded-2xl border-4 transition-colors duration-300 ${
            landed ? 'border-amber-300 bg-amber-300/15 shadow-[0_0_40px_rgba(252,211,77,0.45)]' : 'border-white/25'
          }`}
          style={{ top: rowH, height: rowH }}
        />
        {rows.map(({ entry, i }) => {
          const d = Math.abs(i - pos)
          const opacity = Math.max(0.15, 1 - d * 0.55)
          const scale = 1 - Math.min(d, 1) * 0.15
          return (
            <div
              key={i}
              className="absolute inset-x-0 flex items-center justify-center gap-4 px-8"
              style={{
                height: rowH,
                transform: `translateY(${(i - pos + 1) * rowH}px) scale(${scale})`,
                opacity,
              }}
            >
              <EntryAvatar entry={entry} className={isProjector ? 'size-20' : 'size-11'} />
              <span
                className={`truncate font-black text-white ${isProjector ? 'text-6xl' : 'text-2xl'} ${
                  landed && i === reel.target ? 'text-amber-200' : ''
                }`}
              >
                {entry.name}
              </span>
            </div>
          )
        })}
        {/* Desvanecer em cima/baixo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-slate-950/80 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-slate-950/80 to-transparent" />
      </div>

      {winners.length > 0 && total > 1 && (
        <div className="mt-8 w-full">
          <WinnerGrid winners={winners} big={false} />
        </div>
      )}
    </div>
  )
}

function WinnerGrid({ winners, big }: { winners: RaffleEntry[]; big: boolean }) {
  // No projetor, com poucos vencedores há espaço de sobra — cartões maiores
  const huge = big && winners.length <= 3
  return (
    // flex-wrap centrado: 2 vencedores ficam ao meio (numa grelha fixa ficavam encostados à esquerda)
    <div className={`mx-auto flex w-full flex-wrap justify-center ${big ? 'max-w-7xl gap-6' : 'max-w-3xl gap-3'}`}>
      {winners.map((w, i) => (
        <div
          key={w.id}
          className={`flex max-w-full items-center gap-3 rounded-2xl bg-white/10 ring-1 ring-white/15 animate-in fade-in zoom-in-95 duration-500 ${
            huge ? 'min-w-[26rem] px-8 py-7' : big ? 'min-w-[22rem] px-6 py-5' : 'w-full p-3 sm:w-auto sm:min-w-[16rem]'
          }`}
        >
          <span className={`flex-shrink-0 font-black text-amber-300 ${huge ? 'text-5xl' : big ? 'text-3xl' : 'w-8 text-lg'}`}>{i + 1}.º</span>
          <EntryAvatar entry={w} className={`flex-shrink-0 ${huge ? 'size-24' : big ? 'size-16' : 'size-10'}`} />
          <span className={`min-w-0 truncate pr-2 font-black text-white ${huge ? 'text-6xl' : big ? 'text-4xl' : 'text-lg'}`}>{w.name}</span>
        </div>
      ))}
    </div>
  )
}
