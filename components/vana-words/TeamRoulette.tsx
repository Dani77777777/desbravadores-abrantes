'use client'

import { useEffect, useState, useRef } from 'react'
import { TEAM_LABELS, TEAM_COLORS } from '@/types/vana-words'
import type { VanaWordsPlayer, TeamId } from '@/types/vana-words'

interface TeamRouletteProps {
  team: TeamId
  candidates: VanaWordsPlayer[]
  winner: VanaWordsPlayer
  onDone: () => void
  autoStart?: boolean
}

export function TeamRoulette({ team, candidates, winner, onDone, autoStart = true }: TeamRouletteProps) {
  const [current, setCurrent] = useState(candidates[0])
  const [spinning, setSpinning] = useState(false)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!autoStart) return
    startSpin()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  function startSpin() {
    setSpinning(true)
    setDone(false)

    let idx = 0
    let delay = 80
    let elapsed = 0
    const totalTime = 3500 // ms

    function tick() {
      idx = (idx + 1) % candidates.length
      setCurrent(candidates[idx])
      elapsed += delay

      // Accelerate first, then slow down
      if (elapsed < totalTime * 0.6) {
        delay = Math.max(60, delay - 2)
      } else {
        delay = Math.min(400, delay + 20)
      }

      if (elapsed >= totalTime) {
        clearInterval(intervalRef.current!)
        setCurrent(winner)
        setSpinning(false)
        setDone(true)
        setTimeout(onDone, 800)
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = setInterval(tick, delay)
      }
    }

    intervalRef.current = setInterval(tick, delay)
  }

  const colors = TEAM_COLORS[team]
  const teamLabel = TEAM_LABELS[team]

  return (
    <div className="flex flex-col items-center gap-3">
      <p className={`text-xs font-bold uppercase tracking-widest ${colors.text}`}>
        {team === 'a' ? '🦁' : '🦅'} Equipa {teamLabel}
      </p>
      <div
        className={`
          w-48 h-16 rounded-xl border-2 flex items-center justify-center
          transition-all duration-200
          ${done ? `${colors.bg} border-transparent shadow-lg scale-105` : 'bg-slate-800 border-slate-600'}
          ${spinning ? 'opacity-90' : ''}
        `}
      >
        <span
          className={`font-bold text-lg tracking-wide truncate px-4 ${done ? 'text-white' : 'text-white/80'}`}
        >
          {current?.display_name ?? '…'}
        </span>
      </div>
      {done && (
        <p className="text-xs text-white/50">Arauto da Equipa {teamLabel}</p>
      )}
    </div>
  )
}
