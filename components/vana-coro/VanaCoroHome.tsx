'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronRight, FlaskConical, Loader2, MessageCircleQuestion, Play, Plus } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { createCoroSession, joinCoroSession } from '@/lib/actions/vana-coro-game'
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
  mySessions: { id: string; code: string; status: string; is_test_session: boolean }[]
}

export interface FoundSession {
  id: string
  code: string
  team_a_name: string
  team_b_name: string
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
      .select('id, code, team_a_name, team_b_name')
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
            {mySessions.length > 0 && (
              <ul className="space-y-1">
                {mySessions.map((s) => (
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
