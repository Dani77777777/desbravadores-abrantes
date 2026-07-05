'use client'

import { useEffect, useRef, useState } from 'react'
import { TEAM_CARD_PALETTE, VW, vwSans } from './theme'
import type { VanaWordsWord, VanaWordsGuess, VanaWordsPlayer, WordTeam } from '@/types/vana-words'

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

  // Toca a animação de reveal só na transição não-revelada → revelada (jogo ao vivo,
  // ao contrário do mockup estático onde todas as palavras já nascem no estado final).
  const prevRevealed = useRef<Map<string, boolean>>(new Map())
  const [justRevealedIds, setJustRevealedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const prev = prevRevealed.current
    const newlyRevealed: string[] = []
    for (const w of words) {
      if (w.is_revealed && prev.get(w.id) === false) newlyRevealed.push(w.id)
      prev.set(w.id, w.is_revealed)
    }
    if (newlyRevealed.length > 0) {
      setJustRevealedIds((s) => new Set([...s, ...newlyRevealed]))
    }
  }, [words])

  return (
    <div className={`grid grid-cols-5 ${vwSans.className} ${large ? 'grid-rows-5 flex-1 min-h-0 gap-[clamp(0.375rem,1.2vh,1rem)]' : 'gap-1.5 sm:gap-2'}`}>
      {sorted.map((word) => {
        const guessers = guessMap.get(word.id) ?? []
        const isSelected = guesses.some((g) => g.word_id === word.id && g.player_id === myPlayerId)
        const team = word.team as Exclude<WordTeam, null> | null
        const pal = team ? TEAM_CARD_PALETTE[team] : null
        // Grelha-chave (host/arauto): a equipa está sempre visível, mesmo antes do reveal
        const isKey = showColors && !!team
        const animate = word.is_revealed && justRevealedIds.has(word.id)

        let cardStyle: React.CSSProperties
        let textStyle: React.CSSProperties

        if (word.is_revealed && pal) {
          const glow = team === 'black'
            ? `0 0 0 2px ${pal.ring}, 0 0 30px rgba(217,58,47,.4), 0 10px 24px rgba(0,0,0,.45)`
            : `0 0 0 2px ${pal.ring}, 0 10px 24px rgba(0,0,0,.4)`
          cardStyle = {
            background: pal.fill,
            boxShadow: isKey ? 'inset 0 0 0 2px rgba(255,255,255,.4)' : glow,
            opacity: isKey ? 0.45 : 1,
            animation: animate ? 'vw-popReveal .55s cubic-bezier(.2,.9,.3,1.2) both' : undefined,
          }
          textStyle = { color: pal.text, fontWeight: 800 }
        } else if (isKey && pal) {
          cardStyle = { background: pal.fill, boxShadow: '0 3px 9px rgba(0,0,0,.32)' }
          textStyle = { color: pal.text, fontWeight: 800 }
        } else if (isSelected) {
          cardStyle = { background: 'rgba(63,140,255,.22)', boxShadow: 'inset 0 0 0 2px rgba(63,140,255,.7)' }
          textStyle = { color: '#eef1f8', fontWeight: 700 }
        } else {
          cardStyle = {
            background: 'linear-gradient(165deg,#18213f,#111834)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 6px 16px rgba(0,0,0,.35)',
          }
          textStyle = { color: '#e3e8f6', fontWeight: 600 }
        }

        return (
          <div
            key={word.id}
            onClick={() => interactive && !word.is_revealed && onWordClick?.(word.id)}
            style={cardStyle}
            className={`
              relative rounded-lg border border-white/[.07] flex flex-col items-center justify-center text-center select-none
              ${large
                ? 'rounded-2xl px-2 py-1 min-h-0'
                : 'px-0.5 py-2 sm:p-2 min-h-[3.25rem] sm:min-h-[4rem]'}
              ${interactive ? 'transition-all duration-150 cursor-pointer hover:brightness-110' : 'cursor-default'}
            `}
          >
            <span
              style={textStyle}
              className={`break-words hyphens-auto w-full tracking-wide ${large
                ? 'leading-tight text-[clamp(0.875rem,1vw+1.6vh,1.875rem)]'
                : 'text-[10px] leading-tight sm:text-sm'}`}
            >
              {word.word}
            </span>

            {/* Ponto indicador de palpite no canto (leitura rápida, do mockup) */}
            {guessers.length > 0 && !word.is_revealed && (
              <span
                className={`absolute rounded-full ${large ? 'top-1.5 left-1.5 w-[clamp(0.625rem,1.4vh,1rem)] h-[clamp(0.625rem,1.4vh,1rem)]' : 'top-1 left-1 w-2.5 h-2.5'}`}
                style={{ background: VW.blue, boxShadow: '0 0 0 2px rgba(255,255,255,.85)' }}
              />
            )}

            {/* Nomes de quem votou */}
            {guessers.length > 0 && !word.is_revealed && (
              <div className="absolute left-0 right-0 bottom-1 flex justify-center gap-0.5 flex-wrap px-1">
                {guessers.slice(0, 4).map((p) => (
                  <span
                    key={p.id}
                    style={{ background: p.team === 'a' ? 'rgba(245,166,35,.85)' : 'rgba(63,140,255,.85)' }}
                    className={`rounded px-1 font-semibold truncate text-white
                      ${large ? 'text-[clamp(0.6rem,1.4vh,0.875rem)] max-w-[5rem]' : 'text-[9px] max-w-[2rem]'}`}
                    title={p.display_name}
                  >
                    {p.display_name.split(' ')[0]}
                  </span>
                ))}
                {guessers.length > 4 && (
                  <span className={`text-white/60 ${large ? 'text-[clamp(0.6rem,1.4vh,0.875rem)]' : 'text-[9px]'}`}>+{guessers.length - 4}</span>
                )}
              </div>
            )}

            {/* Revelada: ✓ na grelha-chave, ícone da equipa na grelha pública */}
            {word.is_revealed && isKey && (
              <span className="absolute top-1 right-1.5 text-[11px] font-black" style={{ color: 'rgba(0,0,0,.55)' }}>✓</span>
            )}
            {word.is_revealed && !isKey && (
              <span className={`opacity-70 ${large ? 'text-[clamp(0.875rem,2.2vh,1.5rem)] mt-0.5' : 'text-[10px] mt-0.5'}`}>
                {team === 'a' ? '🦁' : team === 'b' ? '🦅' : team === 'black' ? '💀' : '—'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
