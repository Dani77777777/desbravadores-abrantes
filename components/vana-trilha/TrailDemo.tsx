'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { Check, Play, RotateCcw, X } from 'lucide-react'
import TrailBoard from './TrailBoard'
import LivesIndicator from './LivesIndicator'
import { VANATRILHA_DAILY_LENGTH, VANATRILHA_DAILY_LIVES } from '@/types/vana-trilha'
import './VanaTrilha.css'

/**
 * Demonstração local (sem base de dados, sem login) para a página "Como Jogar":
 * o peão avança 2 casas → erra uma → perde um coração → avança até ao fim → confetes.
 */

type Frame = {
  position: number
  lives: number
  caption: string
  answer?: 'right' | 'wrong'
  done?: boolean
}

// Estação 3 (Deserto de Sin, âmbar) só para as cores — a demo esconde as casas especiais.
const DEMO_STATION = 3

const FRAMES: Frame[] = [
  { position: 1, lives: 3, answer: 'right', caption: 'Acertou! O peão avança uma casa.' },
  { position: 2, lives: 3, answer: 'right', caption: 'Mais uma certa! Casa 2.' },
  { position: 2, lives: 2, answer: 'wrong', caption: 'Errou… perde uma vida, mas fica a saber a resposta certa.' },
  { position: 3, lives: 2, answer: 'right', caption: 'Nova pergunta, e desta vez acertou!' },
  { position: 4, lives: 2, answer: 'right', caption: 'Casa 4. Já vai a meio!' },
  { position: 5, lives: 2, answer: 'right', caption: 'Casa 5.' },
  { position: 6, lives: 2, answer: 'right', caption: 'Casa 6.' },
  { position: 7, lives: 2, answer: 'right', caption: 'Só falta uma!' },
  { position: 8, lives: 2, answer: 'right', caption: 'Chegou ao fim: etapa completa! 🎉', done: true },
]

const FRAME_MS = 1100

export default function TrailDemo() {
  const [frame, setFrame] = useState(-1)
  const [running, setRunning] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  function clearTimers() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => clearTimers, [])

  function play() {
    clearTimers()
    setFrame(-1)
    setRunning(true)
    FRAMES.forEach((f, i) => {
      timers.current.push(
        setTimeout(() => {
          setFrame(i)
          if (f.done) {
            setRunning(false)
            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.6 },
              colors: ['#F59E0B', '#EA580C', '#EAB308', '#FDE68A', '#1E3A5F'],
              disableForReducedMotion: true,
            })
          }
        }, 300 + i * FRAME_MS),
      )
    })
  }

  const current = frame >= 0 ? FRAMES[frame] : null
  const position = current?.position ?? 0
  const lives = current?.lives ?? VANATRILHA_DAILY_LIVES
  const finished = current?.done && !running

  return (
    <div className="rounded-3xl border border-amber-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-slate-800">
          Casa {position} de {VANATRILHA_DAILY_LENGTH}
        </p>
        <LivesIndicator lives={lives} size="sm" />
      </div>

      <TrailBoard
        station={DEMO_STATION}
        hideSpecials
        position={position}
        status={current ? (current.done ? 'completed' : 'playing') : 'idle'}
        moveKey={frame >= 0 && current?.answer === 'right' ? frame : undefined}
      />

      <div className="mt-4 flex min-h-16 items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3" aria-live="polite">
        {current ? (
          <>
            <span
              key={frame}
              className={`vt-pop flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white ${
                current.answer === 'wrong' ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
            >
              {current.answer === 'wrong' ? <X className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            </span>
            <p className="text-sm font-semibold text-slate-700">{current.caption}</p>
          </>
        ) : (
          <p className="w-full text-center text-sm font-medium text-slate-500">
            Carrega no botão para ver uma etapa a acontecer.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={play}
        disabled={running}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 font-black text-white shadow-lg shadow-orange-500/20 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
      >
        {finished ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white" />}
        {running ? 'A mostrar…' : finished ? 'Ver outra vez' : 'Ver como funciona'}
      </button>
    </div>
  )
}
