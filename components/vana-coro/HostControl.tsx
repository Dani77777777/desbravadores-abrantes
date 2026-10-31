'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeftRight,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Flag,
  Gift,
  Loader2,
  MonitorPlay,
  Play,
  Search,
  Trash2,
  Trophy,
  Undo2,
  UserMinus,
  X,
  Zap,
} from 'lucide-react'
import {
  addBots,
  awardCoroRewards,
  buzz,
  coroHostEvent,
  deleteCoroSession,
  finishCoroGame,
  getHostRound,
  nextRound,
  removePlayer,
  setCaptain,
  setPlayerTeam,
  startCoroGame,
  undoLast,
  updateLobby,
} from '@/lib/actions/vana-coro-game'
import { suggestGroup } from '@/utils/vana-coro/normalize'
import { MAX_ROUNDS, MIN_ROUNDS, type RoundEvent } from '@/utils/vana-coro/scoring'
import { StrikeMarks, TEAM_STYLE } from './BoardUI'
import { faceoffMessage, teamName, useCoroPlayers, useCoroSession } from './useCoroLive'
import type {
  VanaCoroHostRound,
  VanaCoroHostSlot,
  VanaCoroPlayer,
  VanaCoroReadyQuestion,
  VanaCoroSession,
  VanaCoroTeam,
} from '@/types/vana-coro'

interface Props {
  session: VanaCoroSession
  initialPlayers: VanaCoroPlayer[]
  readyQuestions: VanaCoroReadyQuestion[]
}

type Run = (key: string, action: () => Promise<{ error?: string }>, success?: string) => void

const PHASE_HELP: Record<string, string> = {
  intro: 'A pergunta está no projetor. Quando os capitães estiverem prontos, começa o duelo.',
  faceoff: 'Duelo: revela a resposta de quem tem a vez ou marca ❌. O jogo passa a vez e dá o controlo sozinho.',
  playing: 'A equipa com o controlo vai dizendo respostas. Revela o grupo certo ou marca ❌ (3 falhas → roubo).',
  steal: 'Roubo: a outra equipa tem 1 tentativa. Se acertar, toca na resposta; se não, "Roubo errado".',
  reveal_rest: 'A ronda tem vencedor. Revela o resto (sem pontos) ou fecha a ronda.',
  round_end: 'Ronda fechada.',
}

/** O controlo do anfitrião: lobby, cada ronda e o fim do jogo. */
export function HostControl({ session: initial, initialPlayers, readyQuestions }: Props) {
  const session = useCoroSession(initial, 2500)
  const players = useCoroPlayers(session.id, initialPlayers)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const run: Run = (key, action, success) => {
    setBusy(key)
    startTransition(async () => {
      try {
        const r = await action()
        if (r.error) toast.error(r.error)
        else if (success) toast.success(success)
      } catch {
        toast.error('Algo correu mal. Tenta outra vez.')
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <Link href="/jogos/vana-coro" className="font-black tracking-tight text-fuchsia-300">
          VanaCoro
        </Link>
        <span className="rounded-lg bg-white/10 px-2 py-1 font-mono text-sm font-bold tracking-widest">{session.code}</span>
        {session.is_test_session && <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-bold uppercase">Teste</span>}
        <div className="ml-auto flex gap-2">
          <Link
            href={`/jogos/vana-coro/${session.id}/present`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            <MonitorPlay className="h-4 w-4" /> Abrir projetor
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        {session.status === 'lobby' && (
          <LobbyPanel session={session} players={players} readyQuestions={readyQuestions} run={run} pending={pending} busy={busy} />
        )}
        {session.status === 'playing' && <GamePanel session={session} players={players} run={run} pending={pending} busy={busy} />}
        {session.status === 'finished' && <FinishedPanel session={session} players={players} run={run} pending={pending} />}
      </main>
    </div>
  )
}

// ── Lobby ─────────────────────────────────────────────────────

function LobbyPanel({
  session,
  players,
  readyQuestions,
  run,
  pending,
  busy,
}: {
  session: VanaCoroSession
  players: VanaCoroPlayer[]
  readyQuestions: VanaCoroReadyQuestion[]
  run: Run
  pending: boolean
  busy: string | null
}) {
  const [teamA, setTeamA] = useState(session.team_a_name)
  const [teamB, setTeamB] = useState(session.team_b_name)
  const [selected, setSelected] = useState<string[]>(session.question_ids)
  const dirty = teamA !== session.team_a_name || teamB !== session.team_b_name || selected.join() !== session.question_ids.join()

  const save = () => updateLobby(session.id, { teamAName: teamA, teamBName: teamB, questionIds: selected })
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_ROUNDS ? s : [...s, id]))

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl bg-white/5 p-5">
        <h2 className="text-lg font-bold">Equipas</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['a', 'b'] as VanaCoroTeam[]).map((t) => (
            <label key={t} className="block">
              <span className={`text-xs font-bold uppercase ${TEAM_STYLE[t].text}`}>Equipa {t.toUpperCase()}</span>
              <input
                value={t === 'a' ? teamA : teamB}
                onChange={(e) => (t === 'a' ? setTeamA : setTeamB)(e.target.value)}
                maxLength={24}
                className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 font-semibold outline-none ring-1 ring-white/10 focus:ring-fuchsia-400"
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(['a', 'b'] as VanaCoroTeam[]).map((t) => (
            <ul key={t} className={`min-h-24 space-y-1 rounded-xl p-2 ${TEAM_STYLE[t].soft}`}>
              {players.filter((p) => p.team === t).map((p) => (
                <PlayerRow key={p.id} session={session} player={p} run={run} pending={pending} />
              ))}
              {!players.some((p) => p.team === t) && <li className="p-2 text-xs text-white/40">Ainda ninguém</li>}
            </ul>
          ))}
        </div>
        <CopyJoinLink code={session.code} />
        <p className="text-xs text-white/50">
          Os jogadores entram com o código <strong className="font-mono">{session.code}</strong> ou pelo QR do projetor. A coroa marca o capitão
          (é quem tem o “Já sei!”); por omissão é o primeiro a entrar.
        </p>
        {session.is_test_session && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run('bots', () => addBots(session.id))}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold hover:bg-purple-500 disabled:opacity-50"
          >
            <Bot className="h-4 w-4" /> Adicionar bots
          </button>
        )}
      </section>

      <section className="space-y-3 rounded-2xl bg-white/5 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Perguntas</h2>
          <span className={`text-sm ${selected.length < MIN_ROUNDS ? 'text-amber-300' : 'text-white/60'}`}>
            {selected.length} rondas (entre {MIN_ROUNDS} e {MAX_ROUNDS}) · a última vale ×2
          </span>
        </div>
        {readyQuestions.length === 0 ? (
          <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
            Ainda não há perguntas prontas. Revê as respostas em Gestão → VanaCoro e marca-as como prontas.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {readyQuestions.map((q) => {
              const pos = selected.indexOf(q.id)
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => toggle(q.id)}
                    className={`flex w-full items-start gap-2 rounded-lg p-2 text-left text-sm ${pos >= 0 ? 'bg-fuchsia-600/30 ring-1 ring-fuchsia-400' : 'hover:bg-white/5'}`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${pos >= 0 ? 'bg-fuchsia-500' : 'bg-white/10'}`}>
                      {pos >= 0 ? pos + 1 : ''}
                    </span>
                    <span className="flex-1">
                      {q.prompt}
                      {q.used_at && <span className="ml-1 text-xs text-amber-300">(já jogada)</span>}
                    </span>
                    <span className="text-xs text-white/40">{q.entries} resp.</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-white/50">A ordem das rondas é a ordem em que as escolhes.</p>
      </section>

      <div className="flex flex-wrap gap-3 lg:col-span-2">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => run('save', save, 'Guardado')}
          className="rounded-xl border border-white/20 px-4 py-2.5 font-semibold hover:bg-white/10 disabled:opacity-40"
        >
          Guardar
        </button>
        <button
          type="button"
          disabled={pending || selected.length < MIN_ROUNDS}
          onClick={() =>
            run('start', async () => {
              if (dirty) {
                const r = await save()
                if (r.error) return r
              }
              return startCoroGame(session.id)
            })
          }
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5 font-bold hover:bg-fuchsia-500 disabled:opacity-40"
        >
          {busy === 'start' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />} Começar o jogo
        </button>
        <DeleteButton sessionId={session.id} run={run} pending={pending} />
      </div>
    </div>
  )
}

/** Copia o link de entrada com o código já incluído (abre logo a escolha da equipa). Só na sala de espera: as equipas fecham quando o jogo começa. */
function CopyJoinLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/jogos/vana-coro?code=${code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
        copied ? 'border-emerald-400/60 bg-emerald-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`}
    >
      <span className={`shrink-0 rounded-xl p-2.5 ${copied ? 'bg-emerald-400/20' : 'bg-fuchsia-500/20'}`}>
        {copied ? <Check className="h-5 w-5 text-emerald-300" /> : <Copy className="h-5 w-5 text-fuchsia-300" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{copied ? 'Link copiado!' : 'Copiar link de entrada'}</span>
        <span className="block truncate text-xs text-white/60">
          {copied ? 'Cola onde quiseres partilhar' : 'Código já incluído · toca para copiar'}
        </span>
      </span>
    </button>
  )
}

function PlayerRow({ session, player, run, pending }: { session: VanaCoroSession; player: VanaCoroPlayer; run: Run; pending: boolean }) {
  const other: VanaCoroTeam = player.team === 'a' ? 'b' : 'a'
  return (
    <li className="flex items-center gap-1 rounded-lg bg-black/20 px-2 py-1 text-sm">
      <button
        type="button"
        title="Fazer capitão"
        disabled={pending || player.is_captain}
        onClick={() => run(`cap:${player.id}`, () => setCaptain(session.id, player.id))}
        className={player.is_captain ? 'text-amber-300' : 'text-white/20 hover:text-amber-200'}
      >
        <Crown className="h-4 w-4" />
      </button>
      {player.is_bot && <Bot className="h-3.5 w-3.5 text-purple-300" />}
      <span className="min-w-0 flex-1 truncate">{player.display_name}</span>
      {session.status !== 'finished' && (
        <>
          <button
            type="button"
            title={`Mudar para ${teamName(session, other)}`}
            disabled={pending}
            onClick={() => run(`team:${player.id}`, () => setPlayerTeam(session.id, player.id, other))}
            className="text-white/40 hover:text-white"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Tirar do jogo"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Tirar ${player.display_name} do jogo?`)) run(`rm:${player.id}`, () => removePlayer(session.id, player.id))
            }}
            className="text-white/40 hover:text-red-300"
          >
            <UserMinus className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </li>
  )
}

// ── Durante o jogo ────────────────────────────────────────────

function GamePanel({
  session,
  players,
  run,
  pending,
  busy,
}: {
  session: VanaCoroSession
  players: VanaCoroPlayer[]
  run: Run
  pending: boolean
  busy: string | null
}) {
  const [round, setRound] = useState<VanaCoroHostRound | null>(null)
  const [hint, setHint] = useState('')
  // Respostas tapadas (para mostrar o ecrã a alguém); "Espreitar" mostra-as enquanto se carrega
  const hideAnswers = useSyncExternalStore(subscribeHide, readHide, () => false)
  const [peek, setPeek] = useState(false)
  const concealed = hideAnswers && !peek
  const router = useRouter()
  const versionRef = useRef(-1)

  useEffect(() => {
    const v = session.board_version
    versionRef.current = v
    getHostRound(session.id).then((r) => {
      if (versionRef.current === v) setRound(r)
    })
  }, [session.id, session.board_version])

  // A sugestão limpa-se a cada ação
  const [hintVersion, setHintVersion] = useState(session.board_version)
  if (hintVersion !== session.board_version) {
    setHintVersion(session.board_version)
    setHint('')
  }

  const suggested = useMemo(
    () => (hint.trim() && round ? suggestGroup(hint, round.slots.filter((s) => !s.revealed).map((s) => ({ id: s.id, label: s.label, texts: s.texts }))) : null),
    [hint, round],
  )
  const phase = session.phase
  const ev = (key: string, event: RoundEvent) => run(key, () => coroHostEvent(session.id, event))
  const isLast = session.current_round >= session.total_rounds
  const stealing: VanaCoroTeam | null = session.control_team ? (session.control_team === 'a' ? 'b' : 'a') : null
  const captainBots = session.is_test_session ? players.filter((p) => p.is_bot && p.is_captain) : []

  return (
    <div className="space-y-4">
      {/* Placar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {(['a', 'b'] as VanaCoroTeam[]).map((t, i) => (
          <div
            key={t}
            className={`${i === 1 ? 'order-3 text-right' : ''} rounded-2xl p-3 ring-2 ${TEAM_STYLE[t].soft} ${
              session.control_team === t && (phase === 'playing' || phase === 'steal') ? TEAM_STYLE[t].ring : 'ring-transparent'
            }`}
          >
            <p className={`truncate text-sm font-bold ${TEAM_STYLE[t].text}`}>{teamName(session, t)}</p>
            <p className="text-3xl font-black tabular-nums">{t === 'a' ? session.team_a_score : session.team_b_score}</p>
          </div>
        ))}
        <div className="order-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Pote</p>
          <p className="text-3xl font-black tabular-nums text-amber-300">{session.round_pot}</p>
          {round?.multiplier === 2 && <p className="text-xs font-black text-amber-300">×2</p>}
        </div>
      </div>

      <section className="rounded-2xl bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/60">
          <span className="font-bold text-white">Ronda {session.current_round}/{session.total_rounds}</span>
          <span>·</span>
          <span>{PHASE_HELP[phase ?? ''] ?? ''}</span>
        </div>
        <h2 className="mt-2 text-xl font-bold">{round?.prompt}</h2>

        {phase === 'faceoff' && (
          <div className="mt-2 space-y-2">
            <p className="flex items-center gap-1.5 font-semibold text-amber-300">
              <Zap className="h-4 w-4" />
              {session.faceoff_turn ? faceoffMessage(session) : 'À espera do “Já sei!”…'}
            </p>
            {!session.faceoff_turn && (
              // Sem telemóveis (ou o capitão não carregou): o anfitrião escolhe quem começa.
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-white/50">ou escolhe quem responde primeiro:</span>
                {(['a', 'b'] as VanaCoroTeam[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={pending}
                    onClick={() => ev(`first:${t}`, { kind: 'buzz', team: t })}
                    className={`rounded-lg px-3 py-1 font-semibold disabled:opacity-40 ${TEAM_STYLE[t].bg}`}
                  >
                    {teamName(session, t)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
              <Flag className="h-3.5 w-3.5" /> Exceção no palco? Dar o controlo já a:
              {(['a', 'b'] as VanaCoroTeam[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={pending}
                  onClick={() => ev(`control:${t}`, { kind: 'control', team: t })}
                  className={`font-semibold underline hover:text-white disabled:opacity-40 ${TEAM_STYLE[t].text}`}
                >
                  {teamName(session, t)}
                </button>
              ))}
            </div>
          </div>
        )}
        {phase === 'playing' && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <StrikeMarks strikes={session.strikes} size="small" />
            <span className="text-white/60">{teamName(session, session.control_team)} tem o controlo</span>
          </div>
        )}
        {phase === 'steal' && stealing && <p className="mt-2 font-bold text-rose-300">{teamName(session, stealing)} tenta roubar!</p>}

        {/* Sugestão no palco (sem IA) */}
        {(phase === 'faceoff' || phase === 'playing' || phase === 'steal') && (
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="O que disseram? (ajuda a encontrar o grupo)"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
            />
            {hint && !suggested && <span className="text-xs text-white/40">sem parecidos</span>}
          </label>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => writeHide(!hideAnswers)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              hideAnswers ? 'border-amber-400/50 bg-amber-400/15 text-amber-200' : 'border-white/20 hover:bg-white/10'
            }`}
          >
            {hideAnswers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {hideAnswers ? 'Mostrar respostas' : 'Esconder respostas'}
          </button>
          {hideAnswers && (
            <button
              type="button"
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              onPointerCancel={() => setPeek(false)}
              onContextMenu={(e) => e.preventDefault()}
              className="flex select-none items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold active:bg-white/20"
            >
              <Eye className="h-4 w-4" /> Manter carregado para espreitar
            </button>
          )}
        </div>

        <ul className="mt-3 space-y-2">
          {round?.slots.map((s) => (
            <SlotRow
              key={s.id}
              slot={s}
              concealed={concealed}
              phase={phase}
              suggested={s.id === suggested}
              disabled={pending || (phase === 'faceoff' && !session.faceoff_turn)}
              busy={busy === `slot:${s.id}`}
              onReveal={() =>
                phase === 'steal'
                  ? run(`slot:${s.id}`, () => coroHostEvent(session.id, { kind: 'steal_result', success: true, entryId: s.id }))
                  : ev(`slot:${s.id}`, { kind: 'reveal', entryId: s.id })
              }
            />
          ))}
        </ul>
      </section>

      {/* Ações da fase */}
      <div className="flex flex-wrap gap-2">
        {phase === 'intro' && (
          <ActionButton onClick={() => ev('start', { kind: 'start' })} busy={busy === 'start'} disabled={pending} className="bg-fuchsia-600 hover:bg-fuchsia-500">
            <Zap className="h-5 w-5" /> Começar o duelo
          </ActionButton>
        )}
        {(phase === 'faceoff' || phase === 'playing') && (
          <ActionButton
            onClick={() => ev('strike', { kind: 'strike' })}
            busy={busy === 'strike'}
            disabled={pending || (phase === 'faceoff' && !session.faceoff_turn)}
            className="bg-red-600 hover:bg-red-500"
          >
            <X className="h-5 w-5" strokeWidth={3} /> Falha
          </ActionButton>
        )}
        {phase === 'playing' && round?.canPass && session.control_team && (
          <ActionButton
            onClick={() => ev('pass', { kind: 'control', team: session.control_team === 'a' ? 'b' : 'a' })}
            busy={busy === 'pass'}
            disabled={pending}
            className="bg-slate-600 hover:bg-slate-500"
          >
            <ArrowLeftRight className="h-5 w-5" /> {teamName(session, session.control_team)} passa a vez
          </ActionButton>
        )}
        {phase === 'steal' && (
          <ActionButton
            onClick={() => run('steal-no', () => coroHostEvent(session.id, { kind: 'steal_result', success: false }))}
            busy={busy === 'steal-no'}
            disabled={pending}
            className="bg-red-600 hover:bg-red-500"
          >
            <X className="h-5 w-5" strokeWidth={3} /> Roubo errado
          </ActionButton>
        )}
        {phase === 'reveal_rest' && (
          <ActionButton onClick={() => ev('finish', { kind: 'finish' })} busy={busy === 'finish'} disabled={pending} className="bg-slate-600 hover:bg-slate-500">
            <Check className="h-5 w-5" /> Fechar a ronda
          </ActionButton>
        )}
        {phase === 'round_end' && (
          <ActionButton
            onClick={() => run('next', () => nextRound(session.id))}
            busy={busy === 'next'}
            disabled={pending}
            className="bg-fuchsia-600 hover:bg-fuchsia-500"
          >
            {isLast ? <Trophy className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            {isLast ? 'Ver o pódio' : 'Próxima ronda'}
          </ActionButton>
        )}

        <button
          type="button"
          disabled={pending || !round?.canUndo}
          onClick={() => run('undo', () => undoLast(session.id), 'Desfeito')}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-30"
          title={round?.lastEvent ? `Desfazer: ${round.lastEvent}` : undefined}
        >
          <Undo2 className="h-4 w-4" /> Desfazer{round?.lastEvent ? `: ${round.lastEvent}` : ''}
        </button>
      </div>

      {/* Bots (teste) */}
      {captainBots.length > 0 && phase === 'faceoff' && !session.buzzed_team && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-purple-900/40 p-3 text-sm">
          <Bot className="h-4 w-4 text-purple-300" /> Fazer de capitão bot:
          {captainBots.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={pending}
              onClick={() => run(`buzz:${b.id}`, () => buzz(session.id, b.id))}
              className={`rounded-lg px-3 py-1 font-semibold ${b.team ? TEAM_STYLE[b.team].bg : ''}`}
            >
              {b.display_name}: Já sei!
            </button>
          ))}
        </div>
      )}
      {session.is_test_session && (
        <p className="text-xs text-white/40">
          Ecrã de cada bot:{' '}
          {players.filter((p) => p.is_bot).map((b) => (
            <Link key={b.id} href={`/jogos/vana-coro/${session.id}/as/${b.id}`} target="_blank" className="mr-2 underline hover:text-white">
              {b.display_name}
            </Link>
          ))}
        </p>
      )}

      <details className="rounded-xl bg-white/5 p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-white/70">Jogadores ({players.length})</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['a', 'b'] as VanaCoroTeam[]).map((t) => (
            <ul key={t} className={`space-y-1 rounded-lg p-2 ${TEAM_STYLE[t].soft}`}>
              {players.filter((p) => p.team === t).map((p) => (
                <PlayerRow key={p.id} session={session} player={p} run={run} pending={pending} />
              ))}
            </ul>
          ))}
        </div>
      </details>

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm('Terminar o jogo já? As rondas que faltam não se jogam.')) {
            run('finish-game', async () => {
              const r = await finishCoroGame(session.id)
              if (!r.error) router.refresh()
              return r
            })
          }
        }}
        className="text-xs text-white/40 underline hover:text-white/70"
      >
        Terminar o jogo agora
      </button>
    </div>
  )
}

const HIDE_KEY = 'vanacoro-host-hide-answers'
const HIDE_EVENT = 'vanacoro-host-hide-answers'

function readHide(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

function writeHide(on: boolean) {
  try {
    localStorage.setItem(HIDE_KEY, on ? '1' : '0')
  } catch {
    /* sem localStorage: vale só até recarregar */
  }
  window.dispatchEvent(new Event(HIDE_EVENT))
}

function subscribeHide(cb: () => void) {
  window.addEventListener(HIDE_EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(HIDE_EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

function SlotRow({
  slot,
  concealed,
  phase,
  suggested,
  disabled,
  busy,
  onReveal,
}: {
  slot: VanaCoroHostSlot
  /** Respostas tapadas: as por revelar não mostram nome, emoji, pontos nem respostas. */
  concealed: boolean
  phase: VanaCoroSession['phase']
  suggested: boolean
  disabled: boolean
  busy: boolean
  onReveal: () => void
}) {
  const canReveal = !slot.revealed && (phase === 'faceoff' || phase === 'playing' || phase === 'steal' || phase === 'reveal_rest')
  const label = phase === 'steal' ? 'Roubo certo' : phase === 'reveal_rest' ? 'Mostrar' : 'Revelar'
  return (
    <li
      className={`flex items-center gap-3 rounded-xl p-2 ring-2 ${
        slot.revealed ? 'bg-amber-400/15 ring-amber-400/30' : suggested ? 'bg-emerald-500/20 ring-emerald-400' : 'bg-white/5 ring-transparent'
      }`}
    >
      <span className="w-6 text-center font-black text-white/40">{slot.rank}</span>
      {concealed && !slot.revealed ? (
        <>
          <span className="w-8 text-2xl text-white/20">?</span>
          <div className="min-w-0 flex-1">
            <p className="select-none font-bold tracking-widest text-white/25">● ● ● ● ● ●</p>
          </div>
          <span className="w-10 text-right font-black text-white/25">?</span>
        </>
      ) : (
        <>
          <span className="text-2xl">{slot.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${slot.revealed ? 'text-amber-200' : ''}`}>{slot.label}</p>
            {slot.texts.length > 0 && <p className="truncate text-xs text-white/40">{slot.texts.join(' · ')}</p>}
          </div>
          <span className="w-10 text-right font-black tabular-nums text-amber-300">{slot.points}</span>
        </>
      )}
      {canReveal ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onReveal}
          className={`flex w-28 items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-bold disabled:opacity-40 ${
            phase === 'steal' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
        </button>
      ) : (
        <span className="w-28 text-center text-xs text-white/40">{slot.revealed ? (slot.scored ? 'revelada' : 'sem pontos') : ''}</span>
      )}
    </li>
  )
}

function ActionButton({
  children,
  onClick,
  busy,
  disabled,
  className,
}: {
  children: React.ReactNode
  onClick: () => void
  busy?: boolean
  disabled?: boolean
  className: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-xl px-4 py-3 font-bold text-white transition disabled:opacity-40 ${className}`}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {children}
    </button>
  )
}

// ── Fim ───────────────────────────────────────────────────────

function FinishedPanel({ session, players, run, pending }: { session: VanaCoroSession; players: VanaCoroPlayer[]; run: Run; pending: boolean }) {
  const a = session.team_a_score
  const b = session.team_b_score
  const winner = a === b ? null : a > b ? 'a' : 'b'
  const guests = players.filter((p) => !p.profile_id && !p.is_bot && p.team)
  const undecided = guests.filter((p) => !p.rewards_recipient_id && !p.rewards_skipped)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white/5 p-6 text-center">
        <Trophy className="mx-auto h-10 w-10 text-amber-300" />
        <p className="mt-2 text-2xl font-black">{winner ? `${teamName(session, winner)} ganhou!` : 'Empate!'}</p>
        <p className="mt-1 text-lg text-white/70">
          {teamName(session, 'a')} <strong className="text-white">{a}</strong> · <strong className="text-white">{b}</strong> {teamName(session, 'b')}
        </p>
        <p className="mt-2 text-xs text-white/40">O projetor está a mostrar o pódio.</p>
      </section>

      <section className="space-y-3 rounded-2xl bg-white/5 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Gift className="h-5 w-5 text-amber-300" /> Prémios
        </h2>
        {session.is_test_session ? (
          <p className="text-sm text-white/60">Sessão de teste: não há prémios.</p>
        ) : session.rewards_awarded_at ? (
          <p className="text-sm text-emerald-300">Prémios entregues ✓</p>
        ) : (
          <>
            <p className="text-sm text-white/60">
              Equipa vencedora: 60 XP e 30 Gold por jogador · a outra: 30 XP e 15 Gold · empate: as duas como vencedoras. Os convidados escolhem um
              desbravador para receber os pontos.
            </p>
            {undecided.length > 0 && (
              <p className="text-sm text-amber-300">
                {undecided.length} convidado{undecided.length === 1 ? '' : 's'} ainda não escolheu: {undecided.map((p) => p.display_name).join(', ')}.
                Se entregares já, os pontos deles ficam por dar.
              </p>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => run('award', async () => awardCoroRewards(session.id), 'Prémios entregues!')}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
            >
              <Gift className="h-5 w-5" /> Atribuir XP e Gold
            </button>
          </>
        )}
      </section>

      <div className="flex gap-3">
        <Link href="/jogos/vana-coro" className="rounded-xl border border-white/20 px-4 py-2.5 font-semibold hover:bg-white/10">
          Voltar
        </Link>
        <DeleteButton sessionId={session.id} run={run} pending={pending} />
      </div>
    </div>
  )
}

function DeleteButton({ sessionId, run, pending }: { sessionId: string; run: Run; pending: boolean }) {
  const router = useRouter()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('Apagar esta sessão? Os prémios já entregues ficam.')) return
        run('delete', async () => {
          const r = await deleteCoroSession(sessionId)
          if (!r.error) router.push('/jogos/vana-coro')
          return r
        })
      }}
      className="flex items-center gap-1.5 rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
    >
      <Trash2 className="h-4 w-4" /> Apagar
    </button>
  )
}
