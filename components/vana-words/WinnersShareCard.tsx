'use client'

import { forwardRef } from 'react'
import { VW, VW_SCREEN_STYLE, TEAM_GRADIENT, vwSans, vwSerif } from './theme'
import { initials } from './ui'
import { shortDisplayNames } from '@/utils/vana-words'
import { TEAM_LABELS } from '@/types/vana-words'
import type { VanaWordsPlayer, TeamId } from '@/types/vana-words'

interface Props {
  /** Jogadores da equipa vencedora (o Arauto é destacado via is_arauto) */
  winners: VanaWordsPlayer[]
  /** Todos os jogadores da sessão — para desambiguar primeiros nomes repetidos */
  allPlayers?: VanaWordsPlayer[]
  team: TeamId
  winReason?: string | null
}

/**
 * Card com a equipa vencedora do VanaWords, no mesmo padrão do
 * PodiumShareCard do VanaQuest:
 *  - Tamanho fixo 1080×1080 (perfeito para partilhar)
 *  - Logo do jogo em cima + um único espaço com todos os vencedores
 *  - Pronto para ser capturado por html-to-image
 */
export const WinnersShareCard = forwardRef<HTMLDivElement, Props>(
  ({ winners, allPlayers, team, winReason }, ref) => {
    const label = TEAM_LABELS[team]
    const emoji = team === 'a' ? '🦁' : '🦅'
    const accent = team === 'a' ? VW.amber : VW.blue
    const rgb = team === 'a' ? '245,166,35' : '63,140,255'
    // Primeiro nome, ou "Primeiro Último" quando há homónimos na sessão
    const shortNames = shortDisplayNames(allPlayers ?? winners)
    // Com equipas grandes, encolhe os avatares para caber tudo no card
    const av = winners.length > 8 ? 100 : winners.length > 5 ? 116 : 132

    return (
      <div
        ref={ref}
        className={`${vwSans.className} flex flex-col items-center relative overflow-hidden`}
        style={{ ...VW_SCREEN_STYLE, width: '1080px', height: '1080px', padding: '48px' }}
      >
        {/* Logo + título */}
        <div className="flex flex-col items-center gap-2 z-10">
          <img
            src="/images/VanaWords.png"
            alt=""
            style={{ height: '110px', width: 'auto', objectFit: 'contain' }}
            crossOrigin="anonymous"
          />
          <p className="text-sm font-black uppercase" style={{ color: VW.mut, letterSpacing: '0.3em' }}>
            VanaWords
          </p>
          <h1 className={`${vwSerif.className} font-semibold text-center`} style={{ fontSize: '3.4rem', lineHeight: 1.1, color: VW.ink }}>
            {emoji} Equipa {label} venceu! 🏆
          </h1>
          <p className="text-base font-bold" style={{ color: 'rgba(238,241,248,.55)' }}>
            {winReason === 'black_hit'
              ? 'A equipa adversária revelou a palavra preta 💀'
              : 'Encontraram todas as palavras da equipa!'}
            {' · '}
            {new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Glow no fundo com a cor da equipa */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
          style={{
            width: '900px',
            height: '220px',
            background: `radial-gradient(closest-side, rgba(${rgb},.35), transparent)`,
            filter: 'blur(40px)',
          }}
        />

        {/* Espaço único com todos os vencedores */}
        <div
          className="flex-1 w-full flex items-center justify-center z-10"
          style={{ padding: '32px 0' }}
        >
          <div
            className="w-full rounded-3xl flex flex-wrap items-start justify-center content-center"
            style={{
              minHeight: '520px',
              gap: '28px 12px',
              padding: '40px 24px',
              background: `linear-gradient(180deg, rgba(${rgb},.16), rgba(${rgb},.04))`,
              border: `2px solid rgba(${rgb},.45)`,
              boxShadow: '0 25px 60px -20px rgba(0,0,0,.6)',
            }}
          >
            {winners.map((p) => (
              <div key={p.id} className="flex flex-col items-center" style={{ width: `${av + 46}px` }}>
                {/* margem superior reserva espaço para a coroa ♛ do Arauto */}
                <div className="relative" style={{ marginTop: '30px' }}>
                  <div
                    className="rounded-full overflow-hidden flex items-center justify-center font-extrabold"
                    style={{
                      width: `${av}px`,
                      height: `${av}px`,
                      background: p.avatar_url ? '#0b1226' : TEAM_GRADIENT[team],
                      color: '#12131f',
                      fontSize: `${Math.round(av * 0.34)}px`,
                      border: '3px solid rgba(255,255,255,.35)',
                      boxShadow: p.is_arauto
                        ? `0 0 0 4px ${VW.gold}, 0 10px 24px rgba(0,0,0,.45)`
                        : '0 8px 20px rgba(0,0,0,.4)',
                    }}
                  >
                    {p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt={p.display_name}
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      initials(p.display_name)
                    )}
                  </div>
                  {p.is_arauto && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 leading-none"
                      style={{ top: `${-av * 0.3}px`, fontSize: `${Math.round(av * 0.32)}px`, color: VW.gold, textShadow: '0 2px 4px rgba(0,0,0,.7)' }}
                    >
                      ♛
                    </span>
                  )}
                </div>
                <p
                  className="font-black text-center leading-tight"
                  style={{ color: VW.ink, fontSize: '1.25rem', marginTop: '10px', maxWidth: `${av + 42}px`, textShadow: '0 2px 6px rgba(0,0,0,.5)' }}
                >
                  {shortNames.get(p.id) ?? p.display_name}
                </p>
                {p.is_arauto && (
                  <p className="font-bold uppercase" style={{ color: VW.gold, fontSize: '0.8rem', letterSpacing: '0.15em' }}>
                    Arauto
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Rodapé */}
        <p className={`${vwSerif.className} z-10`} style={{ color: accent, fontSize: '1.4rem' }}>
          Parabéns aos vencedores! 🎉
        </p>
        <p className="text-xs font-bold z-10" style={{ color: 'rgba(238,241,248,.35)', letterSpacing: '0.25em', marginTop: '10px' }}>
          CLUBE DE DESBRAVADORES DE ABRANTES
        </p>
      </div>
    )
  }
)

WinnersShareCard.displayName = 'WinnersShareCard'
