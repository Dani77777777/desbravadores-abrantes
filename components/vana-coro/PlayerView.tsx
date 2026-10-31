'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bot, Crown, Gift, Loader2, Zap } from 'lucide-react'
import { buzz, setCoroRewardsRecipient, skipCoroRewards } from '@/lib/actions/vana-coro-game'
import { vibrate } from '@/utils/vibrate'
import { CORO_BG, CoroBoard, StrikeMarks, TEAM_STYLE } from './BoardUI'
import { teamName, useCoroBoard, useCoroPlayers, useCoroSession } from './useCoroLive'
import type { VanaCoroPlayer, VanaCoroSession } from '@/types/vana-coro'

export const PLAYER_STORAGE_KEY = (sessionId: string) => `vanacoro_player_${sessionId}`

interface Props {
  session: VanaCoroSession
  initialPlayers: VanaCoroPlayer[]
  /** Membros: o servidor já sabe quem é. Convidados: vem do localStorage. */
  myPlayerId: string | null
  /** Desbravadores a quem um convidado pode dar os pontos. */
  recipients: { id: string; name: string }[]
  /** O anfitrião a fazer de bot (sessões de teste). */
  asBot?: boolean
}

function readStoredPlayer(sessionId: string): string | null {
  try {
    return localStorage.getItem(PLAYER_STORAGE_KEY(sessionId))
  } catch {
    return null
  }
}

const noSubscribe = () => () => {}

/**
 * Telemóvel de um jogador: a equipa, as pontuações e o quadro revelado. O capitão
 * tem o "Já sei!" durante o duelo. Nunca recarrega a página (perdia-se a vibração).
 */
export function PlayerView({ session: initial, initialPlayers, myPlayerId, recipients, asBot }: Props) {
  const session = useCoroSession(initial)
  const players = useCoroPlayers(session.id, initialPlayers)
  const round = useCoroBoard(session)
  // Convidados: o id só existe neste browser (no servidor ainda não se sabe).
  const stored = useSyncExternalStore(noSubscribe, () => readStoredPlayer(session.id), () => null)
  const checked = useSyncExternalStore(noSubscribe, () => true, () => !!myPlayerId)
  const playerId = myPlayerId ?? stored

  const me = players.find((p) => p.id === playerId) ?? null

  if (!checked) return <Shell>{null}</Shell>
  if (!me) {
    return (
      <Shell>
        <div className="mt-24 text-center">
          <p className="text-xl font-bold">Ainda não estás neste jogo.</p>
          <Link
            href={`/jogos/vana-coro?code=${session.code}`}
            className="mt-4 inline-block rounded-2xl bg-amber-400 px-5 py-3 font-bold text-purple-950"
          >
            Entrar com o código {session.code}
          </Link>
        </div>
      </Shell>
    )
  }

  const team = me.team
  const mine = team === 'a' ? session.team_a_score : session.team_b_score
  const theirs = team === 'a' ? session.team_b_score : session.team_a_score

  return (
    <Shell>
      <header className={`rounded-2xl p-3 text-center ${team ? TEAM_STYLE[team].bg : 'bg-white/10'}`}>
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white/80">
          {asBot && <Bot className="h-4 w-4" />}
          {me.display_name}
          {me.is_captain && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-black/20 px-2 text-xs font-bold">
              <Crown className="h-3 w-3 text-amber-300" /> Capitão
            </span>
          )}
        </p>
        <p className="text-2xl font-black">{teamName(session, team)}</p>
      </header>

      {session.status === 'lobby' && (
        <div className="mt-6 text-center">
          <p className="text-lg font-semibold">Estás dentro! 🎉</p>
          <p className="mt-1 text-white/70">Olha para o projetor: o jogo começa daqui a pouco.</p>
          {me.is_captain && (
            <p className="mt-4 rounded-2xl bg-amber-400/20 p-3 text-sm text-amber-100">
              És o capitão: no duelo de cada ronda vais ter um botão <strong>“Já sei!”</strong>. Quem carregar primeiro responde primeiro.
            </p>
          )}
          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {players
              .filter((p) => p.team === team)
              .map((p) => (
                <li key={p.id} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                  {p.display_name}
                </li>
              ))}
          </ul>
        </div>
      )}

      {session.status === 'playing' && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-white/10 p-2">
              <p className="text-xs text-white/60">A tua equipa</p>
              <p className="text-3xl font-black tabular-nums">{mine}</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-2">
              <p className="text-xs text-white/60">{teamName(session, team === 'a' ? 'b' : 'a')}</p>
              <p className="text-3xl font-black tabular-nums text-white/70">{theirs}</p>
            </div>
          </div>

          {me.is_captain && session.phase === 'faceoff' && (
            <BuzzButton session={session} playerId={me.id} myTeam={team} />
          )}

          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-white/50">
            Ronda {session.current_round}/{session.total_rounds}
            {round?.multiplier === 2 && <span className="ml-2 text-amber-300">×2</span>}
          </p>
          <h2 className="mt-1 text-lg font-bold leading-snug">{round?.prompt}</h2>
          <div className="mt-3">{round && <CoroBoard slots={round.slots} size="small" />}</div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-white/60">
              Pote <strong className="text-amber-300">{session.round_pot}</strong>
            </span>
            {session.phase === 'playing' && <StrikeMarks strikes={session.strikes} size="small" />}
          </div>
          {session.control_team && (session.phase === 'playing' || session.phase === 'steal') && (
            <p className="mt-2 text-center text-sm font-semibold">
              {session.phase === 'steal'
                ? session.control_team === team
                  ? 'A outra equipa vai tentar roubar…'
                  : 'É a vossa vez de roubar! Uma tentativa só.'
                : session.control_team === team
                  ? 'A vossa equipa tem o controlo!'
                  : 'A outra equipa tem o controlo.'}
            </p>
          )}
        </>
      )}

      {session.status === 'finished' && (
        <Finished session={session} me={me} recipients={recipients} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`min-h-screen text-white ${CORO_BG}`}>
      <main className="mx-auto max-w-md px-4 py-5">{children}</main>
    </div>
  )
}

function BuzzButton({ session, playerId, myTeam }: { session: VanaCoroSession; playerId: string; myTeam: VanaCoroPlayer['team'] }) {
  const [pending, startTransition] = useTransition()
  const vibrated = useRef<string>('')

  // Vibra quando começa o duelo de cada ronda
  useEffect(() => {
    const key = `${session.current_round}`
    if (vibrated.current !== key && !session.buzzed_team) {
      vibrated.current = key
      vibrate('alert')
    }
  }, [session.current_round, session.buzzed_team])

  if (session.buzzed_team) {
    const won = session.buzzed_team === myTeam
    return (
      <div className={`mt-4 rounded-3xl p-6 text-center text-xl font-black ${won ? 'bg-emerald-500' : 'bg-white/10 text-white/70'}`}>
        {won ? 'Foste o primeiro! Diz a resposta! 🎤' : 'A outra equipa foi mais rápida…'}
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        vibrate('short')
        startTransition(async () => {
          const r = await buzz(session.id, playerId)
          if (r.error) toast.error(r.error)
        })
      }}
      className="mt-4 flex h-44 w-full items-center justify-center gap-3 rounded-[2rem] bg-gradient-to-b from-red-500 to-red-700 text-4xl font-black shadow-[0_10px_0_#7f1d1d] transition-transform active:translate-y-2 active:shadow-[0_2px_0_#7f1d1d] disabled:opacity-70"
    >
      {pending ? <Loader2 className="h-10 w-10 animate-spin" /> : <Zap className="h-10 w-10" />} Já sei!
    </button>
  )
}

function Finished({
  session,
  me,
  recipients,
}: {
  session: VanaCoroSession
  me: VanaCoroPlayer
  recipients: { id: string; name: string }[]
}) {
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState(me.rewards_recipient_id ?? '')
  const a = session.team_a_score
  const b = session.team_b_score
  const winner = a === b ? null : a > b ? 'a' : 'b'
  const isGuest = !me.profile_id && !me.is_bot
  const canChoose = isGuest && !session.is_test_session && !session.rewards_awarded_at

  return (
    <div className="mt-6 space-y-4 text-center">
      <p className="text-3xl font-black">
        {winner === null ? 'Empate! 🤝' : winner === me.team ? 'Ganharam! 🏆' : 'Boa luta! 💪'}
      </p>
      <p className="text-white/70">
        {teamName(session, 'a')} {a} · {b} {teamName(session, 'b')}
      </p>

      {canChoose && (
        <div className="rounded-3xl bg-white/10 p-4 text-left">
          <p className="flex items-center gap-2 font-bold">
            <Gift className="h-5 w-5 text-amber-300" /> Os teus pontos
          </p>
          <p className="mt-1 text-sm text-white/70">Como convidado, podes oferecer o teu XP e Gold a um desbravador.</p>
          <select
            value={choice}
            onChange={(e) => {
              const id = e.target.value
              setChoice(id)
              if (!id) return
              startTransition(async () => {
                const r = await setCoroRewardsRecipient(me.id, id)
                if (r.error) toast.error(r.error)
                else toast.success('Obrigado! 🎁')
              })
            }}
            disabled={pending}
            className="mt-3 w-full rounded-xl bg-white px-3 py-2.5 text-purple-950"
          >
            <option value="">Escolhe um desbravador…</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {!me.rewards_skipped && !choice && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await skipCoroRewards(me.id)
                  if (r.error) toast.error(r.error)
                })
              }
              className="mt-2 w-full text-sm text-white/60 underline"
            >
              Não, obrigado
            </button>
          )}
        </div>
      )}
      {!isGuest && !me.is_bot && !session.is_test_session && (
        <p className="text-sm text-white/60">
          {session.rewards_awarded_at ? 'Os prémios já foram entregues: vê o teu histórico de pontos.' : 'O anfitrião vai entregar os prémios daqui a pouco.'}
        </p>
      )}
    </div>
  )
}
