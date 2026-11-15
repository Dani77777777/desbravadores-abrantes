'use client'

import { GameErrorScreen } from '@/components/game-error/GameErrorScreen'

/**
 * Boundary de erro dos ecrãs do VanaQuest (jogador, controlo, apresentação),
 * com o gradiente azul/índigo do jogo. O participante está em localStorage
 * (vana_participant_<sessionId>), por isso o refresh volta a pô-lo no jogo.
 */
export default function VanaQuestError({
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
      gameName="VanaQuest"
      backgroundClassName="bg-gradient-to-br from-blue-900 via-blue-900 to-indigo-900 text-white"
      buttonClassName="bg-sky-500 hover:bg-sky-400 text-white"
      iconClassName="text-sky-300/80"
    />
  )
}
