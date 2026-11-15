'use client'

import { GameErrorScreen } from '@/components/game-error/GameErrorScreen'

/**
 * Boundary de erro para os ecrãs do VanaCamp (jogador, host, projeção).
 *
 * Sem isto, uma exceção transitória durante a troca de fase deixava o ecrã
 * em branco para sempre. A recuperação automática está no GameErrorScreen,
 * partilhado com os outros jogos; aqui ficam só as cores do VanaCamp.
 */
export default function VanaCampError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <GameErrorScreen
      error={error}
      reset={reset}
      gameName="VanaCamp"
      backgroundClassName="bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 text-amber-100"
      buttonClassName="bg-amber-600 hover:bg-amber-500 text-white"
      iconClassName="text-amber-300/70"
      message="Houve um soluço a trocar de fase. A recarregar automaticamente."
    />
  )
}
