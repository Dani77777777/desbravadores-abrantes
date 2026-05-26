'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Shuffle, Check, AlertTriangle, History, Crown, Skull, Eye, Shield, User } from 'lucide-react'
import {
  getRolePreviewData,
  regenerateRoles,
  updatePlayerRole,
  setMayor,
  confirmRolesAndReveal,
} from '@/lib/actions/vana-camp'
import type {
  VanaCampMayorMode,
  VanaCampPreviewData,
  VanaCampRole,
} from '@/types/vana-camp'

interface Props {
  sessionId: string
  mayorMode: VanaCampMayorMode
  isManualMode: boolean
}

const ROLE_LABEL: Record<VanaCampRole, string> = {
  infiltrator: 'Infiltrado',
  seer: 'Profeta',
  guardian: 'Conselheiro',
  villager: 'Fiel',
}

const ROLE_COLOR: Record<VanaCampRole, string> = {
  infiltrator: 'text-red-400',
  seer: 'text-purple-300',
  guardian: 'text-sky-300',
  villager: 'text-amber-200',
}

const ROLE_ICON: Record<VanaCampRole, typeof User> = {
  infiltrator: Skull,
  seer: Eye,
  guardian: Shield,
  villager: User,
}

export function HostRolePreview({ sessionId, mayorMode, isManualMode }: Props) {
  const router = useRouter()
  const [data, setData] = useState<VanaCampPreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function refresh() {
    const res = await getRolePreviewData(sessionId)
    if (res.error) setError(res.error)
    else if (res.data) setData(res.data)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  function action(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      setError(null)
      const r = await fn()
      if (r.error) setError(r.error)
      await refresh()
    })
  }

  function onConfirm() {
    startTransition(async () => {
      setError(null)
      const r = await confirmRolesAndReveal(sessionId)
      if (r.error) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  if (!data) {
    return (
      <main className="max-w-4xl mx-auto p-8 text-amber-100">
        {error ? <p className="text-red-300">{error}</p> : <p>A carregar…</p>}
      </main>
    )
  }

  const counts = data.current_counts
  const mismatch =
    counts.infiltrators !== data.suggested_counts.infiltrators ||
    counts.seer !== data.suggested_counts.seer ||
    counts.guardian !== data.suggested_counts.guardian ||
    counts.villagers !== data.suggested_counts.villagers

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header className="text-center space-y-1 py-4">
        <h1 className="text-3xl font-black text-amber-100">Revisão dos Papéis</h1>
        <p className="text-amber-300/80 text-sm">
          Antes de revelares — confirma ou ajusta a distribuição.
        </p>
      </header>

      {/* Resumo */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <Card label="Infiltrados" value={counts.infiltrators} expected={data.suggested_counts.infiltrators} color="text-red-400" />
        <Card label="Profetas" value={counts.seer} expected={data.suggested_counts.seer} color="text-purple-300" />
        <Card label="Conselheiros" value={counts.guardian} expected={data.suggested_counts.guardian} color="text-sky-300" />
        <Card label="Fiéis" value={counts.villagers} expected={data.suggested_counts.villagers} color="text-amber-200" />
      </section>

      {mismatch && (
        <div className="bg-amber-950/40 border border-amber-700/40 text-amber-200 rounded p-3 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          A contagem atual difere da sugestão — confirma se é intencional.
        </div>
      )}

      {/* Tabela de jogadores */}
      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-900/60 text-amber-300 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left p-3">Jogador</th>
              <th className="text-left p-3">Papel</th>
              <th className="text-left p-3 hidden md:table-cell">
                <span className="inline-flex items-center gap-1"><History className="w-3 h-3" /> Últimas partidas</span>
              </th>
              {(mayorMode === 'manual' || mayorMode === 'auto') && (
                <th className="text-center p-3"><Crown className="w-4 h-4 inline" /></th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.players.map((p) => {
              const Icon = p.role ? ROLE_ICON[p.role] : User
              return (
                <tr key={p.id} className="border-t border-stone-800">
                  <td className="p-3 text-stone-100 font-medium">{p.display_name}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${p.role ? ROLE_COLOR[p.role] : 'text-stone-500'}`} />
                      <select
                        value={p.role ?? ''}
                        disabled={pending}
                        onChange={(e) =>
                          action(() => updatePlayerRole(sessionId, p.id, e.target.value as VanaCampRole))
                        }
                        className={`bg-stone-950 border border-stone-700 rounded px-2 py-1 ${p.role ? ROLE_COLOR[p.role] : 'text-stone-500'}`}
                      >
                        <option value="" disabled>—</option>
                        <option value="infiltrator">Infiltrado</option>
                        <option value="seer">Profeta</option>
                        <option value="guardian">Conselheiro</option>
                        <option value="villager">Fiel</option>
                      </select>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    {p.recent_history.length === 0 ? (
                      <span className="text-stone-600 text-xs italic">Estreia</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {p.recent_history.map((h, i) => {
                          const repeat = h.role === p.role
                          return (
                            <span
                              key={i}
                              title={h.ended_at ?? ''}
                              className={`text-xs px-1.5 py-0.5 rounded border ${
                                repeat
                                  ? 'border-amber-500 text-amber-300 bg-amber-950/40'
                                  : 'border-stone-700 text-stone-400 bg-stone-900/40'
                              }`}
                            >
                              {ROLE_LABEL[h.role]}{h.was_mayor ? ' ♛' : ''}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </td>
                  {(mayorMode === 'manual' || mayorMode === 'auto') && (
                    <td className="p-3 text-center">
                      <input
                        type="radio"
                        name="mayor"
                        checked={p.is_mayor}
                        disabled={pending}
                        onChange={() => action(() => setMayor(sessionId, p.id))}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {error && (
        <div className="bg-red-950/50 border border-red-700 text-red-200 rounded p-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        {!isManualMode && (
          <button
            onClick={() => action(() => regenerateRoles(sessionId))}
            disabled={pending}
            className="md:w-auto bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-amber-100 font-semibold py-3 px-4 rounded transition flex items-center justify-center gap-2"
          >
            <Shuffle className="w-5 h-5" /> Sortear novamente
          </button>
        )}
        <button
          onClick={onConfirm}
          disabled={pending}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-700 disabled:text-stone-500 text-white font-bold py-3 rounded transition flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" /> Confirmar e revelar
        </button>
      </div>
    </main>
  )
}

function Card({
  label,
  value,
  expected,
  color,
}: {
  label: string
  value: number
  expected: number
  color: string
}) {
  const off = value !== expected
  return (
    <div className={`bg-stone-900/60 border rounded p-3 ${off ? 'border-amber-600/60' : 'border-stone-700'}`}>
      <div className="text-stone-400 text-xs uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-stone-500">sugerido: {expected}</div>
    </div>
  )
}
