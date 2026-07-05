'use client'

import { useEffect, useState, useRef } from 'react'
import { TEAM_LABELS } from '@/types/vana-words'
import type { VanaWordsPlayer, TeamId } from '@/types/vana-words'
import { VW, TEAM_GRADIENT, vwSerif } from './theme'

interface TeamRouletteProps {
  team: TeamId
  candidates: VanaWordsPlayer[]
  winner: VanaWordsPlayer
  onDone: () => void
  /** Disparado `finaleLeadMs()` antes da roleta parar — para o SFX acabar em sintonia com a revelação */
  onFinale?: () => void
  /** Avanço em ms do onFinale (função para ler a duração do áudio só quando é preciso) */
  finaleLeadMs?: () => number
  autoStart?: boolean
  /** true → mostra logo o vencedor, sem animação de roleta */
  instant?: boolean
}

export function TeamRoulette({ team, candidates, winner, onDone, onFinale, finaleLeadMs, autoStart = true, instant = false }: TeamRouletteProps) {
  const [current, setCurrent] = useState(instant ? winner : candidates[0])
  const [spinning, setSpinning] = useState(false)
  const [done, setDone] = useState(instant)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finaleFiredRef = useRef(false)

  useEffect(() => {
    if (instant) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setCurrent(winner)
      setDone(true)
      onFinale?.()
      const t = setTimeout(onDone, 300)
      return () => clearTimeout(t)
    }
    if (!autoStart) return
    // Já terminou (ex.: revelação instantânea) e o `instant` voltou a false
    // por dados atrasados da sessão — não voltar a girar a roleta.
    if (done) return
    startSpin()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [instant])

  function startSpin() {
    setSpinning(true)
    setDone(false)
    finaleFiredRef.current = false

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

      if (!finaleFiredRef.current && onFinale && elapsed >= totalTime - (finaleLeadMs?.() ?? 1200)) {
        finaleFiredRef.current = true
        onFinale()
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

  const teamLabel = TEAM_LABELS[team]
  const accent = team === 'a' ? VW.amber : VW.blue

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>
        Equipa {teamLabel}
      </p>
      <div
        className={`w-48 h-16 rounded-xl border-2 flex items-center justify-center transition-all duration-200 ${spinning ? 'opacity-90' : ''} ${done ? 'border-transparent shadow-lg scale-105' : ''}`}
        style={done ? { background: TEAM_GRADIENT[team] } : { background: '#111834', borderColor: 'rgba(255,255,255,.15)' }}
      >
        <span
          className={`${vwSerif.className} font-semibold text-lg tracking-wide truncate px-4`}
          style={{ color: done ? (team === 'a' ? '#1e1305' : '#f5f9ff') : 'rgba(255,255,255,.8)' }}
        >
          {current?.display_name ?? '…'}
        </span>
      </div>
      {done && (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>Arauto da Equipa {teamLabel}</p>
      )}
    </div>
  )
}
