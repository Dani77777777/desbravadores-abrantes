'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, ImageOff, Share2, Sparkles } from 'lucide-react'
import { displayFont } from '@/components/landing/fonts'
import { getCoroShareRounds, type CoroShareRound } from '@/lib/actions/vana-coro-game'
import { teamName } from './useCoroLive'
import type { VanaCoroPlayer, VanaCoroSession, VanaCoroTeam } from '@/types/vana-coro'

/**
 * Imagem dos vencedores para partilhar no grupo (1080×1080), como no VanaQuest e no
 * VanaSketch: a equipa vencedora com os nomes, o resultado e o quadro da melhor
 * ronda (a que deu mais pontos; dá para trocar com ‹ ›).
 */

const COLORS: Record<VanaCoroTeam, { main: string; soft: string; glow: string }> = {
  a: { main: '#38bdf8', soft: 'rgba(56,189,248,.16)', glow: 'rgba(56,189,248,.55)' },
  b: { main: '#fb7185', soft: 'rgba(251,113,133,.16)', glow: 'rgba(251,113,133,.55)' },
}
const GOLD = '#fcd34d'

interface Props {
  session: VanaCoroSession
  players: VanaCoroPlayer[]
}

export function WinnersShare({ session, players }: Props) {
  const [rounds, setRounds] = useState<CoroShareRound[] | null>(null)
  const [index, setIndex] = useState(0)
  const [sharing, setSharing] = useState(false)
  const [note, setNote] = useState<{ msg: string; ok: boolean } | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    getCoroShareRounds(session.id).then((r) => {
      if (cancelled) return
      // A melhor ronda primeiro (a que deu mais pontos), depois pela ordem do jogo
      const best = [...r].sort((x, y) => y.banked - x.banked)[0]
      setRounds(best ? [best, ...r.filter((x) => x !== best)] : [])
    })
    return () => {
      cancelled = true
    }
  }, [session.id])

  const round = rounds?.[index] ?? null
  const scores = { a: session.team_a_score, b: session.team_b_score }
  const winner: VanaCoroTeam | null = scores.a === scores.b ? null : scores.a > scores.b ? 'a' : 'b'
  const date = new Date(session.ended_at ?? session.created_at).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  async function share() {
    if (sharing) return
    setSharing(true)
    setNote(null)
    try {
      const { toPng } = await import('html-to-image')
      const node = cardRef.current
      if (!node) throw new Error('Cartão não pronto')
      // Com fontes web, a primeira captura às vezes falha: tenta até 3 vezes
      let dataUrl: string | null = null
      for (let attempt = 0; attempt < 3 && !dataUrl; attempt++) {
        try {
          dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: '#2e1065' })
        } catch (err) {
          if (attempt === 2) throw err
          await new Promise((r) => setTimeout(r, 400))
        }
      }
      if (!dataUrl) throw new Error('Falha ao gerar a imagem')

      const text = [
        `🎤 VanaCoro — ${date}`,
        '',
        winner
          ? `🏆 Ganhou a ${teamName(session, winner)} com ${scores[winner]} pontos!`
          : `🤝 Empate! ${scores.a} pontos para cada equipa!`,
        `${session.team_a_name} ${scores.a} · ${scores.b} ${session.team_b_name}`,
        round ? `\nA melhor ronda: «${round.prompt}» (+${round.banked})` : '',
        '',
        'O que é que o JA disse? Vem ao próximo e descobre! 🎤',
      ].join('\n')
      const fileName = `vanacoro-${date.replace(/\s+/g, '-')}-${Date.now()}.png`

      // Partilha nativa (telemóvel / desktop moderno); senão, descarrega
      try {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: '🏆 VanaCoro — os vencedores', text })
          setNote({ msg: 'Partilhado!', ok: true })
          return
        }
      } catch {
        /* cancelado ou sem suporte: descarrega */
      }
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = fileName
      link.click()
      setNote({ msg: 'Imagem transferida!', ok: true })
    } catch (err) {
      console.error('[WinnersShare]', err)
      setNote({ msg: 'Erro ao gerar a imagem. Tenta outra vez.', ok: false })
    } finally {
      setSharing(false)
      setTimeout(() => setNote(null), 4000)
    }
  }

  const card = (ref?: React.Ref<HTMLDivElement>) => (
    <WinnersCard ref={ref} session={session} players={players} winner={winner} round={round} date={date} />
  )

  return (
    <section className="space-y-3 rounded-2xl bg-white/5 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Sparkles className="h-5 w-5 text-fuchsia-300" /> Imagem dos vencedores
      </h2>

      {/* Pré-visualização (o cartão a 30 %) */}
      <div className="relative mx-auto overflow-hidden rounded-2xl shadow-2xl" style={{ width: 324, height: 324 }}>
        <div style={{ transform: 'scale(0.3)', transformOrigin: 'top left' }}>{card()}</div>
        {rounds && rounds.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + rounds.length) % rounds.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
              title="Ronda anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % rounds.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
              title="Ronda seguinte"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      {round && (
        <p className="text-center text-xs text-white/50">
          {index === 0 ? 'A melhor ronda' : `Ronda ${round.roundNumber}`} · usa ‹ › para mostrar outra ronda na imagem
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={share}
          disabled={sharing || rounds === null}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-amber-400 px-5 py-2.5 font-bold text-purple-950 disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" /> {sharing ? 'A gerar a imagem…' : 'Partilhar a imagem'}
        </button>
        {note && (
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${note.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {note.ok ? <Download className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />} {note.msg}
          </span>
        )}
      </div>

      {/* Cartão em tamanho real, fora do ecrã, para a captura */}
      <div style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
        {card(cardRef)}
      </div>
    </section>
  )
}

interface CardProps {
  session: VanaCoroSession
  players: VanaCoroPlayer[]
  winner: VanaCoroTeam | null
  round: CoroShareRound | null
  date: string
}

const WinnersCard = forwardRef<HTMLDivElement, CardProps>(({ session, players, winner, round, date }, ref) => {
  const scores = { a: session.team_a_score, b: session.team_b_score }
  const lead: VanaCoroTeam = winner ?? 'a'
  const featured = winner ? [winner] : (['a', 'b'] as VanaCoroTeam[])
  const names = (t: VanaCoroTeam) => players.filter((p) => p.team === t && !p.is_bot).map((p) => p.display_name)
  const winnerNames = featured.flatMap(names)
  const shownNames = winnerNames.slice(0, 12)
  const accent = winner ? COLORS[winner] : { main: GOLD, soft: 'rgba(252,211,77,.14)', glow: 'rgba(252,211,77,.5)' }

  return (
    <div
      ref={ref}
      className="relative flex flex-col overflow-hidden text-white"
      style={{
        width: 1080,
        height: 1080,
        padding: '48px 60px 0',
        background:
          'radial-gradient(60% 45% at 50% 30%, rgba(236,72,153,.35), transparent 70%), radial-gradient(50% 50% at 90% 100%, rgba(99,102,241,.45), transparent 70%), linear-gradient(160deg, #701a75 0%, #3b0764 55%, #1e1b4b 100%)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Brilhos de fundo */}
      {[
        [90, 170, 6],
        [980, 120, 8],
        [940, 520, 5],
        [60, 620, 7],
        [520, 60, 5],
        [1010, 860, 6],
      ].map(([x, y, s], i) => (
        <span
          key={i}
          style={{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: 999, background: '#fff', boxShadow: '0 0 18px 6px rgba(255,255,255,.55)', opacity: 0.8 }}
        />
      ))}

      {/* Cabeçalho */}
      <div className="flex items-center gap-5">
        <img src="/images/VanaCoro.png" alt="" style={{ width: 96, height: 96, borderRadius: 24, boxShadow: '0 10px 30px rgba(0,0,0,.4)' }} />
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.32em', color: 'rgba(255,255,255,.65)' }}>
            VANACORO · {date.toUpperCase()}
          </p>
          <p className={displayFont.className} style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.05, color: GOLD }}>
            O que é que o JA disse?
          </p>
        </div>
      </div>

      {/* Vencedores */}
      <div className="flex flex-col items-center text-center" style={{ marginTop: 34 }}>
        <p style={{ fontSize: 64, lineHeight: 1 }}>{winner ? '👑' : '🤝'}</p>
        <p
          className={displayFont.className}
          style={{
            marginTop: 6,
            fontSize: winner ? 84 : 72,
            fontWeight: 800,
            lineHeight: 1,
            color: accent.main,
            textShadow: `0 0 40px ${accent.glow}`,
            maxWidth: 960,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {winner ? teamName(session, winner) : 'Empate!'}
        </p>
        <p style={{ marginTop: 10, fontSize: 30, fontWeight: 800 }}>
          {winner ? `venceu com ${scores[winner]} pontos!` : `${scores.a} pontos para cada equipa`}
        </p>

        {/* Resultado */}
        <div className="flex items-center" style={{ marginTop: 18, gap: 18, fontSize: 26, fontWeight: 800 }}>
          {(['a', 'b'] as VanaCoroTeam[]).map((t, i) => (
            <span key={t} className="flex items-center" style={{ gap: 18 }}>
              {i === 1 && <span style={{ color: 'rgba(255,255,255,.4)' }}>·</span>}
              <span
                style={{
                  padding: '8px 22px',
                  borderRadius: 999,
                  background: COLORS[t].soft,
                  border: `2px solid ${t === lead || !winner ? COLORS[t].main : 'transparent'}`,
                  opacity: winner && winner !== t ? 0.7 : 1,
                }}
              >
                <span style={{ color: COLORS[t].main }}>{teamName(session, t)}</span>{' '}
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{scores[t]}</span>
              </span>
            </span>
          ))}
        </div>

        {/* Nomes */}
        {shownNames.length > 0 && (
          <div className="flex flex-wrap justify-center" style={{ marginTop: 22, gap: 10, maxWidth: 940 }}>
            {shownNames.map((n, i) => (
              <span
                key={`${n}-${i}`}
                style={{ padding: '6px 16px', borderRadius: 999, background: 'rgba(255,255,255,.12)', fontSize: 22, fontWeight: 700 }}
              >
                {n}
              </span>
            ))}
            {winnerNames.length > shownNames.length && (
              <span style={{ padding: '6px 16px', fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>
                +{winnerNames.length - shownNames.length}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quadro da melhor ronda */}
      {round && (
        <div
          style={{
            marginTop: 'auto',
            marginBottom: 108,
            padding: '22px 28px',
            borderRadius: 28,
            background: 'rgba(0,0,0,.28)',
            border: '1px solid rgba(255,255,255,.12)',
          }}
        >
          <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
            <p style={{ fontSize: 24, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              «{round.prompt.replace(/^\[Teste\]\s*/, '')}»
            </p>
            {round.winner && (
              <p style={{ flexShrink: 0, fontSize: 20, fontWeight: 800, color: COLORS[round.winner].main }}>
                +{round.banked}
                {round.multiplier > 1 ? ' (×2)' : ''} {teamName(session, round.winner)}
              </p>
            )}
          </div>
          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            {round.entries.map((e) => (
              <div
                key={e.rank}
                className="flex items-center"
                style={{
                  height: 46,
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: 'linear-gradient(90deg, #fcd34d, #fde68a 60%, #fbbf24)',
                  color: '#3b0764',
                }}
              >
                <span style={{ width: 54, textAlign: 'center', fontSize: 24 }}>{e.emoji}</span>
                <span style={{ flex: 1, fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                  {e.label}
                </span>
                <span
                  style={{
                    width: 76,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#3b0764',
                    color: GOLD,
                    fontSize: 24,
                    fontWeight: 900,
                  }}
                >
                  {e.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between"
        style={{ padding: '24px 60px', background: 'rgba(0,0,0,.25)', borderTop: '1px solid rgba(255,255,255,.12)' }}
      >
        <p style={{ fontSize: 24, fontWeight: 800, color: GOLD }}>🎤 Desbravadores de Abrantes</p>
        <p style={{ fontSize: 22, fontWeight: 700 }}>Vem ao próximo JA! 🙌</p>
      </div>
    </div>
  )
})
WinnersCard.displayName = 'WinnersCard'
