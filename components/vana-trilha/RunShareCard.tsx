'use client'

import { forwardRef } from 'react'
import Pawn from './Pawn'
import { dailyBoard, formatDuration } from '@/utils/vana-trilha'
import { TILE_EMOJI } from '@/utils/vana-trilha-labels'
import {
  VANATRILHA_DAILY_LENGTH,
  VANATRILHA_DAILY_LIVES,
  type VanaTrilhaDailyRun,
  type VanaTrilhaHistoryEntry,
  type VanaTrilhaRewards,
  type VanaTrilhaStation,
} from '@/types/vana-trilha'

interface Props {
  run: VanaTrilhaDailyRun
  station: VanaTrilhaStation
  rewards: VanaTrilhaRewards | null
  playerName: string | null
  /** Ex.: "desbravadores-abrantes.vercel.app" */
  siteHost: string
}

const NAVY = '#1E3A5F'
const CREAM = '#FFF7E6'

/** Mensagem de desafio para os outros desbravadores, conforme o resultado. */
export function shareChallenge(run: VanaTrilhaDailyRun): { headline: string; challenge: string } {
  const perfect = run.status === 'completed' && run.mistakes === 0
  if (perfect) {
    return {
      headline: 'Jornada Perfeita!',
      challenge: 'Sem nenhum erro! Achas que consegues igualar? 👑',
    }
  }
  if (run.status === 'completed') {
    return {
      headline: 'Etapa completa!',
      challenge: 'Cheguei à Terra Prometida de hoje. E tu, consegues fazer melhor? 💪',
    }
  }
  return {
    headline: `Cheguei à casa ${run.position} de ${VANATRILHA_DAILY_LENGTH}`,
    challenge: 'Hoje a etapa foi difícil… Consegues chegar mais longe do que eu? 🔥',
  }
}

function squareColor(h: VanaTrilhaHistoryEntry): { bg: string; label: string } {
  if (h.kind === 'bonus') return h.correct ? { bg: '#8B5CF6', label: '📜' } : { bg: '#CBD5E1', label: '📜' }
  if (h.correct) return { bg: '#22C55E', label: '✓' }
  return h.protected ? { bg: '#EAB308', label: '🌴' } : { bg: '#EF4444', label: '✗' }
}

function formatRunDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

/**
 * Cartão 1080×1350 (retrato, lê-se bem no WhatsApp) com o resultado do dia,
 * pronto para ser capturado com html-to-image. Estilos inline para a captura
 * sair igual em todos os telemóveis.
 */
export const RunShareCard = forwardRef<HTMLDivElement, Props>(
  ({ run, station, rewards, playerName, siteHost }, ref) => {
    const completed = run.status === 'completed'
    const perfect = completed && run.mistakes === 0
    const { headline, challenge } = shareChallenge(run)
    const tiles = dailyBoard(station.id)
    const durationMs = run.finished_at
      ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
      : null
    const name = playerName?.trim() || 'Um desbravador'
    const nodeSize = 84
    const trackWidth = 920
    const step = (trackWidth - nodeSize) / VANATRILHA_DAILY_LENGTH
    const pawnLeft = Math.min(run.position, VANATRILHA_DAILY_LENGTH) * step + nodeSize / 2

    return (
      <div
        ref={ref}
        style={{
          width: '1080px',
          height: '1350px',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'inherit',
          color: CREAM,
          background: `linear-gradient(180deg, #0F1E36 0%, ${NAVY} 36%, #7A4A3A 56%, #E9A94B 66%, #EFD29A 66.1%, #F7E6BF 100%)`,
        }}
      >
        {/* estrelas */}
        {Array.from({ length: 70 }, (_, i) => {
          const x = (i * 157.3) % 1080
          const y = (i * 97.7) % 760
          const r = 1.5 + ((i * 7) % 3)
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x}px`,
                top: `${y}px`,
                width: `${r}px`,
                height: `${r}px`,
                borderRadius: '50%',
                background: CREAM,
                opacity: 0.3 + ((i * 13) % 7) / 10,
              }}
            />
          )
        })}

        {/* brilho dourado da Terra Prometida */}
        <div
          style={{
            position: 'absolute',
            right: '-160px',
            top: '640px',
            width: '560px',
            height: '380px',
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(253,230,138,0.85), rgba(253,230,138,0))',
          }}
        />

        {/* conteúdo em coluna: nada se sobrepõe, seja qual for o resultado */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            padding: '56px 60px 56px',
          }}
        >
        {/* cabeçalho */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
            <img
              src="/images/VanaTrilha.png"
              alt=""
              crossOrigin="anonymous"
              style={{ width: '120px', height: '120px', objectFit: 'contain', borderRadius: '28px', background: CREAM }}
            />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '76px', fontWeight: 900, lineHeight: 1, color: '#FCD34D', letterSpacing: '-1px' }}>
                VanaTrilha
              </div>
              <div style={{ fontSize: '30px', fontWeight: 700, marginTop: '8px', opacity: 0.9 }}>
                A Rota da Promessa · {formatRunDate(run.run_date)}
              </div>
            </div>
          </div>
        </div>

        {/* resultado */}
        <div style={{ marginTop: '52px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-block',
              padding: '10px 26px',
              borderRadius: '999px',
              background: 'rgba(255,247,230,0.14)',
              border: '2px solid rgba(255,247,230,0.3)',
              fontSize: '28px',
              fontWeight: 700,
            }}
          >
            Etapa {station.id} · {station.name}
          </div>
          <div style={{ fontSize: '40px', fontWeight: 700, marginTop: '30px', opacity: 0.95 }}>{name}</div>
          <div
            style={{
              fontSize: perfect ? '104px' : completed ? '96px' : '72px',
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: '6px',
              color: completed ? '#FDE68A' : CREAM,
              textShadow: '0 6px 24px rgba(0,0,0,0.35)',
            }}
          >
            {perfect ? '👑 ' : completed ? '🏁 ' : '🚩 '}
            {headline}
          </div>

          {/* respostas */}
          {run.history.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '34px' }}>
              {run.history.map((h, i) => {
                const sq = squareColor(h)
                return (
                  <div
                    key={i}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      background: sq.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      fontWeight: 900,
                      color: '#fff',
                      boxShadow: '0 6px 14px rgba(0,0,0,0.3)',
                    }}
                  >
                    {sq.label}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* trilha */}
        <div style={{ position: 'relative', alignSelf: 'center', width: `${trackWidth}px`, height: '180px', flexShrink: 0 }}>
          <div
            style={{
              position: 'absolute',
              left: `${nodeSize / 2}px`,
              right: `${nodeSize / 2}px`,
              top: `${130 - 14}px`,
              height: '28px',
              borderRadius: '14px',
              background: '#C08A45',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${nodeSize / 2}px`,
              width: `${Math.min(run.position, VANATRILHA_DAILY_LENGTH) * step}px`,
              top: `${130 - 14}px`,
              height: '28px',
              borderRadius: '14px',
              background: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
            }}
          />
          {tiles.map((tile, i) => {
            const reached = i <= run.position
            const isEnd = i === VANATRILHA_DAILY_LENGTH
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${i * step}px`,
                  top: `${130 - nodeSize / 2}px`,
                  width: `${nodeSize}px`,
                  height: `${nodeSize}px`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  fontWeight: 900,
                  background: isEnd ? (reached ? '#FBBF24' : '#FEF3C7') : reached ? '#F59E0B' : CREAM,
                  color: reached ? '#fff' : '#B45309',
                  border: `6px solid ${reached ? '#fff' : '#B45309'}`,
                  boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
                }}
              >
                {i === 0 ? '⛺' : isEnd ? '🏁' : tile !== 'normal' ? TILE_EMOJI[tile] : i}
              </div>
            )
          })}
          <div style={{ position: 'absolute', left: `${pawnLeft - 45}px`, top: '-12px', width: '90px', height: '108px' }}>
            <Pawn className="h-full w-full" />
          </div>
        </div>

        {/* estatísticas */}
        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            justifyContent: 'center',
            gap: '18px',
            color: NAVY,
            padding: '0 20px',
          }}
        >
          {[
            { big: `${run.correct_count}`, small: 'certas' },
            {
              big: `${'❤️'.repeat(run.lives)}${'🤍'.repeat(Math.max(0, VANATRILHA_DAILY_LIVES - run.lives))}`,
              small: 'vidas',
            },
            ...(durationMs !== null ? [{ big: formatDuration(durationMs), small: 'tempo' }] : []),
            ...(completed && rewards ? [{ big: `+${rewards.xp} XP`, small: `+${rewards.gold} Gold` }] : []),
          ].map((s) => (
            <div
              key={s.small}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.85)',
                borderRadius: '28px',
                padding: '18px 10px',
                textAlign: 'center',
                boxShadow: '0 10px 24px rgba(120,53,15,0.15)',
              }}
            >
              <div style={{ fontSize: '40px', fontWeight: 900, lineHeight: 1.1 }}>{s.big}</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#92400E' }}>{s.small}</div>
            </div>
          ))}
        </div>

        {/* desafio aos outros desbravadores */}
        <div
          style={{
            marginTop: '32px',
            borderRadius: '40px',
            padding: '30px 36px',
            background: NAVY,
            color: CREAM,
            textAlign: 'center',
            boxShadow: '0 20px 40px rgba(30,58,95,0.35)',
          }}
        >
          <div style={{ fontSize: '42px', fontWeight: 900, lineHeight: 1.15 }}>{challenge}</div>
          <div style={{ fontSize: '26px', fontWeight: 600, marginTop: '14px', color: '#FCD34D', whiteSpace: 'nowrap' }}>
            Joga hoje em {siteHost}/jogos/vana-trilha
          </div>
        </div>
        </div>
      </div>
    )
  },
)

RunShareCard.displayName = 'RunShareCard'
