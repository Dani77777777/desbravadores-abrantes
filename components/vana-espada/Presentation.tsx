'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/utils/supabase/client'
import { Sword, Target, Users } from 'lucide-react'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { useWakeLock } from '@/components/vana-camp/useWakeLock'
import { closeRound } from '@/lib/actions/vana-espada'
import { bibleOnlineUrl } from '@/utils/bible-link'
import { getBook } from '@/utils/bible-books'
import {
  excerptFontSize, formatReference, toAnswerViews, toEspadaPlayer,
} from '@/utils/vana-espada'
import type { EspadaAnswerView, EspadaPlayer, EspadaSession } from '@/types/vana-espada'
import { BibleBar, type EspadaPin } from './BibleBar'
import { BookZoom } from './BookZoom'
import { Leaderboard } from './Leaderboard'
import { Podium } from './Podium'
import { useEspadaAudio } from './useEspadaAudio'
import { useCountdown, useEspadaSession, usePhaseWatchdog, useServerClock } from './useEspadaSession'

interface Props {
  sessionId: string
  initialSession: EspadaSession
  siteUrl: string
  serverNow: number
}

/** Os três tempos da revelação: mapa da Bíblia → zoom no livro → referência. */
const REVEAL_STAGE_MS = [7000, 6500]

export function Presentation({ sessionId, initialSession, siteUrl, serverNow }: Props) {
  const supabase = createClient()
  const { session, round } = useEspadaSession(sessionId, initialSession)
  const { now } = useServerClock(serverNow)
  useWakeLock()

  const [players, setPlayers] = useState<EspadaPlayer[]>([])
  const [reveal, setReveal] = useState<EspadaAnswerView[]>([])
  const [stage, setStage] = useState(0)
  const [qrZoomed, setQrZoomed] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(true)

  const { playSfx } = useEspadaAudio(session.status, musicEnabled)

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
      if (typeof payload?.musicEnabled === 'boolean') setMusicEnabled(payload.musicEnabled)
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, supabase])

  // ── Efeitos sonoros nas transições ───────────────────────────────
  const prevStatusRef = useRef(session.status)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = session.status

    if (prev === 'round_active' && session.status === 'round_reveal') playSfx('roundEnd')
    if (prev !== 'leaderboard' && session.status === 'leaderboard') {
      // Pequeno atraso para o som cair em cima da animação dos números.
      const t = setTimeout(() => playSfx('points'), 500)
      return () => clearTimeout(t)
    }
  }, [session.status, playSfx])

  // "Ploc" a cada resposta que entra — dá ritmo à contagem no projetor.
  const prevAnsweredRef = useRef(0)
  useEffect(() => {
    if (session.status !== 'round_active') {
      prevAnsweredRef.current = 0
      return
    }
    if (session.answeredCount > prevAnsweredRef.current) playSfx('answered')
    prevAnsweredRef.current = session.answeredCount
  }, [session.answeredCount, session.status, playSfx])

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

  // ── LOBBY ────────────────────────────────────────────────────────
  if (session.status === 'lobby') {
    return (
      <div className="h-[100dvh] w-screen overflow-hidden bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 flex flex-col">
        <div className="flex items-center justify-between px-10 pt-7">
          <div className="flex items-center gap-4">
            <img src="/images/VanaEspada.jpeg" alt="" className="w-14 h-14 object-contain rounded-xl drop-shadow-lg" />
            <div>
              <p className="text-white/50 text-xs font-bold uppercase tracking-[0.3em]">VanaEspada</p>
              <h1 className="text-white font-black text-3xl">Onde Está?</h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-white/10 rounded-2xl px-5 py-2.5 border border-white/15">
            <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-bold text-xl">
              {players.length} jogador{players.length !== 1 ? 'es' : ''}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center gap-10 px-10 py-8 max-w-7xl mx-auto w-full">
          {/* PIN + QR */}
          <div className="flex flex-col items-center gap-6 w-full max-w-md flex-shrink-0">
            <div className="w-full bg-white/10 backdrop-blur-sm rounded-3xl border border-white/20 p-8 text-center">
              <p className="text-amber-300 text-xs font-black uppercase tracking-[0.25em] mb-3">Entra com o PIN</p>
              <p className="text-7xl font-black text-white tracking-[0.12em] tabular-nums leading-none">{session.pin}</p>
              <p className="text-sky-300 text-sm mt-4">
                em <span className="text-white font-semibold">{siteUrl.replace(/^https?:\/\//, '')}/jogos/vana-espada</span>
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-2xl">
              <QRCodeSVG value={joinUrl} size={210} />
            </div>
          </div>

          {/* Jogadores na sala */}
          <div className="w-full max-w-md bg-white/10 backdrop-blur-sm rounded-3xl border border-white/20 p-6 flex flex-col self-stretch min-h-0">
            <p className="text-amber-300 text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 flex-shrink-0">
              <Users className="w-4 h-4" /> Jogadores na sala
            </p>
            <div className="flex-1 space-y-2 overflow-y-auto min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {players.length === 0 ? (
                <div className="text-center py-14">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <Sword className="w-7 h-7 text-amber-300" />
                  </div>
                  <p className="text-sky-300 text-lg">À espera de jogadores...</p>
                </div>
              ) : (
                players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5 animate-in slide-in-from-right-2 duration-300"
                  >
                    <PlayerAvatar
                      name={p.displayName}
                      avatarUrl={p.avatarUrl}
                      className="w-10 h-10"
                      textClassName="text-base"
                      fallbackBg="bg-amber-500/40"
                    />
                    <span className="text-white font-semibold text-lg flex-1 truncate">{p.displayName}</span>
                    {p.isGuest && (
                      <span className="text-[11px] text-sky-300 bg-sky-500/10 rounded-full px-2 py-0.5">convidado</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {qrZoomed && <QrZoomOverlay pin={session.pin} url={joinUrl} />}
      </div>
    )
  }

  // ── ENTRE RONDAS ─────────────────────────────────────────────────
  if (session.status === 'round_ready') {
    return (
      <Stage>
        <div className="relative flex flex-col items-center gap-6 text-center">
          <div
            className="absolute left-1/2 -top-40 w-[900px] h-[900px] -translate-x-1/2 opacity-50 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.22) 0%, transparent 62%)' }}
          />
          <Sword className="relative w-32 h-32 text-amber-300 animate-in zoom-in fade-in duration-700" />
          <p className="relative text-amber-300 font-black uppercase tracking-[0.35em] text-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            Ronda {session.currentRound + 1} de {session.totalRounds}
          </p>
          <p
            className="relative text-white font-black leading-none animate-in fade-in zoom-in-90 duration-700"
            style={{ fontSize: 'clamp(3rem, 9vw, 8rem)', animationDelay: '250ms', animationFillMode: 'backwards' }}
          >
            Onde Está?
          </p>
          <p
            className="relative text-sky-200 text-2xl font-bold animate-in fade-in duration-500"
            style={{ animationDelay: '700ms', animationFillMode: 'backwards' }}
          >
            Prepara a tua espada...
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
            <span className="text-white/70 font-bold text-2xl flex items-center gap-2 tabular-nums">
              <Users className="w-7 h-7" /> {session.answeredCount}/{players.length}
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center gap-8 min-h-0 px-6">
            <p
              className="text-white font-bold leading-tight italic"
              style={{ fontSize: excerptFontSize(excerpt) }}
            >
              &ldquo;{excerpt}&rdquo;
            </p>
            {round?.translation && (
              <p className="text-amber-300/70 font-black text-2xl uppercase tracking-[0.2em]">— {round.translation}</p>
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
    const answerBook = getBook(reference.bookId)
    const url = bibleOnlineUrl(formatReference(reference))

    const answered = reveal.filter((a) => a.answeredAt)
    const gotBook = answered.filter((a) => a.guessBook === reference.bookId)
    const gotChapter = gotBook.filter((a) => a.guessChapter === reference.chapter)
    const gotSection = answered.filter(
      (a) => a.guessBook !== reference.bookId &&
        getBook(a.guessBook ?? undefined)?.section === answerBook?.section
    )
    const best = [...answered].sort((a, b) => b.points - a.points).slice(0, 3)

    return (
      <Stage>
        <div className="w-full h-full flex flex-col justify-center gap-7">
          {stage === 0 && (
            <>
              <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-3xl text-center">
                Onde apostou cada um
              </p>
              <BibleBar pins={pins} answer={reference} />
              <div className="flex justify-center gap-4">
                <StatChip value={gotChapter.length} total={answered.length} label="capítulo certo" tone="gold" />
                <StatChip value={gotBook.length} total={answered.length} label="livro certo" tone="green" />
                <StatChip value={gotSection.length} total={answered.length} label="mesma secção" tone="dim" />
              </div>
            </>
          )}

          {stage === 1 && (
            <>
              <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-3xl text-center">
                {gotBook.length} de {answered.length} acertaram o livro
              </p>
              <BookZoom pins={pins} answer={reference} />
            </>
          )}

          {stage >= 2 && (
            <div className="flex items-center justify-between gap-12">
              <div className="min-w-0 flex-1">
                <p className="text-amber-300 font-black uppercase tracking-[0.3em] text-2xl mb-4">A resposta era</p>
                <p
                  className="text-white font-black leading-[0.95] tracking-tight"
                  style={{ fontSize: 'clamp(3.5rem, 8.5vw, 8.5rem)' }}
                >
                  {formatReference(reference)}
                </p>
                {round.excerpt && (
                  <p className="text-white/55 italic text-3xl mt-7 leading-snug max-w-4xl">
                    &ldquo;{round.excerpt}&rdquo;
                  </p>
                )}

                {best.length > 0 && best[0].points > 0 && (
                  <div className="flex items-center gap-4 mt-8">
                    <span className="text-white/40 font-black uppercase tracking-widest text-sm">Melhores</span>
                    {best.map((a, i) => (
                      <div key={a.playerId} className="flex items-center gap-2.5 bg-white/8 border border-white/15 rounded-2xl pl-1.5 pr-4 py-1.5">
                        <span className="text-2xl">{['🥇', '🥈', '🥉'][i]}</span>
                        <PlayerAvatar
                          name={a.displayName}
                          avatarUrl={a.avatarUrl}
                          className="w-10 h-10"
                          textClassName="text-base"
                          fallbackBg="bg-amber-500/40"
                        />
                        <span className="text-white font-bold text-xl">{a.displayName}</span>
                        <span className="text-amber-300 font-black text-xl tabular-nums">+{a.points}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {url && (
                <div className="text-center flex-shrink-0">
                  <div className="bg-white p-4 rounded-3xl shadow-2xl">
                    <QRCodeSVG value={url} size={230} />
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
  // `key` = ronda: cada classificação monta de novo e volta a contar desde o total
  // de antes da ronda. Espera pelos jogadores para a contagem ter de onde partir.
  if (session.status === 'leaderboard' && players.length > 0) {
    return <Leaderboard key={session.currentRound} players={players} />
  }

  // ── PÓDIO ────────────────────────────────────────────────────────
  if (session.status === 'finished' && players.length > 0) {
    return <Podium players={players} />
  }

  return <Stage><Sword className="w-24 h-24 text-amber-300 animate-pulse" /></Stage>
}

/** Contador da revelação: "12/30 · capítulo certo". */
function StatChip({
  value, total, label, tone,
}: {
  value: number
  total: number
  label: string
  tone: 'gold' | 'green' | 'dim'
}) {
  const styles = {
    gold: 'bg-amber-400/20 border-amber-400/40 text-amber-300',
    green: 'bg-green-500/15 border-green-400/30 text-green-300',
    dim: 'bg-white/5 border-white/15 text-white/60',
  }[tone]

  return (
    <div className={`flex items-baseline gap-3 rounded-2xl border px-6 py-3 ${styles}`}>
      <Target className="w-5 h-5 self-center" />
      <span className="font-black text-3xl tabular-nums">{value}</span>
      <span className="font-bold text-lg opacity-70">de {total}</span>
      <span className="font-black uppercase tracking-widest text-sm">{label}</span>
    </div>
  )
}

/** QR em ecrã inteiro, para quem está no fundo do salão. Comandado pelo controlo. */
function QrZoomOverlay({ pin, url }: { pin: string; url: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl p-10 shadow-2xl animate-in zoom-in-95 duration-500">
        <QRCodeSVG value={url} size={500} />
        <p className="text-center mt-6 text-5xl font-black text-gray-900 tabular-nums tracking-widest">{pin}</p>
        <p className="text-center text-gray-500 text-lg mt-2">Lê o código ou usa o PIN</p>
      </div>
    </div>
  )
}

/** Palco 16:9 do projetor: sem navbar, fundo escuro, margens generosas. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-[100dvh] overflow-hidden bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 flex items-center justify-center p-10">
      {children}
    </div>
  )
}
