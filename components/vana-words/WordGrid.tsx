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
  /** Variante grande para o projetor (texto e cartões maiores) */
  large?: boolean
}

export function WordGrid({
  words,
  guesses,
  players,
  myPlayerId,
  showColors = false,
  onWordClick,
  disabled = false,
  large = false,
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

  // Interativo apenas quando há handler e não está desativado (projetor = não interativo)
  const interactive = !!onWordClick && !disabled

  return (
    <div className={`grid grid-cols-5 ${large ? 'gap-3 lg:gap-4' : 'gap-1.5 sm:gap-2'}`}>
      {sorted.map((word) => {
        const guessers = guessMap.get(word.id) ?? []
        const isSelected = guesses.some((g) => g.word_id === word.id && g.player_id === myPlayerId)

        const cls = wordCardClass(word.team, word.is_revealed, isSelected, showColors, interactive)

        return (
          <div
            key={word.id}
            onClick={() => interactive && !word.is_revealed && onWordClick?.(word.id)}
            className={`
              relative rounded-lg border flex flex-col items-center justify-center text-center select-none
              ${large
                ? 'rounded-2xl px-2 py-5 lg:py-8 min-h-[5.5rem] lg:min-h-[7rem]'
                : 'px-0.5 py-2 sm:p-2 min-h-[3.25rem] sm:min-h-[4rem]'}
              ${interactive ? 'transition-all duration-150' : ''}
              ${cls}
            `}
          >
            <span className={`font-bold break-words hyphens-auto w-full ${large
              ? 'text-xl lg:text-3xl tracking-wide'
              : 'text-[10px] leading-tight sm:text-sm sm:tracking-wide'}`}>
              {word.word}
            </span>

            {/* Indicadores de quem votou */}
            {guessers.length > 0 && !word.is_revealed && (
              <div className={`absolute left-0 right-0 flex justify-center gap-0.5 flex-wrap px-1 ${large ? 'bottom-2' : 'bottom-1'}`}>
                {guessers.slice(0, 4).map((p) => (
                  <span
                    key={p.id}
                    className={`rounded px-1 font-semibold truncate
                      ${large ? 'text-sm max-w-[5rem]' : 'text-[9px] max-w-[2rem]'}
                      ${p.team === 'a' ? 'bg-amber-600/80' : 'bg-blue-600/80'} text-white`}
                    title={p.display_name}
                  >
                    {p.display_name.split(' ')[0]}
                  </span>
                ))}
                {guessers.length > 4 && (
                  <span className={`text-white/60 ${large ? 'text-sm' : 'text-[9px]'}`}>+{guessers.length - 4}</span>
                )}
              </div>
            )}

            {/* Revelada: mostrar ícone da equipa */}
            {word.is_revealed && (
              <span className={`opacity-70 ${large ? 'text-2xl mt-1' : 'text-[10px] mt-0.5'}`}>
                {word.team === 'a' ? '🦁' : word.team === 'b' ? '🦅' : word.team === 'black' ? '💀' : '—'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
