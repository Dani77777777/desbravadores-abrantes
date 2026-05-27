'use client'

import { useEffect, useMemo, useState } from 'react'
import { Sun, Sunset, Vote, Crown, Skull, Bot, MessageSquare, Check } from 'lucide-react'
import {
  getMyDayVoteContext,
  submitDayVote,
  sendChatMessage,
} from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { useLiveSession } from './useLiveSession'
import { useVibrationSignal } from './useVibrationSignal'
import { VibrationFlash } from './VibrationFlash'
import { usePhaseReload } from './usePhaseReload'
import { usePhaseCountdown, usePhaseProgress } from './usePhaseCountdown'
import type { VanaCampMessage, VanaCampChatMode } from '@/types/vana-camp'

interface Props {
  sessionId: string
  status: 'day_discussion' | 'day_vote' | 'day_result'
  dayNumber: number
  phaseStartedAt: string | null
  phaseEndsAt: string | null
  phasePausedAt: string | null
  chatMode: VanaCampChatMode
  impersonatingBotId?: string
  impersonatingBotName?: string
}

export function DayScreen(props: Props) {
  const {
    sessionId, status, dayNumber, phaseStartedAt, phaseEndsAt, phasePausedAt,
    chatMode, impersonatingBotId, impersonatingBotName,
  } = props

  const live = useLiveSession(sessionId, {
    status,
    phase_ends_at: phaseEndsAt,
    phase_paused_at: phasePausedAt,
    day_number: dayNumber,
  })
  usePhaseReload(sessionId, status)
  const remaining = usePhaseCountdown(live.phase_ends_at, live.phase_paused_at)
  const progress = usePhaseProgress(phaseStartedAt, live.phase_ends_at, live.phase_paused_at)

  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getMyDayVoteContext>> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { needsGesture, flash } = useVibrationSignal(sessionId, ctx?.my_player_id ?? null)

  async function refresh() {
    const r = await getMyDayVoteContext(sessionId, impersonatingBotId)
    setCtx(r)
  }

  useEffect(() => {
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_day_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacamp_events', filter: `session_id=eq.${sessionId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacamp_votes', filter: `session_id=eq.${sessionId}` }, () => refresh())
      .subscribe()
    const i = setInterval(refresh, 2000)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, impersonatingBotId])

  // Gradiente dia → pôr-do-sol (ideia original do user)
  const bgStyle = useMemo(() => {
    if (live.status === 'day_discussion') {
      // 0 = meio-dia dourado, 1 = laranja-pôr-do-sol
      const hue = 45 - progress * 25         // 45 (amarelo) → 20 (laranja)
      const sat = 70 + progress * 15         // mais intenso no fim
      const lightTop = 75 - progress * 30    // 75% → 45%
      const lightBottom = 60 - progress * 35 // 60% → 25%
      return {
        background: `linear-gradient(180deg, hsl(${hue}, ${sat}%, ${lightTop}%) 0%, hsl(${hue - 5}, ${sat}%, ${lightBottom}%) 100%)`,
      }
    }
    if (live.status === 'day_vote') {
      // Vermelho-pôr-do-sol — urgência
      return {
        background: `linear-gradient(180deg, hsl(20, 75%, ${50 - progress * 15}%) 0%, hsl(10, 70%, ${30 - progress * 10}%) 100%)`,
      }
    }
    // day_result
    return { background: 'linear-gradient(180deg, hsl(15, 50%, 25%) 0%, hsl(220, 40%, 10%) 100%)' }
  }, [progress, live.status])

  const currentStatus = live.status

  // ──────────────────────────────────────────────────────────────
  // DISCUSSION
  // ──────────────────────────────────────────────────────────────
  if (currentStatus === 'day_discussion') {
    return (
      <main className="min-h-screen p-4 md:p-8 text-stone-900" style={bgStyle}>
        <VibrationFlash flash={flash} needsGesture={needsGesture} />
        {impersonatingBotName && <ImpersonateBanner name={impersonatingBotName} />}
        <div className="max-w-2xl mx-auto space-y-4">
          <header className="text-center space-y-2 py-2">
            {progress < 0.7 ? (
              <Sun className="w-14 h-14 text-amber-700 mx-auto drop-shadow-lg" />
            ) : (
              <Sunset className="w-14 h-14 text-orange-800 mx-auto drop-shadow-lg" />
            )}
            <p className="text-amber-900/80 uppercase tracking-widest text-xs">Dia {live.day_number} &middot; Assembleia</p>
            <h1 className="text-3xl md:text-4xl font-black">
              Quem suspeitas que é Infiltrado?
            </h1>
            <p className="text-stone-900/70 text-sm">
              Discutam entre vocês. A votação começa quando o Narrador decidir.
            </p>
            {remaining !== null && (
              <p className="text-amber-900 text-2xl font-black mt-2">{remaining}s</p>
            )}
          </header>

          {ctx?.is_alive === false && (
            <DeadBanner />
          )}

          <AlivePlayersList players={ctx?.alive_players ?? []} />

          {chatMode === 'remote' && ctx?.is_alive && (
            <DayChat
              sessionId={sessionId}
              myPlayerId={ctx.my_player_id ?? ''}
              alivePlayers={ctx.alive_players ?? []}
              impersonatingBotId={impersonatingBotId}
            />
          )}
        </div>
      </main>
    )
  }

  // ──────────────────────────────────────────────────────────────
  // VOTE
  // ──────────────────────────────────────────────────────────────
  if (currentStatus === 'day_vote') {
    if (ctx?.is_alive === false) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center text-orange-100" style={bgStyle}>
          <Skull className="w-16 h-16 mb-4" />
          <p className="text-2xl font-bold">Estás na cozinha</p>
          <p className="text-orange-200/70 text-sm mt-2">Não podes votar. Aguarda o resultado.</p>
          {remaining !== null && <p className="text-sm mt-4">{remaining}s</p>}
        </main>
      )
    }

    const targets = (ctx?.alive_players ?? []).filter((p) => p.id !== ctx?.my_player_id)
    async function handleVote(targetId: string) {
      setError(null)
      setPending(true)
      const r = await submitDayVote(sessionId, targetId, impersonatingBotId)
      setPending(false)
      if (r.error) setError(r.error)
      refresh()
    }

    // Contagem por alvo (todos veem)
    const tallyByTarget = new Map<string, number>()
    for (const v of ctx?.votes ?? []) {
      tallyByTarget.set(v.target_id, (tallyByTarget.get(v.target_id) ?? 0) + 1)
    }

    return (
      <main className="min-h-screen p-4 md:p-8 text-orange-100" style={bgStyle}>
        <VibrationFlash flash={flash} needsGesture={needsGesture} />
        {impersonatingBotName && <ImpersonateBanner name={impersonatingBotName} />}
        <div className="max-w-2xl mx-auto space-y-4">
          <header className="text-center space-y-2 py-2">
            <Vote className="w-14 h-14 text-amber-200 mx-auto drop-shadow-lg" />
            <h1 className="text-3xl md:text-4xl font-black">
              Vota em quem expulsar
            </h1>
            {ctx?.is_mayor && (
              <p className="text-amber-200 text-xs flex items-center justify-center gap-1">
                <Crown className="w-3 h-3" /> O teu voto desempata
              </p>
            )}
            {remaining !== null && (
              <p className="text-amber-100 text-2xl font-black">{remaining}s</p>
            )}
          </header>

          <ul className="space-y-2">
            {targets.map((t) => {
              const isSelected = t.id === ctx?.current_target_id
              const count = tallyByTarget.get(t.id) ?? 0
              return (
                <li key={t.id}>
                  <button
                    onClick={() => handleVote(t.id)}
                    disabled={pending}
                    className={`w-full text-left px-4 py-3 rounded border transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-red-700/60 border-red-300 text-white'
                        : 'bg-black/30 border-white/20 hover:bg-black/50 text-orange-100'
                    } disabled:opacity-50`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{t.display_name}</span>
                      {t.is_mayor && <Crown className="w-3.5 h-3.5 text-amber-300" />}
                    </span>
                    <span className="flex items-center gap-3">
                      {count > 0 && (
                        <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {count}
                        </span>
                      )}
                      {isSelected && <Check className="w-5 h-5" />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {error && (
            <div className="bg-red-950/60 border border-red-700 text-red-100 rounded p-3 text-sm">
              {error}
            </div>
          )}
        </div>
      </main>
    )
  }

  // ──────────────────────────────────────────────────────────────
  // RESULT — placeholder; o ecrã principal é o DayResultScreen
  // ──────────────────────────────────────────────────────────────
  return null
}

// ============================================
// Sub-componentes
// ============================================

function ImpersonateBanner({ name }: { name: string }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-purple-900/80 border border-purple-500 rounded-full px-3 py-1 flex items-center gap-2 text-purple-100 text-xs z-30">
      <Bot className="w-4 h-4" /> A controlar <strong>{name}</strong>
    </div>
  )
}

function DeadBanner() {
  return (
    <div className="bg-stone-900/60 border border-stone-700 rounded p-3 text-center text-stone-300 text-sm">
      Estás na cozinha — não podes votar, mas podes observar.
    </div>
  )
}

function AlivePlayersList({ players }: { players: { id: string; display_name: string; is_mayor: boolean }[] }) {
  return (
    <section className="bg-white/30 backdrop-blur border border-amber-700/30 rounded-lg p-3">
      <h2 className="text-amber-900 text-xs uppercase tracking-wider font-semibold mb-2">
        No acampamento ({players.length})
      </h2>
      <ul className="grid grid-cols-2 gap-1">
        {players.map((p) => (
          <li key={p.id} className="bg-white/40 rounded px-2 py-1.5 text-stone-900 text-sm flex items-center gap-1.5">
            {p.is_mayor && <Crown className="w-3 h-3 text-amber-700" />}
            <span className="truncate">{p.display_name}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DayChat({
  sessionId, myPlayerId, alivePlayers, impersonatingBotId,
}: {
  sessionId: string
  myPlayerId: string
  alivePlayers: { id: string; display_name: string }[]
  impersonatingBotId?: string
}) {
  const [messages, setMessages] = useState<VanaCampMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const nameById = new Map(alivePlayers.map((p) => [p.id, p.display_name]))

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('vanacamp_messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('channel', 'day')
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => { if (data) setMessages(data as VanaCampMessage[]) })
    const ch = supabase
      .channel(`vc_chat_day_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vanacamp_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const m = payload.new as VanaCampMessage
          if (m.channel === 'day') setMessages((prev) => [...prev, m])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  async function send() {
    if (!text.trim()) return
    setSending(true)
    await sendChatMessage(sessionId, 'day', text, impersonatingBotId)
    setText('')
    setSending(false)
  }

  return (
    <div className="bg-white/30 backdrop-blur border border-amber-700/30 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-amber-900/30 text-amber-900 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> Assembleia
      </div>
      <div className="max-h-56 overflow-y-auto p-3 space-y-1 text-sm">
        {messages.length === 0 ? (
          <p className="text-stone-700 italic text-xs">Ainda ninguém falou.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.sender_player_id === myPlayerId ? 'text-amber-900 font-medium' : 'text-stone-800'}>
              <strong>{nameById.get(m.sender_player_id) ?? '?'}:</strong> {m.content}
            </div>
          ))
        )}
      </div>
      <div className="flex border-t border-amber-900/20">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Diz algo na assembleia…"
          className="flex-1 bg-white/40 px-3 py-2 text-stone-900 placeholder:text-stone-700 text-sm outline-none"
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white px-4 text-sm"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
