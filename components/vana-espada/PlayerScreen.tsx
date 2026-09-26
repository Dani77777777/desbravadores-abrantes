'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { ArrowUp, Check, Crown, Sword, Trophy } from 'lucide-react'
import { PlayerAvatar } from '@/components/vana-quest/PlayerAvatar'
import { LobbyReactionPad } from '@/components/game-lobby/LobbyReactionPad'
import { LobbyTips } from '@/components/game-lobby/LobbyTips'
import { useStillInRoom } from '@/components/game-lobby/useStillInRoom'
import { useWakeLock } from '@/components/vana-camp/useWakeLock'
import { getMyAnswer, setRewardsRecipient, skipRewards, submitLocate } from '@/lib/actions/vana-espada'
import {
  breakdownHeadline,
  calcEspadaRewards,
  formatGuess,
  formatReference,
  toEspadaPlayer,
} from '@/utils/vana-espada'
import { SECTION_LABELS } from '@/utils/permissions'
import type { EspadaGuess, EspadaPlayer, EspadaSession, LocateBreakdown } from '@/types/vana-espada'
import { ReferencePicker } from './ReferencePicker'
import { useCountdown, useEspadaSession, useServerClock } from './useEspadaSession'

interface Member {
  id: string
  full_name: string
  section: string
  avatar_url?: string | null
}

interface Props {
  sessionId: string
  userId: string | null
  initialSession: EspadaSession
  serverNow: number
  allMembers: Member[]
}

export function PlayerScreen({ sessionId, userId, initialSession, serverNow, allMembers }: Props) {
  const supabase = createClient()
  const { session, round } = useEspadaSession(sessionId, initialSession)
  const { now } = useServerClock(serverNow)
  useWakeLock()

  const [playerId, setPlayerId] = useState<string | null>(null)
  const [me, setMe] = useState<EspadaPlayer | null>(null)
  const [kicked, setKicked] = useState(false)

  const [submittedGuess, setSubmittedGuess] = useState<EspadaGuess | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<{ points: number; breakdown: LocateBreakdown } | null>(null)

  const [rank, setRank] = useState<{ position: number; total: number; pointsToNext: number | null }>({
    position: 0, total: 0, pointsToNext: null,
  })

  const isGuest = !userId
  const timeLeft = useCountdown(session.status === 'round_active' ? session.phaseEndsAt : null, now)

  // ── Identificar o jogador ───────────────────────────────────────
  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(`vana_espada_player_${sessionId}`)
    } catch {
      stored = null
    }
    if (stored) {
      setPlayerId(stored)
      return
    }
    // Failsafe para quem tem conta: sem localStorage, procura-se na BD.
    if (userId) {
      supabase
        .from('vanaespada_players')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.id) return
          setPlayerId(data.id)
          try {
            localStorage.setItem(`vana_espada_player_${sessionId}`, data.id)
          } catch {}
        })
    }
  }, [sessionId, userId, supabase])

  // ── O meu estado (pontos, prémios) + deteção de expulsão ────────
  const refreshMe = useCallback(async () => {
    if (!playerId) return
    const { data } = await supabase
      .from('vanaespada_players')
      .select('*')
      .eq('id', playerId)
      .maybeSingle()
    if (data) {
      setMe(toEspadaPlayer(data))
      setKicked(false)
    } else {
      setKicked(true)
    }
  }, [playerId, supabase])

  useEffect(() => { refreshMe() }, [refreshMe, session.status, session.currentRound])

  // O refreshMe só corre quando o estado muda — na sala de espera, uma expulsão passava
  // despercebida até o jogo começar. Confirma ao voltar ao ecrã / à rede e, na espera, a cada 5 s.
  useStillInRoom({
    enabled: !!playerId && !kicked,
    pollMs: session.status === 'lobby' ? 5000 : 0,
    exists: async () => {
      const { data, error } = await supabase
        .from('vanaespada_players')
        .select('id')
        .eq('id', playerId!)
        .maybeSingle()
      return error ? null : !!data
    },
    // No VanaEspada ninguém sai por inatividade: se desapareceu, foi o anfitrião.
    onGone: () => {
      try { localStorage.removeItem(`vana_espada_player_${sessionId}`) } catch {}
      setKicked(true)
    },
  })

  // ── Classificação (posição + quanto falta para subir) ───────────
  useEffect(() => {
    if (!playerId) return
    if (!['round_reveal', 'leaderboard', 'finished'].includes(session.status)) return

    supabase
      .from('vanaespada_players')
      .select('id, total_points')
      .eq('session_id', sessionId)
      .order('total_points', { ascending: false })
      .then(({ data }) => {
        if (!data?.length) return
        const index = data.findIndex((p) => p.id === playerId)
        if (index < 0) return
        const above = index > 0 ? Number(data[index - 1].total_points) || 0 : null
        setRank({
          position: index + 1,
          total: data.length,
          pointsToNext: above == null ? null : Math.max(0, above - (Number(data[index].total_points) || 0)),
        })
      })
  }, [playerId, sessionId, session.status, session.currentRound, supabase])

  // ── Nova ronda: limpa o ecrã e recupera o estado após um refresh ─
  const roundRef = useRef<number>(-1)
  useEffect(() => {
    if (session.currentRound === roundRef.current) return
    roundRef.current = session.currentRound
    setSubmittedGuess(null)
    setResult(null)
    setSubmitError('')
  }, [session.currentRound])

  // Se o telemóvel perdeu a rede ou recarregou a meio, volta ao ecrã certo.
  useEffect(() => {
    if (!playerId || session.currentRound < 0) return
    if (session.status !== 'round_active' && session.status !== 'round_reveal') return
    if (result) return

    let cancelled = false
    getMyAnswer(sessionId, playerId, session.currentRound).then((answer) => {
      if (cancelled || !answer.answered) return
      setSubmittedGuess((prev) => prev ?? { bookId: 0, chapter: null, verse: null })
      if (answer.points != null && answer.breakdown) {
        setResult({ points: answer.points, breakdown: answer.breakdown })
      }
    })
    return () => { cancelled = true }
  }, [playerId, sessionId, session.status, session.currentRound, result])

  async function handleSubmit(guess: EspadaGuess) {
    if (!playerId || submitting) return
    setSubmitting(true)
    setSubmitError('')
    setSubmittedGuess(guess)

    const response = await submitLocate(sessionId, playerId, session.currentRound, guess)
    if (response.ok || response.alreadyAnswered) {
      if (response.points != null && response.breakdown) {
        setResult({ points: response.points, breakdown: response.breakdown })
      }
    } else {
      setSubmitError(response.error || 'Não foi possível enviar.')
      setSubmittedGuess(null)
    }
    setSubmitting(false)
  }

  // ── Prémios do convidado ────────────────────────────────────────
  const [donationSearch, setDonationSearch] = useState('')
  const [donating, setDonating] = useState(false)
  const [donationDone, setDonationDone] = useState<'sent' | 'skipped' | null>(null)
  const [pendingRecipient, setPendingRecipient] = useState<Member | null>(null)

  const totalPoints = me?.totalPoints ?? 0
  const { gold, xp } = calcEspadaRewards(totalPoints)

  const filteredMembers = allMembers
    .filter((m) => m.full_name.toLowerCase().includes(donationSearch.toLowerCase()))
    .slice(0, 30)

  async function handleDonate(recipientId: string) {
    if (!playerId) return
    setDonating(true)
    await setRewardsRecipient(playerId, recipientId)
    setDonating(false)
    setPendingRecipient(null)
    setDonationDone('sent')
  }

  async function handleSkip() {
    if (!playerId) return
    setDonating(true)
    await skipRewards(playerId)
    setDonating(false)
    setDonationDone('skipped')
  }

  // ── Ecrãs ───────────────────────────────────────────────────────

  if (kicked) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <p className="text-5xl">👋</p>
          <h1 className="text-white font-black text-2xl">Saíste desta sessão</h1>
          <p className="text-sky-200 text-sm">O anfitrião removeu-te do jogo.</p>
          <a
            href={`/jogos/vana-espada?pin=${session.pin}`}
            className="block mt-4 rounded-2xl bg-amber-400 text-slate-950 font-black text-lg py-3.5 active:scale-95 transition-transform"
          >
            Voltar a entrar
          </a>
        </div>
      </Shell>
    )
  }

  if (!playerId) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <Sword className="w-12 h-12 text-amber-300 mx-auto" />
          <p className="text-white font-bold">Não te encontrámos nesta sessão.</p>
          <a href="/jogos/vana-espada" className="text-amber-300 underline text-sm block">
            Entrar outra vez com o PIN
          </a>
        </div>
      </Shell>
    )
  }

  // LOBBY
  if (session.status === 'lobby') {
    return (
      <Shell>
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="flex items-center gap-3 bg-white/10 rounded-2xl px-4 py-3 border border-white/15">
            <img src="/images/VanaEspada.jpeg" alt="" className="w-11 h-11 object-contain rounded-lg" />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-white font-black text-lg">Estás dentro!</p>
              <p className="text-sky-200 text-xs flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                À espera que o jogo comece...
              </p>
            </div>
            <PlayerAvatar
              name={me?.displayName || '?'}
              avatarUrl={me?.avatarUrl}
              className="w-10 h-10"
              textClassName="text-sm"
              fallbackBg="bg-amber-500/40"
            />
          </div>
          <LobbyReactionPad game="vana-espada" sessionId={sessionId} playerId={playerId} />
          <LobbyTips game="vana-espada" variant="phone" />
        </div>
      </Shell>
    )
  }

  // ENTRE RONDAS
  if (session.status === 'round_ready') {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <Sword className="w-14 h-14 text-amber-300 mx-auto animate-pulse" />
          <p className="text-amber-300 text-xs font-black uppercase tracking-[0.2em]">
            Ronda {session.currentRound + 1} de {session.totalRounds}
          </p>
          <p className="text-white font-black text-3xl">Prepara-te!</p>
        </div>
      </Shell>
    )
  }

  // A RESPONDER
  if (session.status === 'round_active') {
    const answered = !!submittedGuess
    const limit = round?.timeSeconds ?? 30

    if (answered) {
      return (
        <Shell>
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mx-auto animate-in zoom-in duration-300">
              <Check className="w-10 h-10 text-white" />
            </div>
            <p className="text-white font-black text-2xl">Resposta enviada!</p>
            {submittedGuess && submittedGuess.bookId > 0 && (
              <p className="text-amber-300 font-black text-3xl">{formatGuess(submittedGuess)}</p>
            )}
            <p className="text-sky-200/70 text-sm">
              Já não podes mudar. A ronda fecha quando todos responderem.
            </p>
            <p className="text-white/40 text-sm tabular-nums">{Math.ceil(timeLeft)}s</p>
          </div>
        </Shell>
      )
    }

    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex flex-col p-3">
        {/* Cronómetro */}
        <div className="flex-shrink-0 mb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-amber-300 text-[10px] font-black uppercase tracking-widest">
              Ronda {session.currentRound + 1}/{session.totalRounds}
            </span>
            <span className="text-white font-black text-xl tabular-nums">{Math.ceil(timeLeft)}s</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                timeLeft > limit * 0.5 ? 'bg-green-400' : timeLeft > limit * 0.25 ? 'bg-amber-400' : 'bg-red-400'
              }`}
              style={{ width: `${Math.min(100, (timeLeft / limit) * 100)}%` }}
            />
          </div>
        </div>

        {/* Excerto (o mesmo que está no projetor) */}
        {round?.excerpt && (
          <div className="flex-shrink-0 bg-white/10 border border-white/10 rounded-2xl px-3.5 py-2.5 mb-2 max-h-24 overflow-y-auto">
            <p className="text-white text-sm leading-snug italic">&ldquo;{round.excerpt}&rdquo;</p>
            {round.translation && (
              <p className="text-sky-300/60 text-[10px] font-bold mt-1">— {round.translation}</p>
            )}
          </div>
        )}

        {submitError && (
          <div className="flex-shrink-0 bg-red-500/20 border border-red-400/30 rounded-xl px-3 py-2 text-red-200 text-xs font-semibold mb-2">
            {submitError}
          </div>
        )}

        <div className="flex-1 min-h-0">
          <ReferencePicker disabled={submitting} onSubmit={handleSubmit} />
        </div>
      </div>
    )
  }

  // REVELAÇÃO
  if (session.status === 'round_reveal') {
    const points = result?.points ?? 0
    return (
      <Shell>
        <div className="text-center space-y-4 w-full max-w-xs">
          {result ? (
            <>
              <p
                className={`font-black text-6xl tabular-nums ${
                  points >= 900 ? 'text-amber-300' : points > 0 ? 'text-green-400' : 'text-white/40'
                }`}
              >
                +{points}
              </p>
              <p className="text-white font-bold text-lg">{breakdownHeadline(result.breakdown)}</p>

              <div className="bg-white/10 rounded-2xl p-3 space-y-1.5 text-left">
                <BreakdownRow label="Livro" value={result.breakdown.book} max={600} />
                <BreakdownRow label="Capítulo" value={result.breakdown.chapter} max={250} />
                <BreakdownRow label="Versículo" value={result.breakdown.verse} max={100} />
                <BreakdownRow label="Rapidez" value={result.breakdown.speed} max={50} />
              </div>
            </>
          ) : (
            <>
              <p className="text-5xl">⏳</p>
              <p className="text-white/70 font-bold text-xl">Sem resposta desta vez.</p>
            </>
          )}

          {round?.reference && (
            <p className="text-amber-300 font-black text-xl">{formatReference(round.reference)}</p>
          )}

          <div className="bg-white/10 rounded-2xl px-5 py-3">
            <p className="text-sky-300 text-[10px] font-black uppercase tracking-widest">Total</p>
            <p className="text-white font-black text-3xl tabular-nums">{totalPoints}</p>
          </div>
        </div>
      </Shell>
    )
  }

  // CLASSIFICAÇÃO
  if (session.status === 'leaderboard') {
    const isLeader = rank.position === 1
    return (
      <Shell>
        <div className="text-center space-y-4">
          {isLeader ? <Crown className="w-16 h-16 text-amber-300 mx-auto" /> : <Trophy className="w-14 h-14 text-amber-300 mx-auto" />}
          {rank.position > 0 && (
            <div>
              <p className="text-sky-300 text-xs font-black uppercase tracking-widest mb-1">
                {isLeader ? '👑 Estás em 1.º!' : 'A tua posição'}
              </p>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-white text-7xl font-black tabular-nums leading-none">{rank.position}º</span>
                <span className="text-white/40 text-2xl font-bold">/ {rank.total}</span>
              </div>
            </div>
          )}

          <div className="bg-white/10 rounded-2xl px-6 py-3">
            <p className="text-sky-300 text-[10px] font-black uppercase tracking-widest">Pontuação</p>
            <p className="text-white text-4xl font-black tabular-nums">{totalPoints}</p>
            {me?.lastRoundPoints != null && me.lastRoundPoints > 0 && (
              <p className="text-green-400 text-sm font-black tabular-nums">+{me.lastRoundPoints} nesta ronda</p>
            )}
          </div>

          {rank.pointsToNext != null && rank.pointsToNext > 0 && (
            <div className="flex items-center gap-2 bg-green-500/15 border border-green-400/30 rounded-2xl px-4 py-2.5">
              <ArrowUp className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-green-200 text-sm font-semibold">
                Faltam <span className="text-green-400 font-black">{rank.pointsToNext}</span> pts para o {rank.position - 1}º
              </p>
            </div>
          )}

          <p className="text-white/40 text-xs animate-pulse">Olha para o ecrã principal...</p>
        </div>
      </Shell>
    )
  }

  // FIM — convidado a doar os prémios
  if (session.status === 'finished' && isGuest && !donationDone && gold > 0) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex flex-col p-6 gap-5 overflow-y-auto">
        <div className="text-center pt-4">
          <img src="/images/VanaEspada.jpeg" alt="" className="w-14 h-14 object-contain mx-auto mb-2" />
          <h2 className="text-2xl font-black text-white">Jogo terminado!</h2>
          <p className="text-sky-200 mt-1">{totalPoints} pontos</p>
        </div>

        <div className="bg-white/10 rounded-2xl p-5 border border-white/20 space-y-4">
          <div className="text-center">
            <p className="text-sky-200 text-sm">Podes enviar ao teu Desbravador:</p>
            <p className="text-amber-300 font-black text-2xl mt-1">{gold} 🪙 + {xp} ⭐ XP</p>
            <p className="text-sky-300/70 text-[11px] mt-1">
              Cada 10 pontos valem 1 Gold, e o XP é o dobro.
            </p>
          </div>

          <input
            type="text"
            value={donationSearch}
            onChange={(e) => setDonationSearch(e.target.value)}
            placeholder="Pesquisar desbravador..."
            className="w-full bg-white/20 border border-white/30 text-white placeholder-white/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/50"
          />

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {filteredMembers.map((m) => (
              <button
                key={m.id}
                onClick={() => setPendingRecipient(m)}
                disabled={donating}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-left disabled:opacity-60"
              >
                <PlayerAvatar
                  name={m.full_name}
                  avatarUrl={m.avatar_url}
                  className="w-8 h-8"
                  textClassName="text-sm"
                  fallbackBg="bg-sky-600"
                />
                <div>
                  <p className="text-white font-semibold text-sm">{m.full_name}</p>
                  <p className="text-sky-300 text-xs">{SECTION_LABELS[m.section] || m.section}</p>
                </div>
              </button>
            ))}
          </div>

          <button onClick={handleSkip} disabled={donating} className="w-full text-sky-400 text-sm py-2 underline">
            Dispensar prémios
          </button>
        </div>

        {pendingRecipient && (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => !donating && setPendingRecipient(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 border border-white/20 rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-5"
            >
              <div className="text-center space-y-3">
                <PlayerAvatar
                  name={pendingRecipient.full_name}
                  avatarUrl={pendingRecipient.avatar_url}
                  className="w-16 h-16 mx-auto"
                  textClassName="text-xl"
                  fallbackBg="bg-sky-600"
                />
                <h3 className="text-white font-black text-2xl">Confirmar?</h3>
                <p className="text-sky-200 text-sm leading-relaxed">
                  Vais dar <span className="text-amber-300 font-black">{gold} 🪙</span> e{' '}
                  <span className="text-sky-300 font-black">{xp} ⭐ XP</span> a{' '}
                  <span className="text-white font-black">{pendingRecipient.full_name}</span>.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleDonate(pendingRecipient.id)}
                  disabled={donating}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-black py-3 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {donating ? 'A enviar...' : 'Sim, é este!'}
                </button>
                <button
                  onClick={() => setPendingRecipient(null)}
                  disabled={donating}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/60 text-sm py-2.5 rounded-2xl border border-white/10 disabled:opacity-60"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // FIM
  if (session.status === 'finished') {
    return (
      <Shell>
        <div className="text-center space-y-5 w-full max-w-sm">
          <img src="/images/VanaEspada.jpeg" alt="" className="w-20 h-20 object-contain mx-auto" />
          <h1 className="text-3xl font-black text-white">🏆 Concluído!</h1>

          {donationDone === 'sent' && (
            <p className="text-green-300 font-bold">Enviado! O teu desbravador receberá os prémios.</p>
          )}

          <div className="bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20 space-y-4">
            <div>
              <p className="text-sky-300 text-xs font-bold uppercase tracking-wide">Pontuação final</p>
              <p className="text-white font-black text-4xl tabular-nums">{totalPoints}</p>
            </div>
            {rank.position > 0 && (
              <p className="text-amber-300 font-black text-lg">{rank.position}º de {rank.total}</p>
            )}
            {!isGuest && gold > 0 && (
              <div className="flex justify-around border-t border-white/10 pt-4">
                <div>
                  <p className="text-amber-300 font-black text-2xl">+{gold}</p>
                  <p className="text-sky-300 text-xs">🪙 Gold</p>
                </div>
                <div>
                  <p className="text-sky-400 font-black text-2xl">+{xp}</p>
                  <p className="text-sky-300 text-xs">⭐ XP</p>
                </div>
              </div>
            )}
          </div>

          <a href="/jogos" className="text-sky-300 underline text-sm block">Voltar aos jogos</a>
        </div>
      </Shell>
    )
  }

  return null
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex flex-col items-center justify-center p-6">
      {children}
    </div>
  )
}

function BreakdownRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/60 text-xs font-bold w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${value > 0 ? 'bg-amber-400' : 'bg-white/10'}`}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
      <span className="text-white font-black text-xs tabular-nums w-9 text-right">{value}</span>
    </div>
  )
}
