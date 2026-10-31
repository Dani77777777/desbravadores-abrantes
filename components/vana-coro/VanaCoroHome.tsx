'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronRight, FlaskConical, History, Loader2, MessageCircleQuestion, Play, Plus, Trash2, Trophy } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { createCoroSession, deleteCoroSession, joinCoroSession } from '@/lib/actions/vana-coro-game'
import { CORO_BG, TEAM_STYLE } from './BoardUI'
import { PLAYER_STORAGE_KEY } from './PlayerView'
import type { VanaCoroTeam } from '@/types/vana-coro'

interface Props {
  canHost: boolean
  isCoordinator: boolean
  isMember: boolean
  initialCode: string
  /** Sessão do ?code= (QR), já procurada no servidor. */
  initialFound: FoundSession | null
  /** As sessões deste anfitrião (a decorrer e anteriores), da mais recente para a mais antiga. */
  mySessions: HostSession[]
}

export interface HostSession {
  id: string
  code: string
  status: string
  is_test_session: boolean
  created_at: string
  ended_at: string | null
  team_a_name: string
  team_b_name: string
  team_a_score: number
  team_b_score: number
  rewards_awarded_at: string | null
}

export interface FoundSession {
  id: string
  code: string
  team_a_name: string
  team_b_name: string
  status: string
}

export function VanaCoroHome({ canHost, isCoordinator, isMember, initialCode, initialFound, mySessions }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [code, setCode] = useState(initialCode)
  const [found, setFound] = useState<FoundSession | null>(initialFound)
  const [name, setName] = useState('')

  async function lookup(value: string) {
    const clean = value.trim().toUpperCase()
    if (clean.length !== 4) return
    const { data } = await createClient()
      .from('vanacoro_sessions')
      .select('id, code, team_a_name, team_b_name, status')
      .eq('code', clean)
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) setFound(data)
    else toast.error('Não há nenhum jogo com esse código.')
  }

  function join(team: VanaCoroTeam) {
    if (!found) return
    startTransition(async () => {
      const r = await joinCoroSession({ code: found.code, team, guestName: isMember ? undefined : name })
      if (r.error || !r.playerId || !r.sessionId) {
        toast.error(r.error ?? 'Não foi possível entrar.')
        return
      }
      try {
        localStorage.setItem(PLAYER_STORAGE_KEY(r.sessionId), r.playerId)
      } catch {
        /* modo privado: os membros não precisam; os convidados perdem-se se recarregarem */
      }
      router.push(`/jogos/vana-coro/${r.sessionId}`)
    })
  }

  function create(isTest: boolean) {
    startTransition(async () => {
      const r = await createCoroSession(isTest)
      if (r.error || !r.id) toast.error(r.error ?? 'Não foi possível criar.')
      else router.push(`/jogos/vana-coro/${r.id}/control`)
    })
  }

  return (
    <div className={`min-h-screen text-white ${CORO_BG}`}>
      <main className="mx-auto max-w-md space-y-6 px-4 py-10">
        <div className="text-center">
          <img src="/images/VanaCoro.png" alt="" className="mx-auto h-24 w-24 rounded-3xl shadow-2xl" />
          <h1 className="mt-3 text-4xl font-black tracking-tight">VanaCoro</h1>
          <p className="font-semibold text-amber-300">O que é que o JA disse?</p>
        </div>

        <section className="rounded-3xl bg-white/10 p-5">
          {!found ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                lookup(code)
              }}
              className="space-y-3"
            >
              <label className="block text-sm font-semibold text-white/80" htmlFor="coro-code">
                Código do jogo
              </label>
              <input
                id="coro-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
                placeholder="ABCD"
                autoComplete="off"
                className="w-full rounded-2xl bg-white px-4 py-3 text-center font-mono text-3xl font-black tracking-[0.4em] text-purple-950 outline-none"
              />
              <button
                type="submit"
                disabled={code.length !== 4}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3 font-bold text-purple-950 disabled:opacity-40"
              >
                Continuar <ChevronRight className="h-5 w-5" />
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-sm text-white/70">
                Jogo <strong className="font-mono">{found.code}</strong>
              </p>
              {found.status !== 'lobby' ? (
                <>
                  <p className="rounded-2xl bg-black/20 p-4 text-center font-semibold">
                    O jogo já começou e as equipas estão fechadas. Fica a ver no projetor! 📺
                  </p>
                  {isMember && (
                    // Quem já estava no jogo (ex.: fechou o separador) volta para a sua equipa.
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => join('a')}
                      className="w-full rounded-2xl bg-amber-400 py-3 font-bold text-purple-950 disabled:opacity-40"
                    >
                      Já estou no jogo: voltar
                    </button>
                  )}
                </>
              ) : (
                <>
                  {!isMember && (
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={20}
                      placeholder="O teu nome"
                      className="w-full rounded-2xl bg-white px-4 py-3 text-purple-950 outline-none"
                    />
                  )}
                  <p className="text-center font-bold">Escolhe a tua equipa</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['a', 'b'] as VanaCoroTeam[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={pending || (!isMember && name.trim().length < 2)}
                        onClick={() => join(t)}
                        className={`rounded-2xl py-6 text-xl font-black shadow-lg transition-transform active:scale-95 disabled:opacity-40 ${TEAM_STYLE[t].bg}`}
                      >
                        {t === 'a' ? found.team_a_name : found.team_b_name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {pending && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
              <button type="button" onClick={() => setFound(null)} className="w-full text-sm text-white/60 underline">
                Outro código
              </button>
            </div>
          )}
        </section>

        {canHost && (
          <section className="space-y-3 rounded-3xl bg-black/20 p-5">
            <h2 className="font-bold">Anfitrião</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => create(false)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-fuchsia-600 py-2.5 font-semibold hover:bg-fuchsia-500 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Novo jogo
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => create(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-purple-700 py-2.5 font-semibold hover:bg-purple-600 disabled:opacity-40"
              >
                <FlaskConical className="h-4 w-4" /> Teste (bots)
              </button>
            </div>
            {mySessions.some((s) => s.status !== 'finished') && (
              <ul className="space-y-1">
                {mySessions.filter((s) => s.status !== 'finished').map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/jogos/vana-coro/${s.id}/control`}
                      className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                    >
                      <Play className="h-4 w-4 text-fuchsia-300" />
                      <span className="font-mono font-bold tracking-widest">{s.code}</span>
                      <span className="text-white/50">{s.status === 'lobby' ? 'sala de espera' : 'a decorrer'}</span>
                      {s.is_test_session && <span className="text-xs text-purple-300">teste</span>}
                      <ChevronRight className="ml-auto h-4 w-4 text-white/40" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <PastGames sessions={mySessions.filter((s) => s.status === 'finished')} />
            {isCoordinator && (
              <Link href="/admin/vana-coro" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
                <MessageCircleQuestion className="h-4 w-4" /> Gerir as perguntas
              </Link>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

/** Partidas que já acabaram: o resultado, abrir o fim (prémios) e apagar. */
function PastGames({ sessions }: { sessions: HostSession[] }) {
  const router = useRouter()
  const [deleting, startDelete] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (sessions.length === 0) return null

  function remove(s: HostSession) {
    const warning = s.rewards_awarded_at ? ' Os prémios que já foram entregues ficam.' : ''
    if (!window.confirm(`Apagar a partida ${s.code} (${s.team_a_name} ${s.team_a_score} · ${s.team_b_score} ${s.team_b_name})?${warning}`)) return
    setBusyId(s.id)
    startDelete(async () => {
      const r = await deleteCoroSession(s.id)
      if (r.error) toast.error(r.error)
      else {
        toast.success('Partida apagada')
        router.refresh()
      }
      setBusyId(null)
    })
  }

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-white/80">
        <History className="h-4 w-4" /> Partidas anteriores
      </h3>
      <ul className="space-y-1.5">
        {sessions.map((s) => {
          const winner = s.team_a_score === s.team_b_score ? null : s.team_a_score > s.team_b_score ? 'a' : 'b'
          return (
            <li key={s.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
              <Link href={`/jogos/vana-coro/${s.id}/control`} className="min-w-0 flex-1 hover:text-white">
                <span className="flex items-center gap-1.5 text-xs text-white/50">
                  {new Date(s.ended_at ?? s.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {s.is_test_session && <span className="text-purple-300">· teste</span>}
                  {!s.is_test_session && !s.rewards_awarded_at && <span className="text-amber-300">· prémios por entregar</span>}
                </span>
                <span className="flex items-center gap-1 truncate font-semibold">
                  {winner && <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
                  <span className={winner === 'a' ? 'text-amber-200' : ''}>{s.team_a_name}</span>
                  <span className="tabular-nums text-white/70">
                    {s.team_a_score} · {s.team_b_score}
                  </span>
                  <span className={winner === 'b' ? 'text-amber-200' : ''}>{s.team_b_name}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(s)}
                disabled={deleting}
                className="rounded-lg p-1.5 text-white/40 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
                aria-label={`Apagar a partida ${s.code}`}
              >
                {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
