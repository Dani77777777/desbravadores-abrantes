'use client'

import { useEffect, useRef } from 'react'
import { lobbyTopic, LOBBY_EMOJIS, type LobbyGame } from './content'
import { FloatingEmojis } from './ProjectorLobby'
import { onReactionTaps, parseTapBatch } from './reactions'
import { useReactionFloaters } from './useReactionFloaters'
import type { LobbyPlayer } from './useLobbyHype'

/**
 * Reações em emoji no PROJETOR durante o jogo (depois da sala de espera), como no
 * Kahoot: os emojis que os jogadores tocam sobem pelas margens do ecrã, com o nome,
 * sem tapar a pergunta, as respostas nem o pódio. Mesmo canal da sala de espera.
 */
export function GameReactionsOverlay({
  game,
  sessionId,
  players,
}: {
  game: LobbyGame
  sessionId: string
  players: LobbyPlayer[]
}) {
  const { floaters, spawnBatch } = useReactionFloaters('edges')
  const playersRef = useRef<Map<string, LobbyPlayer>>(new Map())
  const lastBatchRef = useRef<Map<string, number>>(new Map())
  const emojis = LOBBY_EMOJIS[game]

  useEffect(() => {
    playersRef.current = new Map(players.map((p) => [p.id, p]))
  }, [players])

  useEffect(() => onReactionTaps(lobbyTopic(game, sessionId), (payload) => {
    const batch = parseTapBatch(payload, playersRef.current, lastBatchRef.current, emojis.length)
    if (batch) spawnBatch(batch.taps.map((i) => emojis[i]), batch.player.name)
  }), [game, sessionId, emojis, spawnBatch])

  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden" aria-hidden>
      <FloatingEmojis floaters={floaters} />
    </div>
  )
}
