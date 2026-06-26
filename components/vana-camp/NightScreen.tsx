'use client'

import { useEffect, useMemo, useState } from 'react'
import { Moon, VenetianMask, Home, Eye, Shield, User, Bot, Check, MessageSquare } from 'lucide-react'
import {
  getMyNightContext,
  submitNightAction,
  sendChatMessage,
} from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { useLiveSession } from './useLiveSession'
import { useVibrationSignal } from './useVibrationSignal'
import { VibrationFlash } from './VibrationFlash'
import { usePhaseCountdown, usePhaseProgress, formatClock } from './usePhaseCountdown'
import { usePhaseReload } from './usePhaseReload'
import type { VanaCampRole, VanaCampMessage } from '@/types/vana-camp'

interface Props {
  sessionId: string
  status: 'night_infiltrators' | 'night_seer' | 'night_guardian'
  dayNumber: number
  phaseStartedAt: string | null
  phaseEndsAt: string | null
  phasePausedAt: string | null
  /** Se vier, está-se a impersonar este bot (host em sessão de teste). */
  impersonatingBotId?: string
  impersonatingBotName?: string
}

const PHASE_FOR_ROLE: Record<VanaCampRole, 'night_infiltrators' | 'night_seer' | 'night_guardian' | null> = {
  infiltrator: 'night_infiltrators',
  seer: 'night_seer',
  guardian: 'night_guardian',
  villager: null,
}

const ROLE_ICON: Record<VanaCampRole, typeof User> = {
  infiltrator: VenetianMask,
  seer: Eye,
  guardian: Shield,
  villager: User,
}

export function NightScreen(props: Props) {
  const {
    sessionId, status, dayNumber, phaseStartedAt, phaseEndsAt, phasePausedAt,
    impersonatingBotId, impersonatingBotName,
  } = props

  const live = useLiveSession(sessionId, {
    status,
    phase_ends_at: phaseEndsAt,
    phase_paused_at: phasePausedAt,
    day_number: dayNumber,
  })
  // Reload duro como fallback caso o realtime falhe (tab em background)
  usePhaseReload(sessionId, status)
  const remaining = usePhaseCountdown(live.phase_ends_at, live.phase_paused_at)
  const progress = usePhaseProgress(phaseStartedAt, live.phase_ends_at, live.phase_paused_at)

  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getMyNightContext>> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Quando o jogador já agiu e carrega em "Fechar os olhos", entra em modo de descanso.
  const [resting, setResting] = useState(false)
  // Sempre que a fase muda (nova role chamada), o ecrã de descanso reinicia.
  useEffect(() => { setResting(false) }, [live.status])

  const { needsGesture, flash } = useVibrationSignal(sessionId, ctx?.my_player_id ?? null)

  async function refresh() {
    const r = await getMyNightContext(sessionId, impersonatingBotId)
    setCtx(r)
  }

  useEffect(() => {
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_night_${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vanacamp_events', filter: `session_id=eq.${sessionId}` },
        () => refresh()
      )
      .subscribe()
    const i = setInterval(refresh, 3000)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, impersonatingBotId])

  // Gradiente de noite: começa muito escuro, clareia no fim
  const bgStyle = useMemo(() => {
    // 0 = noite cerrada, 1 = quase a amanhecer
    const lightness = 4 + progress * 18  // 4% → 22%
    const hue = 220 - progress * 30      // 220 (azul profundo) → 190 (cinza-azul alvorada)
    return { background: `linear-gradient(180deg, hsl(${hue}, 40%, ${lightness * 0.6}%) 0%, hsl(${hue}, 30%, ${lightness}%) 100%)` }
  }, [progress])

  if (!ctx || ctx.error) {
    return (
      <main className="min-h-screen flex items-center justify-center text-amber-100" style={bgStyle}>
        {ctx?.error ?? 'A preparar a noite…'}
      </main>
    )
  }

  // IMPORTANTE: usar live.status (não o prop `status`) — quando o Narrador
  // avança, o realtime atualiza `live` instantaneamente, mas o prop só refresca
  // depois do server re-render. Sem isto, o jogador continua a ver o ecrã da
  // fase anterior (ex: Profeta com o resultado em vista após a fase passar).
  const currentStatus = live.status as Props['status']
  const myPhase = ctx.my_role ? PHASE_FOR_ROLE[ctx.my_role] : null
  const myTurn = myPhase === currentStatus
  const Icon = ctx.my_role ? ROLE_ICON[ctx.my_role] : Moon

  // Se a fase já não é noturna (transitou para day_announce/finished), mostra
  // ecrã de transição enquanto o router.refresh() recarrega o componente certo.
  const stillNight =
    currentStatus === 'night_infiltrators' ||
    currentStatus === 'night_seer' ||
    currentStatus === 'night_guardian'

  async function handleSubmit(targetId: string) {
    setError(null)
    setPending(true)
    const r = await submitNightAction(sessionId, targetId, impersonatingBotId)
    setPending(false)
    if (r.error) setError(r.error)
    refresh()
  }

  // ── A fase mudou para algo não-noturno → transição
  if (!stillNight) {
    return (
      <main className="min-h-screen flex items-center justify-center text-amber-100" style={bgStyle}>
        <div className="text-center space-y-2 animate-pulse">
          <p className="text-xl">A noite acabou…</p>
          <p className="text-sm text-amber-300/60">O sol vem a romper</p>
        </div>
      </main>
    )
  }

  // ── Quem não tem ação esta noite, ou está fora de turno ─────────
  if (!ctx.is_alive) {
    return (
      <DeadView
        sessionId={sessionId}
        myPlayerId={ctx.my_player_id ?? ''}
        bgStyle={bgStyle}
        remaining={remaining}
        impersonatingBotName={impersonatingBotName}
      />
    )
  }

  if (!myTurn) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 text-stone-200" style={bgStyle}>
        {impersonatingBotName && <ImpersonateBanner name={impersonatingBotName} />}
        <Moon className="w-16 h-16 text-blue-200/60 mb-4 animate-pulse" />
        <h1 className="text-2xl font-bold text-blue-100 mb-2">O acampamento dorme</h1>
        <p className="text-blue-200/70 text-sm max-w-md">
          {currentStatus === 'night_infiltrators' && 'Os infiltrados conspiram nas sombras…'}
          {currentStatus === 'night_seer' && 'O Profeta busca orientação a Deus…'}
          {currentStatus === 'night_guardian' && 'O Conselheiro mantém vigia…'}
        </p>
        {remaining !== null && (
          <p className="text-blue-300/60 text-xs mt-6">aguarda… {remaining}s</p>
        )}
      </main>
    )
  }

  // ── A vez do jogador ────────────────────────────────────────────
  const targets = (ctx.alive_players ?? []).filter((p) => p.id !== ctx.my_player_id)

  // Já agiu? (Profeta tem resultado; Conselheiro/Infiltrado já escolheram alvo.)
  const hasActed =
    ctx.my_role === 'seer' ? !!ctx.current_result : !!ctx.current_target_id

  // ── Descanso: o jogador concluiu e fechou os olhos ──────────────
  if (resting) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 text-stone-200" style={bgStyle}>
        {impersonatingBotName && <ImpersonateBanner name={impersonatingBotName} />}
        <Moon className="w-20 h-20 text-blue-200/60 mb-5 animate-pulse" />
        <h1 className="text-3xl font-black text-blue-100 mb-2">Fecha os olhos e dorme 😴</h1>
        <p className="text-blue-200/70 text-sm max-w-md">
          A tua parte já está feita. Fecha os olhos até de manhã — não espreites, para a próxima
          pessoa poder jogar à vontade!
        </p>
        {remaining !== null && (
          <p className="text-blue-300/50 text-xs mt-6">a noite continua… {formatClock(remaining)}</p>
        )}
        <button
          onClick={() => setResting(false)}
          className="mt-8 text-blue-300/60 hover:text-blue-100 text-xs underline underline-offset-4"
        >
          Rever a minha jogada
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 md:p-8 text-stone-100" style={bgStyle}>
      <VibrationFlash flash={flash} needsGesture={needsGesture} />
      {impersonatingBotName && <ImpersonateBanner name={impersonatingBotName} />}
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="text-center space-y-2 py-2">
          <Icon className="w-12 h-12 text-amber-300 mx-auto drop-shadow-[0_0_15px_rgba(252,211,77,0.5)]" />
          <h1 className="text-2xl md:text-3xl font-black text-amber-100">
            {ctx.my_role === 'infiltrator' && 'Quem vais assustar esta noite?'}
            {ctx.my_role === 'seer' && 'Que jogador queres revelar?'}
            {ctx.my_role === 'guardian' && 'Quem queres proteger?'}
          </h1>
          {ctx.my_role === 'guardian' && ctx.guardian_last_target_id && (
            <p className="text-amber-300/70 text-xs">Não podes proteger quem protegeste ontem.</p>
          )}
          {remaining !== null && (
            <p className="text-amber-200 text-sm">
              <span className="font-bold text-xl">{remaining}s</span>
            </p>
          )}
        </header>

        {/* Profeta: depois de agir, esconde a lista e mostra só o resultado */}
        {ctx.my_role === 'seer' && ctx.current_result && ctx.current_target_id ? (
          <SeerResult
            target={targets.find((t) => t.id === ctx.current_target_id)?.display_name ?? '?'}
            result={ctx.current_result}
          />
        ) : (
          <TargetList
            targets={targets}
            selectedId={ctx.current_target_id ?? null}
            disabledIds={
              ctx.my_role === 'guardian' && ctx.guardian_last_target_id
                ? [ctx.guardian_last_target_id]
                : []
            }
            onSelect={handleSubmit}
            pending={pending}
          />
        )}

        {ctx.my_role === 'infiltrator' && (
          <InfiltratorView
            sessionId={sessionId}
            myPlayerId={ctx.my_player_id ?? ''}
            alivePlayers={ctx.alive_players ?? []}
            votes={ctx.infiltrator_votes ?? []}
            impersonatingBotId={impersonatingBotId}
          />
        )}

        {error && (
          <div className="bg-red-900/60 border border-red-700 text-red-100 rounded p-3 text-sm">
            {error}
          </div>
        )}

        {hasActed && (
          <button
            onClick={() => setResting(true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-900/60 hover:bg-indigo-800/70 border border-indigo-600/50 text-blue-100 font-semibold py-3 rounded-lg transition"
          >
            <Moon className="w-5 h-5" /> Já está — fechar os olhos e dormir
          </button>
        )}
      </div>
    </main>
  )
}

// ============================================
// Sub-componentes
// ============================================

function ImpersonateBanner({ name }: { name: string }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-purple-900/80 border border-purple-500 rounded-full px-3 py-1 flex items-center gap-2 text-purple-100 text-xs z-30">
      <Bot className="w-4 h-4" />
      A controlar <strong>{name}</strong>
    </div>
  )
}

function TargetList({
  targets, selectedId, disabledIds, onSelect, pending,
}: {
  targets: { id: string; display_name: string }[]
  selectedId: string | null
  disabledIds: string[]
  onSelect: (id: string) => void
  pending: boolean
}) {
  return (
    <ul className="space-y-2">
      {targets.map((t) => {
        const isSelected = t.id === selectedId
        const isDisabled = disabledIds.includes(t.id) || pending
        return (
          <li key={t.id}>
            <button
              onClick={() => onSelect(t.id)}
              disabled={isDisabled}
              className={`w-full text-left px-4 py-3 rounded border transition flex items-center justify-between ${
                isSelected
                  ? 'bg-amber-700/60 border-amber-400 text-white'
                  : 'bg-stone-900/50 border-stone-700 hover:bg-stone-800/70 text-stone-100'
              } ${isDisabled && !isSelected ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <span className="font-medium">{t.display_name}</span>
              {isSelected && <Check className="w-5 h-5" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SeerResult({ target, result }: { target: string; result: 'fiel' | 'infiltrado' }) {
  const isInf = result === 'infiltrado'
  return (
    <div className={`mt-4 rounded-lg p-5 border-2 text-center animate-in fade-in zoom-in duration-500 ${
      isInf ? 'border-red-500 bg-red-950/40 text-red-100' : 'border-emerald-500 bg-emerald-950/40 text-emerald-100'
    }`}>
      <p className="text-sm text-stone-300 mb-1">A tua profecia revela:</p>
      <p className="text-2xl font-black">
        <strong>{target}</strong> é {isInf ? 'INFILTRADO' : 'um DESBRAVADOR'}
      </p>
    </div>
  )
}

function InfiltratorView({
  sessionId, myPlayerId, alivePlayers, votes, impersonatingBotId,
}: {
  sessionId: string
  myPlayerId: string
  alivePlayers: { id: string; display_name: string }[]
  votes: { actor_id: string; target_id: string }[]
  impersonatingBotId?: string
}) {
  const nameById = new Map(alivePlayers.map((p) => [p.id, p.display_name]))

  return (
    <div className="space-y-3 pt-2">
      {votes.length > 0 && (
        <div className="bg-red-950/40 border border-red-800/50 rounded p-3">
          <div className="text-red-300 text-xs uppercase tracking-wider font-semibold mb-2">
            Votos dos infiltrados
          </div>
          <ul className="space-y-1 text-sm">
            {votes.map((v) => (
              <li key={v.actor_id} className="text-red-100">
                <strong>{nameById.get(v.actor_id) ?? '?'}</strong> →{' '}
                <span className="text-red-300">{nameById.get(v.target_id) ?? '?'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <InfiltratorsChat
        sessionId={sessionId}
        myPlayerId={myPlayerId}
        nameById={nameById}
        impersonatingBotId={impersonatingBotId}
      />
    </div>
  )
}

function InfiltratorsChat({
  sessionId, myPlayerId, nameById, impersonatingBotId,
}: {
  sessionId: string
  myPlayerId: string
  nameById: Map<string, string>
  impersonatingBotId?: string
}) {
  const [messages, setMessages] = useState<VanaCampMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data } = await supabase
        .from('vanacamp_messages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('channel', 'infiltrators')
        .order('created_at', { ascending: true })
        .limit(50)
      if (data) setMessages(data as VanaCampMessage[])
    }
    load()
    const ch = supabase
      .channel(`vc_chat_inf_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vanacamp_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const m = payload.new as VanaCampMessage
          if (m.channel === 'infiltrators') setMessages((prev) => [...prev, m])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  async function send() {
    if (!text.trim()) return
    setSending(true)
    await sendChatMessage(sessionId, 'infiltrators', text, impersonatingBotId)
    setText('')
    setSending(false)
  }

  return (
    <div className="bg-stone-950/60 border border-red-800/40 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-red-950/60 text-red-200 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> Chat dos infiltrados
      </div>
      <div className="max-h-44 overflow-y-auto p-3 space-y-1 text-sm">
        {messages.length === 0 ? (
          <p className="text-stone-500 italic text-xs">Sem mensagens ainda.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.sender_player_id === myPlayerId ? 'text-red-200' : 'text-stone-200'}>
              <strong>{nameById.get(m.sender_player_id) ?? '?'}:</strong> {m.content}
            </div>
          ))
        )}
      </div>
      <div className="flex border-t border-stone-800">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Diz algo aos teus camaradas…"
          className="flex-1 bg-stone-950 px-3 py-2 text-stone-100 text-sm outline-none"
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white px-4 text-sm"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}

function DeadView({
  bgStyle, remaining, impersonatingBotName,
}: {
  sessionId: string
  myPlayerId: string
  bgStyle: React.CSSProperties
  remaining: number | null
  impersonatingBotName?: string
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 text-stone-300" style={bgStyle}>
      {impersonatingBotName && <ImpersonateBanner name={impersonatingBotName} />}
      <Home className="w-16 h-16 text-stone-400 mb-3" />
      <h1 className="text-2xl font-bold mb-2">Já estás em casa</h1>
      <p className="text-stone-400 text-sm max-w-md">
        Foste para casa. Já não influencias o jogo, mas podes acompanhar até ao fim.
      </p>
      {remaining !== null && (
        <p className="text-stone-500 text-xs mt-6">resta: {remaining}s</p>
      )}
    </main>
  )
}
