'use client'

import { wordCardClass } from '@/utils/vana-words'
import type { VanaWordsWord, VanaWordsGuess, VanaWordsPlayer } from '@/types/vana-words'

interface WordGridProps {
  words: VanaWordsWord[]
  guesses: VanaWordsGuess[]
  players: VanaWordsPlayer[]
  myPlayerId?: string
  showColors?: boolean
  onWordClick?: (wordId: string) => void
  disabled?: boolean
}

export function WordGrid({
  words,
  guesses,
  players,
  myPlayerId,
  showColors = false,
  onWordClick,
  disabled = false,
}: WordGridProps) {
  const sorted = [...words].sort((a, b) => a.grid_pos - b.grid_pos)

  // Map wordId → players who guessed it
  const guessMap = new Map<string, VanaWordsPlayer[]>()
  for (const g of guesses) {
    const p = players.find((pl) => pl.id === g.player_id)
    if (!p) continue
    const list = guessMap.get(g.word_id) ?? []
    list.push(p)
    guessMap.set(g.word_id, list)
  }

  return (
    <div className="grid grid-cols-5 gap-2">
      {sorted.map((word) => {
        const guessers = guessMap.get(word.id) ?? []
        const isSelected = guesses.some((g) => g.word_id === word.id && g.player_id === myPlayerId)

        const cls = wordCardClass(word.team, word.is_revealed, isSelected, showColors)

        return (
          <div
            key={word.id}
            onClick={() => !disabled && !word.is_revealed && onWordClick?.(word.id)}
            className={`
              relative rounded-lg border p-2 min-h-[4rem] flex flex-col items-center justify-center
              transition-all duration-150 select-none text-center
              ${cls}
              ${disabled || word.is_revealed ? 'cursor-default' : ''}
            `}
          >
            <span className="font-bold text-sm leading-tight tracking-wide">
              {word.word}
            </span>

            {/* Indicadores de quem votou */}
            {guessers.length > 0 && !word.is_revealed && (
              <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5 flex-wrap px-1">
                {guessers.slice(0, 4).map((p) => (
                  <span
                    key={p.id}
                    className={`text-[9px] rounded px-1 font-semibold truncate max-w-[2rem]
                      ${p.team === 'a' ? 'bg-amber-600/80' : 'bg-blue-600/80'} text-white`}
                    title={p.display_name}
                  >
                    {p.display_name.split(' ')[0]}
                  </span>
                ))}
                {guessers.length > 4 && (
                  <span className="text-[9px] text-white/60">+{guessers.length - 4}</span>
                )}
              </div>
            )}

            {/* Revelada: mostrar ícone da equipa */}
            {word.is_revealed && (
              <span className="text-[10px] mt-0.5 opacity-70">
                {word.team === 'a' ? '🦁' : word.team === 'b' ? '🦅' : word.team === 'black' ? '💀' : '—'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
