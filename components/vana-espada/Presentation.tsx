'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import confetti from 'canvas-confetti'
import { createClient } from '@/utils/supabase/client'
import { ArrowDown, ArrowUp, Sword, Users } from 'lucide-react'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { useWakeLock } from '@/components/vana-camp/useWakeLock'
import { closeRound } from '@/lib/actions/vana-espada'
import { bibleOnlineUrl } from '@/utils/bible-link'
import {
  excerptFontSize, formatReference, toAnswerViews, toEspadaPlayer,
} from '@/utils/vana-espada'
import type { EspadaAnswerView, EspadaPlayer, EspadaSession } from '@/types/vana-espada'
import { BibleBar, type EspadaPin } from './BibleBar'
import { BookZoom } from './BookZoom'
import { useCountdown, useEspadaSession, usePhaseWatchdog, useServerClock } from './useEspadaSession'

interface Props {
  sessionId: string
  initialSession: EspadaSession
  siteUrl: string
  serverNow: number
}

/** Os três tempos da revelação: mapa da Bíblia → zoom no livro → referência. */
const REVEAL_STAGE_MS = [6500, 6500]

export function Presentation({ sessionId, initialSession, siteUrl, serverNow }: Props) {
  const supabase = createClient()
  const { session, round } = useEspadaSession(sessionId, initialSession)
  const { now } = useServerClock(serverNow)
  useWakeLock()

  const [players, setPlayers] = useState<EspadaPlayer[]>([])
  const [reveal, setReveal] = useState<EspadaAnswerView[]>([])
  const [stage, setStage] = useState(0)
  const [qrZoomed, setQrZoomed] = useState(false)

  const joinUrl = `${siteUrl}/jogos/vana-espada?pin=${session.pin}`

  const timeLeft = useCountdown(session.status === 'round_active' ? session.phaseEndsAt : null, now)

  // Rede de segurança: normalmente é o painel do anfitrião que avança, mas se o
  // portátil dele estiver bloqueado o projetor pede a transição 2 s depois. É
  // condicional na base de dados, por isso só uma das chamadas tem efeito.
  usePhaseWatchdog(
    session.phaseEndsAt,
    now,
    () => { void closeRound(sessionId, session.currentRound) },
    { enabled: session.status === 'round_active', graceMs: 2000 }
  )

  // ── Jogadores ────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => {
      supabase
        .from('vanaespada_players')
        .select('*')
        .eq('session_id', sessionId)
        .then(({ data }) => { if (data) setPlayers(data.map(toEspadaPlayer)) })
    }
    load()
    const channel = supabase
      .channel(`espada-present-players-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanaespada_players', filter: `session_id=eq.${sessionId}` }, load)
      .subscribe()
    const poll = setInterval(load, 4000)
    return () => { clearInterval(poll); supabase.removeChannel(channel) }
  }, [sessionId, supabase])

  // ── Comandos do painel de controlo ───────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`espada-present-${sessionId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'cmd' }, ({ payload }) => {
      if (typeof payload?.qrZoomed === 'boolean') setQrZoomed(payload.qrZoomed)
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, supabase])

  // ── Revelação: palpites de toda a gente (a BD só os serve agora) ──
  useEffect(() => {
    if (session.status !== 'round_reveal') {
      setReveal([])
      setStage(0)
      return
    }
    let cancelled = false
    supabase
      .rpc('get_vanaespada_reveal', { p_session_id: sessionId })
      .then(({ data }) => { if (!cancelled) setReveal(toAnswerViews(data)) })
    return () => { cancelled = true }
  }, [session.status, session.currentRound, sessionId, supabase])

  // Encadeia os três tempos da revelação.
  useEffect(() => {
    if (session.status !== 'round_reveal') return
    const timers = REVEAL_STAGE_MS.map((ms, i) =>
      setTimeout(() => setStage(i + 1), REVEAL_STAGE_MS.slice(0, i + 1).reduce((a, b) => a + b, 0))
    )
    return () => timers.forEach(clearTimeout)
  }, [session.status, session.currentRound])

  // ── Confettis no fim ─────────────────────────────────────────────
  const firedRef = useRef(false)
  useEffect(() => {
    if (session.status !== 'finished' || firedRef.current) return
    firedRef.current = true
    const end = Date.now() + 2500
    const tick = () => {
      confetti({ particleCount: 4, spread: 70, origin: { x: Math.random(), y: 0.2 }, colors: ['#FBBF24', '#0EA5E9', '#FFFFFF'] })
      if (Date.now() < end) requestAnimationFrame(tick)
    }
    tick()
  }, [session.status])

  const pins: EspadaPin[] = useMemo(
    () => reveal.map((a) => ({
      playerId: a.playerId,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      bookId: a.guessBook,
      chapter: a.guessChapter,
    })),
    [reveal]
  )

  const standings = useMemo(() => {
    const sorted = [...players].sort((a, b) => b.totalPoints - a.totalPoints)
    // A posição anterior sai dos pontos menos o que se ganhou nesta ronda.
    const before = [...players]
      .map((p) => ({ id: p.id, points: p.totalPoints - (p.lastRoundPoints ?? 0) }))
      .sort((a, b) => b.points - a.points)
    const previousRank = new Map(before.map((p, i) => [p.id, i]))
    return sorted.map((p, i) => ({
      player: p,
      position: i + 1,
      change: (previousRank.get(p.id) ?? i) - i,
    }))
  }, [players])

  // ── LOBBY ────────────────────────────────────────────────────────
  if (session.status === 'lobby') {
    return (
      <Stage>
        {qrZoomed ? (
          <div className="flex flex-col items-center gap-8">
            <div className="bg-white p-8 rounded-[2rem]">
              <QRCodeSVG value={joinUrl} size={520} />
            </div>
            <p className="text-white font-black text-6xl tabular-nums tracking-[0.15em]">{session.pin}</p>
          </div>
        ) : (
          <div className="w-full h-full grid grid-cols-[1fr_auto] gap-10 items-center">
            <div className="space-y-6">
              <img src="/images/VanaEspada.jpeg" alt="" className="h-40 object-contain" />
              <div>
                <p className="text-amber-300 text-2xl font-black uppercase tracking-[0.3em]">PIN do jogo</p>
                <p className="text-white font-black tabular-nums tracking-[0.12em] leading-none"
                   style={{ fontSize: 'clamp(4rem, 12vw, 11rem)' }}>
                  {session.pin}
                </p>
                <p className="text-sky-300 text-2xl font-bold mt-2">
                  {siteUrl.replace(/^https?:\/\//, '')}/jogos/vana-espada
                </p>
              </div>

              <div>
                <p className="text-white/60 text-xl font-bold flex items-center gap-2 mb-3">
                  <Users className="w-6 h-6" /> {players.length} a jogar
                </p>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-hidden">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 bg-white/10 rounded-full pl-1.5 pr-4 py-1.5 animate-in fade-in zoom-in duration-300">
                      <PlayerAvatar
                        name={p.displayName}
                        avatarUrl={p.avatarUrl}
                        className="w-9 h-9"
                        textClassName="text-sm"
                        fallbackBg="bg-amber-500/40"
                      />
                      <span className="text-white font-bold text-xl">{p.displayName}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl">
              <QRCodeSVG value={joinUrl} size={300} />
            </div>
          </div>
        )}
      </Stage>
    )
  }

  // ── ENTRE RONDAS ─────────────────────────────────────────────────
  if (session.status === 'round_ready') {
    return (
      <Stage>
        <div className="text-center space-y-4">
          <Sword className="w-28 h-28 text-amber-300 mx-auto animate-pulse" />
          <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-3xl">
            Ronda {session.currentRound + 1} de {session.totalRounds}
          </p>
          <p className="text-white font-black" style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}>
            Onde Está?
          </p>
        </div>
      </Stage>
    )
  }

  // ── A RESPONDER ──────────────────────────────────────────────────
  if (session.status === 'round_active') {
    const limit = round?.timeSeconds ?? 30
    const excerpt = round?.excerpt ?? ''
    return (
      <Stage>
        <div className="w-full h-full flex flex-col">
          <div className="flex items-center justify-between flex-shrink-0">
            <span className="text-amber-300 font-black uppercase tracking-[0.25em] text-xl">
              Ronda {session.currentRound + 1}/{session.totalRounds}
            </span>
            <span className="text-white/70 font-bold text-2xl flex items-center gap-2">
              <Users className="w-7 h-7" /> {session.answeredCount}/{players.length}
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 min-h-0 px-4">
            <p
              className="text-white font-bold leading-tight italic"
              style={{ fontSize: excerptFontSize(excerpt) }}
            >
              &ldquo;{excerpt}&rdquo;
            </p>
            {round?.translation && (
              <p className="text-sky-300/70 font-black text-2xl uppercase tracking-widest">— {round.translation}</p>
            )}
          </div>

          <div className="flex-shrink-0 flex items-center gap-6">
            <span
              className={`font-black tabular-nums leading-none ${
                timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-white'
              }`}
              style={{ fontSize: 'clamp(3rem, 7vw, 6rem)' }}
            >
              {Math.ceil(timeLeft)}
            </span>
            <div className="flex-1 h-5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  timeLeft > limit * 0.5 ? 'bg-green-400' : timeLeft > limit * 0.25 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${Math.min(100, (timeLeft / limit) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </Stage>
    )
  }

  // ── REVELAÇÃO ────────────────────────────────────────────────────
  if (session.status === 'round_reveal' && round?.reference) {
    const reference = round.reference
    const url = bibleOnlineUrl(formatReference(reference))
    const gotBook = reveal.filter((a) => a.guessBook === reference.bookId).length

    return (
      <Stage>
        <div className="w-full h-full flex flex-col justify-center gap-8">
          {stage === 0 && (
            <>
              <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-2xl text-center">
                Onde apostou cada um
              </p>
              <BibleBar pins={pins} answer={reference} />
            </>
          )}

          {stage === 1 && (
            <>
              <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-2xl text-center">
                {gotBook} de {reveal.length} acertaram o livro
              </p>
              <BookZoom pins={pins} answer={reference} />
            </>
          )}

          {stage >= 2 && (
            <div className="flex items-center justify-between gap-12">
              <div className="min-w-0">
                <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-2xl mb-3">A resposta era</p>
                <p
                  className="text-white font-black leading-none"
                  style={{ fontSize: 'clamp(3.5rem, 9vw, 9rem)' }}
                >
                  {formatReference(reference)}
                </p>
                {round.excerpt && (
                  <p className="text-white/60 italic text-3xl mt-6 leading-snug max-w-4xl">
                    &ldquo;{round.excerpt}&rdquo;
                  </p>
                )}
              </div>
              {url && (
                <div className="text-center flex-shrink-0">
                  <div className="bg-white p-4 rounded-3xl">
                    <QRCodeSVG value={url} size={220} />
                  </div>
                  <p className="text-white/50 font-bold text-lg mt-3">Lê o contexto</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Stage>
    )
  }

  // ── CLASSIFICAÇÃO ────────────────────────────────────────────────
  if (session.status === 'leaderboard') {
    return (
      <Stage>
        <div className="w-full h-full flex flex-col">
          <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-2xl text-center mb-6 flex-shrink-0">
            Classificação
          </p>
          <div className="flex-1 flex flex-col justify-center gap-3 min-h-0">
            {standings.slice(0, 5).map(({ player, position, change }) => (
              <div
                key={player.id}
                className={`flex items-center gap-5 rounded-2xl px-6 py-4 border ${
                  position === 1 ? 'bg-amber-400/20 border-amber-400/40' : 'bg-white/5 border-white/10'
                }`}
              >
                <span className="text-4xl font-black text-white/50 tabular-nums w-14">{position}º</span>
                <ChangeArrow change={change} />
                <PlayerAvatar
                  name={player.displayName}
                  avatarUrl={player.avatarUrl}
                  className="w-16 h-16"
                  textClassName="text-2xl"
                  fallbackBg="bg-amber-500/40"
                />
                <span className="text-white font-black text-4xl flex-1 truncate">{player.displayName}</span>
                {player.lastRoundPoints != null && player.lastRoundPoints > 0 && (
                  <span className="text-green-400 font-black text-2xl tabular-nums">+{player.lastRoundPoints}</span>
                )}
                <span className="text-amber-300 font-black text-5xl tabular-nums">{player.totalPoints}</span>
              </div>
            ))}
          </div>
          {players.length > 5 && (
            <p className="text-white/30 text-center text-xl font-bold flex-shrink-0">
              e mais {players.length - 5} a jogar
            </p>
          )}
        </div>
      </Stage>
    )
  }

  // ── PÓDIO ────────────────────────────────────────────────────────
  if (session.status === 'finished') {
    const podium = standings.slice(0, 3)
    const order = [1, 0, 2] // 2.º, 1.º, 3.º — o vencedor ao centro
    const heights = ['h-52', 'h-72', 'h-40']

    return (
      <Stage>
        <div className="w-full h-full flex flex-col items-center justify-center gap-8">
          <p className="text-white font-black" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
            🏆 Pódio final
          </p>
          <div className="flex items-end justify-center gap-6">
            {order.map((idx, i) => {
              const entry = podium[idx]
              if (!entry) return null
              return (
                <div key={entry.player.id} className="flex flex-col items-center gap-3">
                  <PlayerAvatar
                    name={entry.player.displayName}
                    avatarUrl={entry.player.avatarUrl}
                    className={idx === 0 ? 'w-32 h-32 ring-4 ring-amber-300' : 'w-24 h-24 ring-2 ring-white/40'}
                    textClassName={idx === 0 ? 'text-4xl' : 'text-3xl'}
                    fallbackBg="bg-amber-500/40"
                  />
                  <p className="text-white font-black text-3xl">{entry.player.displayName}</p>
                  <p className="text-amber-300 font-black text-4xl tabular-nums">{entry.player.totalPoints}</p>
                  <div
                    className={`${heights[i]} w-44 rounded-t-2xl flex items-start justify-center pt-3 ${
                      idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-300' : 'bg-amber-700'
                    }`}
                  >
                    <span className="text-5xl">{['🥇', '🥈', '🥉'][idx]}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Stage>
    )
  }

  return <Stage><Sword className="w-24 h-24 text-amber-300 animate-pulse" /></Stage>
}

function ChangeArrow({ change }: { change: number }) {
  if (change === 0) return <span className="w-10 text-white/20 text-2xl text-center">—</span>
  const up = change > 0
  return (
    <span className={`w-10 flex items-center gap-0.5 font-black text-xl ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
      {Math.abs(change)}
    </span>
  )
}

/** Palco 16:9 do projetor: sem navbar, fundo escuro, margens generosas. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-[100dvh] overflow-hidden bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex items-center justify-center p-10">
      {children}
    </div>
  )
}
