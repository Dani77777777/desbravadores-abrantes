'use client'

import { useEffect, useState } from 'react'

/**
 * Formata segundos como relógio: "4:35" a partir de 1 minuto, "45s" abaixo disso.
 */
export function formatClock(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Devolve segundos restantes de uma fase, atualizando a cada ~250ms.
 * Respeita pausa: se `pausedAt` estiver definido, o tempo fica congelado.
 */
export function usePhaseCountdown(phaseEndsAt: string | null, pausedAt: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!phaseEndsAt) { setRemaining(null); return }
    const end = new Date(phaseEndsAt).getTime()
    const tick = () => {
      const reference = pausedAt ? new Date(pausedAt).getTime() : Date.now()
      setRemaining(Math.max(0, Math.ceil((end - reference) / 1000)))
    }
    tick()
    const i = setInterval(tick, 250)
    return () => clearInterval(i)
  }, [phaseEndsAt, pausedAt])

  return remaining
}

/**
 * Devolve progresso 0..1 da fase atual (para gradientes).
 */
export function usePhaseProgress(phaseStartedAt: string | null, phaseEndsAt: string | null, pausedAt: string | null): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!phaseStartedAt || !phaseEndsAt) { setProgress(0); return }
    const start = new Date(phaseStartedAt).getTime()
    const end = new Date(phaseEndsAt).getTime()
    const total = end - start
    if (total <= 0) { setProgress(1); return }
    const tick = () => {
      const reference = pausedAt ? new Date(pausedAt).getTime() : Date.now()
      setProgress(Math.max(0, Math.min(1, (reference - start) / total)))
    }
    tick()
    const i = setInterval(tick, 200)
    return () => clearInterval(i)
  }, [phaseStartedAt, phaseEndsAt, pausedAt])

  return progress
}
