'use client'

import { GameErrorScreen } from '@/components/game-error/GameErrorScreen'

/**
 * Boundary de erro de todos os jogos (/jogos/**). Os jogos com cores próprias
 * têm o seu error.tsx (VanaQuest, VanaCamp), que usa o mesmo componente.
 */
export default function JogosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <GameErrorScreen error={error} reset={reset} />
}
