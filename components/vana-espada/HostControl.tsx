'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/utils/supabase/client'
import {
  AlertTriangle, Check, CheckCircle2, ChevronRight, Clock, Copy, Eye, Gift,
  Maximize2, MonitorPlay, Play, Trophy, UserX, Users, Volume2, VolumeX,
} from 'lucide-react'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { useWakeLock } from '@/components/vana-camp/useWakeLock'
import {
  advanceAfterReveal, awardSessionPoints, beginRound, closeRound,
  kickPlayer, nextRound, startGame,
} from '@/lib/actions/vana-espada'
import {
  calcEspadaRewards, formatGuess, formatReference, toAnswerViews, toEspadaPlayer,
} from '@/utils/vana-espada'
import { ESPADA_STATUS_LABELS } from '@/utils/vana-espada-labels'
import { getBook } from '@/utils/bible-books'
import type { EspadaAnswerView, EspadaPlayer, EspadaSession } from '@/types/vana-espada'
import { useCountdown, useEspadaSession, usePhaseWatchdog, useServerClock } from './useEspadaSession'

/** Ronda do snapshot, com a resposta — só chega ao anfitrião (a página é protegida). */
export interface HostRound {
  round_index: number
  book_id: number
  chapter: number
  verse_start: number
  verse_end: number
  excerpt: string | null
  translation: string | null
  time_seconds: number
}

interface Props {
  sessionId: string
  initialSession: EspadaSession
  rounds: HostRound[]
  siteUrl: string
  serverNow: number
}

const NEXT_LABEL: Record<string, string> = {
  lobby: 'Iniciar jogo',
  round_ready: 'Começar já',
  round_active: 'Revelar já',
  round_reveal: 'Mostrar classificação',
  leaderboard: 'Próxima ronda',
}

export function HostControl({ sessionId, initialSession, rounds, siteUrl, serverNow }: Props) {
  const supabase = createClient()
  const { session } = useEspadaSession(sessionId, initialSession)
  const { now } = useServerClock(serverNow)
  useWakeLock()

  const [players, setPlayers] = useState<EspadaPlayer[]>([])
  const [answers, setAnswers] = useState<EspadaAnswerView[]>([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrZoomed, setQrZoomed] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const [kickTarget, setKickTarget] = useState<EspadaPlayer | null>(null)
  const [awarding, setAwarding] = useState(false)
  const [awarded, setAwarded] = useState(!!initialSession.pointsAwardedAt)
  const [showAwardConfirm, setShowAwardConfirm] = useState(false)
  const [error, setError] = useState('')

  const inFlight = useRef(false)
  const broadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const currentRound = session.currentRound >= 0 ? rounds[session.currentRound] : null
  const joinUrl = `${siteUrl}/jogos/vana-espada?pin=${session.pin}`
  const presentUrl = `${siteUrl}/jogos/vana-espada/${sessionId}/present`

  // ── Canal de comandos para o projetor (QR ampliado, música) ──────
  useEffect(() => {
    const ch = supabase.channel(`espada-present-${sessionId}`, { config: { broadcast: { self: false } } })
    ch.subscribe()
    broadcastRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, supabase])

  useEffect(() => {
    broadcastRef.current?.send({ type: 'broadcast', event: 'cmd', payload: { qrZoomed } })
  }, [qrZoomed])

  // A música toca no projetor, não aqui: o anfitrião só decide se ela está ligada.
  useEffect(() => {
    broadcastRef.current?.send({ type: 'broadcast', event: 'cmd', payload: { musicEnabled } })
  }, [musicEnabled])

  // ── Jogadores (realtime + carregamento inicial) ──────────────────
  useEffect(() => {
    let cancelled = false
    supabase
      .from('vanaespada_players')
      .select('*')
      .eq('session_id', sessionId)
      .then(({ data }) => {
        if (!cancelled && data) setPlayers(data.map(toEspadaPlayer))
      })

    const channel = supabase
      .channel(`espada-control-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanaespada_players', filter: `session_id=eq.${sessionId}` },
        () => {
          supabase
            .from('vanaespada_players')
            .select('*')
            .eq('session_id', sessionId)
            .then(({ data }) => { if (data) setPlayers(data.map(toEspadaPlayer)) })
        })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [sessionId, supabase])

  // ── As respostas de cada um, ao vivo ─────────────────────────────
  // A tabela das respostas não vai para o realtime (senão os jogadores viam os
  // palpites uns dos outros), por isso o painel vai buscá-las pela RPC de
  // anfitrião — que a base de dados só serve a quem é dono da sessão.
  const fetchAnswers = useCallback(async () => {
    const { data } = await supabase.rpc('get_vanaespada_host_answers', { p_session_id: sessionId })
    setAnswers(toAnswerViews(data))
  }, [sessionId, supabase])

  useEffect(() => {
    if (session.currentRound < 0) {
      setAnswers([])
      return
    }
    fetchAnswers()
    if (session.status !== 'round_active') return
    const t = setInterval(fetchAnswers, 1500)
    return () => clearInterval(t)
  }, [fetchAnswers, session.status, session.currentRound])

  // ── Transições automáticas ───────────────────────────────────────
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setTimeout(() => { inFlight.current = false; setBusy(false) }, 300)
    }
  }, [])

  const readyLeft = useCountdown(session.status === 'round_ready' ? session.phaseEndsAt : null, now)
  const timeLeft = useCountdown(session.status === 'round_active' ? session.phaseEndsAt : null, now)

  // round_ready → round_active quando o aviso "Ronda X/Y" termina.
  usePhaseWatchdog(
    session.phaseEndsAt,
    now,
    () => { void beginRound(sessionId, session.currentRound) },
    { enabled: session.status === 'round_ready' }
  )

  // round_active → round_reveal quando o cronómetro chega a zero.
  usePhaseWatchdog(
    session.phaseEndsAt,
    now,
    () => { void closeRound(sessionId, session.currentRound) },
    { enabled: session.status === 'round_active' }
  )

  async function handleNext() {
    setError('')
    switch (session.status) {
      case 'lobby':
        return run(async () => {
          const res = await startGame(sessionId)
          if (!res.ok && res.error) setError(res.error)
        })
      case 'round_ready':
        return run(() => beginRound(sessionId, session.currentRound))
      case 'round_active':
        return run(() => closeRound(sessionId, session.currentRound, true))
      case 'round_reveal':
        // Na última ronda salta a classificação e vai direto ao pódio.
        return run(() => advanceAfterReveal(sessionId))
      case 'leaderboard':
        return run(() => nextRound(sessionId))
    }
  }

  async function handleAward() {
    setShowAwardConfirm(false)
    setAwarding(true)
    const res = await awardSessionPoints(sessionId)
    if (res.ok || res.alreadyAwarded) setAwarded(true)
    setAwarding(false)
  }

  async function handleKick() {
    if (!kickTarget) return
    const target = kickTarget
    setKickTarget(null)
    const res = await kickPlayer(sessionId, target.id)
    if (res.ok) setPlayers((prev) => prev.filter((p) => p.id !== target.id))
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  // ── Derivados ────────────────────────────────────────────────────
  const answered = answers.filter((a) => a.answeredAt)
  const pending = answers.filter((a) => !a.answeredAt)
  const sortedPlayers = [...players].sort((a, b) => b.totalPoints - a.totalPoints)

  const guests = players.filter((p) => p.isGuest)
  const guestsDecided = guests.filter((p) => p.rewardsRecipientId || p.rewardsSkipped).length
  const allGuestsDecided = guests.length === 0 || guestsDecided >= guests.length

  const isLastRound = session.currentRound >= session.totalRounds - 1
  // Como no VanaQuest: depois da última revelação não há classificação — o pódio é-a.
  const nextLabel =
    isLastRound && (session.status === 'round_reveal' || session.status === 'leaderboard')
      ? '🏆 Revelar pódio final'
      : NEXT_LABEL[session.status] ?? ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white">
      {/* Cabeçalho */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10 bg-black/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/images/VanaEspada.jpeg" alt="" className="w-7 h-7 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-amber-300 text-[10px] font-bold uppercase tracking-widest">Controlo</p>
              <p className="font-bold text-sm truncate">VanaEspada · Onde Está?</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setMusicEnabled((v) => !v)}
              title={musicEnabled ? 'Música ligada (carrega para desligar)' : 'Música desligada (carrega para ligar)'}
              className={`p-2 rounded-xl transition-colors ${
                musicEnabled
                  ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                  : 'bg-white/10 text-white/50 hover:bg-white/20'
              }`}
            >
              {musicEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <a
              href={presentUrl}
              target="_blank"
              rel="noopener"
              className="hidden sm:flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
            >
              <MonitorPlay className="w-3.5 h-3.5" /> Abrir apresentação
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold text-white/70">{ESPADA_STATUS_LABELS[session.status]}</span>
          {session.currentRound >= 0 && session.status !== 'finished' && (
            <span className="text-xs text-white/40 ml-auto tabular-nums">
              {session.currentRound + 1} / {session.totalRounds}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-md mx-auto pb-32">
        {error && (
          <div className="bg-red-500/20 border border-red-400/30 rounded-2xl px-4 py-3 text-red-200 text-sm font-semibold">
            {error}
          </div>
        )}

        {/* SALA DE ESPERA */}
        {session.status === 'lobby' && (
          <>
            <div className="bg-white/10 rounded-3xl p-5 text-center border border-white/10">
              <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.2em] mb-2">PIN do jogo</p>
              <p className="text-5xl font-black tracking-[0.15em] tabular-nums">{session.pin}</p>
              <p className="text-sky-400 text-xs mt-2">
                {siteUrl.replace(/^https?:\/\//, '')}/jogos/vana-espada
              </p>
            </div>

            <button
              onClick={copyLink}
              className={`w-full rounded-3xl p-4 flex items-center gap-3 shadow-lg active:scale-[0.98] transition-all ${
                copied ? 'bg-green-500 text-white' : 'bg-white/10 text-white border border-white/10 hover:bg-white/15'
              }`}
            >
              <div className={`p-2.5 rounded-xl flex-shrink-0 ${copied ? 'bg-white/20' : 'bg-amber-500/30'}`}>
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5 text-amber-200" />}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-bold text-sm">{copied ? 'Link copiado!' : 'Copiar link direto'}</p>
                <p className={`text-xs truncate ${copied ? 'text-white/70' : 'text-sky-400'}`}>
                  {joinUrl.replace(/^https?:\/\//, '')}
                </p>
              </div>
            </button>

            <button
              onClick={() => setQrZoomed((v) => !v)}
              className={`w-full rounded-3xl p-4 flex items-center gap-4 shadow-lg active:scale-[0.98] transition-all ${
                qrZoomed ? 'bg-amber-400 text-amber-900' : 'bg-white text-gray-900'
              }`}
            >
              <div className={`p-3 rounded-2xl ${qrZoomed ? 'bg-amber-900/10' : 'bg-gray-100'}`}>
                <Maximize2 className={`w-6 h-6 ${qrZoomed ? 'text-amber-900' : 'text-gray-700'}`} />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-sm">
                  {qrZoomed ? 'A mostrar QR Code grande' : 'Ampliar QR Code na apresentação'}
                </p>
                <p className={`text-xs ${qrZoomed ? 'text-amber-900/70' : 'text-gray-500'}`}>
                  {qrZoomed ? 'Toca para fechar' : 'Toca para ampliar no projetor'}
                </p>
              </div>
            </button>

            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-2xl">
                <QRCodeSVG value={joinUrl} size={140} />
              </div>
            </div>

            <div className="bg-white/10 rounded-3xl p-4 border border-white/10">
              <p className="text-amber-300 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> {players.length} jogador{players.length !== 1 ? 'es' : ''}
              </p>
              {players.length === 0 ? (
                <p className="text-sky-400 text-sm text-center py-4">À espera...</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                      <PlayerAvatar
                        name={p.displayName}
                        avatarUrl={p.avatarUrl}
                        className="w-6 h-6"
                        textClassName="text-[10px]"
                        fallbackBg="bg-amber-500/40"
                      />
                      <span className="text-sm font-semibold truncate flex-1">{p.displayName}</span>
                      {p.isGuest && (
                        <span className="text-[9px] text-sky-400 bg-sky-500/10 rounded-full px-1.5 py-0.5">conv.</span>
                      )}
                      <button
                        onClick={() => setKickTarget(p)}
                        title="Expulsar jogador"
                        className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ANTES DA RONDA — o texto chega ao anfitrião antes de ir ao projetor */}
        {session.status === 'round_ready' && currentRound && (
          <VerseCard
            round={currentRound}
            label={`A seguir · ronda ${session.currentRound + 1} de ${session.totalRounds}`}
            footer={
              <p className="text-white/40 text-xs">
                Vai lendo — aparece no projetor dentro de {Math.ceil(readyLeft)}s.
              </p>
            }
          />
        )}

        {/* DURANTE E DEPOIS DA RONDA */}
        {(session.status === 'round_active' || session.status === 'round_reveal') && currentRound && (
          <>
            <div className="bg-white/10 rounded-3xl p-4 border border-white/10 text-center">
              {session.status === 'round_active' ? (
                <>
                  <div className="text-5xl font-black tabular-nums">{Math.ceil(timeLeft)}</div>
                  <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-100 ${
                        timeLeft > currentRound.time_seconds * 0.5 ? 'bg-green-400'
                          : timeLeft > currentRound.time_seconds * 0.25 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(100, (timeLeft / currentRound.time_seconds) * 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-amber-300 font-black text-lg flex items-center justify-center gap-2">
                  <Eye className="w-5 h-5" /> Revelação no projetor
                </p>
              )}
              <p className="text-sky-300 text-xs mt-2 flex items-center justify-center gap-1.5">
                <Users className="w-3 h-3" /> {answered.length} / {players.length} responderam
              </p>
            </div>

            <VerseCard round={currentRound} label="Versículo desta ronda" />

            {/* ── O que cada um respondeu, ao vivo ── */}
            <div className="bg-white/10 rounded-3xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-amber-300 text-[10px] font-black uppercase tracking-widest">
                  Respostas dos jogadores
                </p>
                <span className="text-white/40 text-[10px] font-black tabular-nums">
                  {answered.length}/{answers.length}
                </span>
              </div>

              {answers.length === 0 ? (
                <p className="text-sky-400 text-sm text-center py-4">Ainda não há ninguém a jogar.</p>
              ) : (
                <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
                  {answered.map((a, i) => (
                    <AnswerRow
                      key={a.playerId}
                      answer={a}
                      order={i + 1}
                      revealed={session.status === 'round_reveal'}
                    />
                  ))}
                  {pending.map((a) => (
                    <div key={a.playerId} className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-white/5 border border-white/5 opacity-60">
                      <span className="w-5 text-center text-white/20 text-xs font-black">·</span>
                      <PlayerAvatar
                        name={a.displayName}
                        avatarUrl={a.avatarUrl}
                        className="w-7 h-7"
                        textClassName="text-[10px]"
                        fallbackBg="bg-white/10"
                      />
                      <span className="text-sm font-semibold truncate flex-1">{a.displayName}</span>
                      <span className="text-white/30 text-xs italic">
                        {session.status === 'round_active' ? 'a pensar...' : 'sem resposta'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* CLASSIFICAÇÃO */}
        {(session.status === 'leaderboard' || session.status === 'finished') && (
          <div className="bg-white/10 rounded-3xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <Trophy className="w-3 h-3" />
                {session.status === 'finished' ? 'Classificação final' : 'Classificação'}
              </p>
              <p className="text-white/40 text-[10px] font-bold">
                {players.length} jogador{players.length !== 1 ? 'es' : ''}
              </p>
            </div>

            {session.status === 'finished' && (
              <p className="text-sky-300/70 text-[11px] mb-2">
                Cada 10 pontos valem 1 Gold, e o XP é o dobro (4826 pts → 482🪙 + 964⭐).
              </p>
            )}

            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {sortedPlayers.map((p, i) => {
                const { gold, xp } = calcEspadaRewards(p.totalPoints)
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                      i === 0 ? 'bg-amber-400/15 border-amber-400/30'
                        : i === 1 ? 'bg-gray-300/10 border-gray-300/20'
                        : i === 2 ? 'bg-amber-700/15 border-amber-700/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <span className="w-7 text-center text-xl leading-none">
                      {i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-sm font-black text-white/40 tabular-nums">{i + 1}</span>}
                    </span>
                    <PlayerAvatar
                      name={p.displayName}
                      avatarUrl={p.avatarUrl}
                      className="w-9 h-9"
                      textClassName="text-xs"
                      fallbackBg="bg-amber-500/40"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-sm truncate">{p.displayName}</p>
                        {p.isGuest && (
                          <span className="text-[8px] uppercase tracking-wider text-sky-400 bg-sky-500/10 rounded-full px-1.5 py-0.5 flex-shrink-0">
                            conv.
                          </span>
                        )}
                      </div>
                      {session.status === 'finished' && gold > 0 && (
                        <p className="text-[10px] mt-0.5">
                          <span className="text-amber-300 font-bold">+{gold}🪙</span>
                          <span className="text-sky-300 font-bold ml-1">+{xp}⭐</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-lg tabular-nums leading-none">{p.totalPoints}</p>
                      {p.lastRoundPoints != null && session.status === 'leaderboard' && (
                        <p className={`text-[10px] font-black tabular-nums mt-0.5 ${p.lastRoundPoints > 0 ? 'text-green-400' : 'text-white/30'}`}>
                          {p.lastRoundPoints > 0 ? `+${p.lastRoundPoints}` : '—'}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Próxima ronda (pré-visualização para o anfitrião) */}
        {session.status === 'leaderboard' && !isLastRound && rounds[session.currentRound + 1] && (
          <div className="bg-white/5 rounded-3xl p-4 border border-white/10">
            <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">
              A seguir · ronda {session.currentRound + 2}/{session.totalRounds}
            </p>
            <p className="text-white font-black text-lg mt-1">
              {formatReference({
                bookId: rounds[session.currentRound + 1].book_id,
                chapter: rounds[session.currentRound + 1].chapter,
                verseStart: rounds[session.currentRound + 1].verse_start,
                verseEnd: rounds[session.currentRound + 1].verse_end,
              })}
            </p>
            <p className="text-white/40 text-xs mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {rounds[session.currentRound + 1].time_seconds}s
            </p>
          </div>
        )}

        {/* FIM — prémios */}
        {session.status === 'finished' && (
          <>
            {!awarded && guests.length > 0 && (
              <div className={`rounded-3xl p-4 border ${
                allGuestsDecided ? 'bg-green-500/15 border-green-400/30' : 'bg-amber-500/10 border-amber-400/30'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                    allGuestsDecided ? 'text-green-300' : 'text-amber-300'
                  }`}>
                    <Gift className="w-3.5 h-3.5" /> Destinatários dos convidados
                  </p>
                  <span className={`text-xs font-black tabular-nums ${allGuestsDecided ? 'text-green-300' : 'text-amber-300'}`}>
                    {guestsDecided}/{guests.length}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2.5">
                  <div
                    className={`h-full transition-all ${allGuestsDecided ? 'bg-green-400' : 'bg-amber-400'}`}
                    style={{ width: `${guests.length ? (guestsDecided / guests.length) * 100 : 0}%` }}
                  />
                </div>
                <p className={`text-xs ${allGuestsDecided ? 'text-green-300/90 font-bold' : 'text-amber-200/80'}`}>
                  {allGuestsDecided
                    ? 'Tudo escolhido — podes atribuir em segurança!'
                    : 'Ainda há convidados a decidir. Se atribuíres agora, esses prémios perdem-se.'}
                </p>
              </div>
            )}

            {!awarded ? (
              <button
                onClick={() => (allGuestsDecided ? handleAward() : setShowAwardConfirm(true))}
                disabled={awarding}
                className="w-full bg-amber-400 text-slate-900 font-black text-lg py-4 rounded-2xl hover:bg-amber-300 disabled:opacity-50 transition-all shadow-xl"
              >
                {awarding ? 'A atribuir...' : '⭐ Atribuir XP e Gold'}
              </button>
            ) : (
              <div className="bg-green-500/20 border border-green-400/30 rounded-2xl p-4 text-green-200 font-bold text-center text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Prémios atribuídos
              </div>
            )}

            <a href="/jogos/vana-espada" className="block text-center text-sky-300 underline text-sm py-2">
              Voltar ao VanaEspada
            </a>
          </>
        )}
      </div>

      {/* Modal: expulsar */}
      {kickTarget && (
        <Modal onClose={() => setKickTarget(null)}>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-400/30 flex items-center justify-center mx-auto">
              <UserX className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-white font-black text-2xl">Expulsar jogador?</h3>
            <p className="text-sky-200 text-sm leading-relaxed">
              Vais remover <span className="text-white font-black">{kickTarget.displayName}</span> da sessão.
              <span className="text-white/60 text-xs mt-2 block">
                As respostas dele também são apagadas. Pode voltar a entrar com o PIN.
              </span>
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleKick}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-3.5 rounded-2xl transition-all active:scale-[0.98]"
            >
              Sim, expulsar
            </button>
            <button
              onClick={() => setKickTarget(null)}
              className="w-full bg-white/5 hover:bg-white/10 text-white/60 text-sm py-2.5 rounded-2xl border border-white/10"
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: atribuir com convidados por decidir */}
      {showAwardConfirm && (
        <Modal onClose={() => setShowAwardConfirm(false)}>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-400/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-white font-black text-2xl">Atribuir já?</h3>
            <p className="text-sky-200 text-sm leading-relaxed">
              Ainda há <span className="text-amber-300 font-black">{guests.length - guestsDecided}</span> convidado
              {guests.length - guestsDecided !== 1 ? 's' : ''} por decidir o destinatário.
              <span className="text-white/60 text-xs mt-2 block">
                Se atribuíres agora, os prémios desses convidados perdem-se.
              </span>
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowAwardConfirm(false)}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-black py-3 rounded-2xl"
            >
              Esperar pelos restantes
            </button>
            <button
              onClick={handleAward}
              disabled={awarding}
              className="w-full bg-white/5 hover:bg-white/10 text-white/60 text-sm py-2.5 rounded-2xl border border-white/10 disabled:opacity-60"
            >
              {awarding ? 'A atribuir...' : 'Atribuir mesmo assim'}
            </button>
          </div>
        </Modal>
      )}

      {/* Barra de ação fixa */}
      {session.status !== 'finished' && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent pt-6 pb-4 px-4 z-30">
          <div className="max-w-md mx-auto space-y-2">
            <button
              onClick={handleNext}
              disabled={busy || (session.status === 'lobby' && players.length === 0)}
              className="w-full bg-amber-400 text-slate-900 font-black text-lg py-4 rounded-2xl hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-2"
            >
              {session.status === 'lobby' && <Play className="w-5 h-5" />}
              {nextLabel}
              {session.status !== 'lobby' && <ChevronRight className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * O cartão do versículo no painel do anfitrião.
 *
 * O TEXTO vem primeiro e grande, para se poder ir lendo em voz alta antes de
 * aparecer no projetor; a referência — que é a resposta — fica em baixo, mais
 * discreta. É a mesma ideia do VanaQuest, onde o painel mostra a pergunta e as
 * opções à frente e a certa fica só assinalada.
 */
function VerseCard({
  round, label, footer,
}: {
  round: HostRound
  label: string
  footer?: React.ReactNode
}) {
  return (
    <div className="bg-white/10 rounded-3xl p-5 border border-white/10 space-y-3">
      <p className="text-amber-300 text-[10px] font-black uppercase tracking-widest">{label}</p>

      {round.excerpt ? (
        <p className="text-white font-semibold text-lg leading-snug italic">
          &ldquo;{round.excerpt}&rdquo;
        </p>
      ) : (
        <p className="text-white/40 text-sm italic">Este versículo não tem texto.</p>
      )}
      {round.translation && (
        <p className="text-white/35 text-[11px] font-bold uppercase tracking-widest">— {round.translation}</p>
      )}

      <div className="flex items-center gap-2 pt-2.5 border-t border-white/10">
        <span className="text-white/30 text-[10px] font-black uppercase tracking-widest">Resposta</span>
        <span className="text-amber-300 font-black text-base">
          {formatReference({
            bookId: round.book_id,
            chapter: round.chapter,
            verseStart: round.verse_start,
            verseEnd: round.verse_end,
          })}
        </span>
        <Clock className="w-3 h-3 text-white/25 ml-auto" />
        <span className="text-white/30 text-[11px] font-bold tabular-nums">{round.time_seconds}s</span>
      </div>

      {footer}
    </div>
  )
}

/** Uma resposta de um jogador: quem foi, o que respondeu e (na revelação) quanto valeu. */
function AnswerRow({ answer, order, revealed }: { answer: EspadaAnswerView; order: number; revealed: boolean }) {
  const book = getBook(answer.guessBook ?? undefined)
  const seconds = answer.elapsedMs != null ? (answer.elapsedMs / 1000).toFixed(1) : null

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 border ${
        revealed && answer.isCorrect
          ? 'bg-green-500/15 border-green-400/30'
          : 'bg-white/5 border-white/10'
      }`}
    >
      <span className="w-5 text-center text-white/30 text-xs font-black tabular-nums">{order}</span>
      <PlayerAvatar
        name={answer.displayName}
        avatarUrl={answer.avatarUrl}
        className="w-7 h-7"
        textClassName="text-[10px]"
        fallbackBg="bg-amber-500/40"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate leading-tight">{answer.displayName}</p>
        {seconds && <p className="text-white/30 text-[10px] tabular-nums">{seconds}s</p>}
      </div>
      <span
        className="font-black text-sm tabular-nums px-2 py-0.5 rounded-lg bg-white/10"
        title={book?.name}
      >
        {formatGuess({
          bookId: answer.guessBook ?? undefined,
          chapter: answer.guessChapter,
          verse: answer.guessVerse,
        })}
      </span>
      {revealed && (
        <span className={`font-black text-sm tabular-nums w-11 text-right ${answer.points > 0 ? 'text-amber-300' : 'text-white/25'}`}>
          {answer.points}
        </span>
      )}
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 border border-white/20 rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-5"
      >
        {children}
      </div>
    </div>
  )
}
