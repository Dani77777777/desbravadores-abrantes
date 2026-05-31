'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Flame, Users, Play, X, AlertTriangle, Bot, Plus, Trash2 } from 'lucide-react'
import {
  advanceToRolePreview,
  cancelSession,
  addTestPlayer,
  removeTestPlayer,
} from '@/lib/actions/vana-camp'
import { rolesDistribution } from '@/utils/vana-camp'
import { usePlayerList } from './usePlayerList'
import type {
  VanaCampChatMode,
  VanaCampMayorMode,
  VanaCampRoleAssignmentMode,
} from '@/types/vana-camp'

interface Props {
  sessionId: string
  code: string
  chatMode: VanaCampChatMode
  mayorMode: VanaCampMayorMode
  assignMode: VanaCampRoleAssignmentMode
  isTestSession: boolean
}

const CHAT_LABEL: Record<VanaCampChatMode, string> = {
  presencial: 'Presencial',
  remote: 'No site (chat)',
}
const MAYOR_LABEL: Record<VanaCampMayorMode, string> = {
  none: 'Sem Diretor',
  auto: 'Sorteado',
  vote_day1: 'Eleito no dia 1',
  manual: 'Escolhido pelo host',
}
const ASSIGN_LABEL: Record<VanaCampRoleAssignmentMode, string> = {
  auto: 'Automática',
  auto_custom: 'Auto + customizada',
  manual: 'Manual',
}

export function HostLobby({ sessionId, code, chatMode, mayorMode, assignMode, isTestSession }: Props) {
  const router = useRouter()
  const { players, loading } = usePlayerList(sessionId)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [botName, setBotName] = useState('')
  const [addingBot, setAddingBot] = useState(false)

  async function handleAddBot() {
    setError(null)
    setAddingBot(true)
    const r = await addTestPlayer(sessionId, botName || undefined)
    setAddingBot(false)
    if (r.error) setError(r.error)
    else setBotName('')
  }

  async function handleRemoveBot(playerId: string) {
    const r = await removeTestPlayer(sessionId, playerId)
    if (r.error) setError(r.error)
  }

  const dist = useMemo(() => {
    if (players.length < 4) return null
    try {
      return rolesDistribution(players.length)
    } catch {
      return null
    }
  }, [players.length])

  async function handleStart() {
    setError(null)
    setStarting(true)
    const result = await advanceToRolePreview(sessionId)
    if (result.error) {
      setError(result.error)
      setStarting(false)
    } else {
      router.refresh()
    }
  }

  async function handleCancel() {
    if (!confirm('Cancelar esta sessão? Não poderá ser recuperada.')) return
    const result = await cancelSession(sessionId)
    if (result.error) {
      alert(result.error)
    } else {
      router.push('/jogos/vana-camp')
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <header className="text-center space-y-2 py-4">
        <Flame className="w-12 h-12 text-amber-400 mx-auto" />
        <h1 className="text-3xl font-black text-amber-100">Painel do Narrador</h1>
        <p className="text-amber-300/80 text-sm">Conduzes o jogo — vês todos os papéis e não jogas.</p>
        <p className="text-stone-400 text-xs">Partilha o código abaixo para os desbravadores entrarem.</p>
      </header>

      {/* Código grande */}
      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-6 md:p-8 text-center overflow-hidden">
        <div className="text-xs uppercase tracking-wider text-amber-300 mb-2">Código da sala</div>
        <div className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-mono font-black text-amber-100 tracking-wider sm:tracking-widest break-all">
          {code}
        </div>
      </section>

      {/* Config resumo */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
        <div className="bg-stone-900/60 border border-stone-700 rounded p-3">
          <div className="text-stone-400 text-xs uppercase tracking-wide">Discussão</div>
          <div className="text-amber-100 font-semibold">{CHAT_LABEL[chatMode]}</div>
        </div>
        <div className="bg-stone-900/60 border border-stone-700 rounded p-3">
          <div className="text-stone-400 text-xs uppercase tracking-wide">Diretor</div>
          <div className="text-amber-100 font-semibold">{MAYOR_LABEL[mayorMode]}</div>
        </div>
        <div className="bg-stone-900/60 border border-stone-700 rounded p-3">
          <div className="text-stone-400 text-xs uppercase tracking-wide">Papéis</div>
          <div className="text-amber-100 font-semibold">{ASSIGN_LABEL[assignMode]}</div>
        </div>
      </section>

      {/* Lista de jogadores */}
      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4">
        <h2 className="text-amber-200 font-semibold flex items-center gap-2 mb-3 text-sm uppercase tracking-wide">
          <Users className="w-4 h-4" /> Jogadores ({players.length})
        </h2>
        {loading ? (
          <p className="text-stone-400 text-sm">A carregar…</p>
        ) : players.length === 0 ? (
          <p className="text-stone-400 text-sm italic">Ninguém na sala ainda.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {players.map((p) => (
              <li
                key={p.id}
                className="bg-stone-900/60 rounded px-3 py-2 text-stone-100 flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  {p.is_bot && <Bot className="w-4 h-4 text-purple-300" />}
                  {p.display_name}
                  {p.is_bot && (
                    <span className="text-[10px] uppercase tracking-wider bg-purple-900/60 text-purple-200 px-1.5 py-0.5 rounded">
                      teste
                    </span>
                  )}
                </span>
                {isTestSession && p.is_bot && (
                  <button
                    onClick={() => handleRemoveBot(p.id)}
                    className="text-stone-400 hover:text-red-400 transition"
                    title="Remover bot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Painel de bots (só em sessões de teste) */}
      {isTestSession && (
        <section className="bg-purple-950/30 border border-purple-700/40 rounded-lg p-4 space-y-3">
          <h2 className="text-purple-200 font-semibold flex items-center gap-2 text-sm uppercase tracking-wide">
            <Bot className="w-4 h-4" /> Modo de teste — adicionar bots
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              placeholder="Nome (opcional)"
              className="flex-1 bg-stone-950 border border-purple-700/40 rounded px-3 py-2 text-stone-100 placeholder:text-stone-500 text-sm focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={handleAddBot}
              disabled={addingBot}
              className="bg-purple-700 hover:bg-purple-600 disabled:bg-stone-700 text-white font-semibold px-4 rounded transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Bot
            </button>
          </div>
          <p className="text-xs text-purple-300/70">
            Os bots não recebem XP/Gold. Vais controlar as ações deles pelo painel à medida que o jogo avança.
          </p>
        </section>
      )}

      {/* Distribuição prevista */}
      {dist && (
        <section className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-4 text-sm">
          <div className="text-emerald-300 font-semibold mb-2">Distribuição sugerida</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-stone-200">
            <div><span className="text-red-400 font-bold">{dist.infiltrators}</span> Infiltrado(s)</div>
            <div><span className="text-purple-300 font-bold">{dist.seer}</span> Profeta</div>
            <div><span className="text-sky-300 font-bold">{dist.guardian}</span> Conselheiro</div>
            <div><span className="text-amber-200 font-bold">{dist.villagers}</span> Fiéis</div>
          </div>
          <p className="text-stone-400 text-xs mt-2">
            Poderás ajustar antes de revelar aos jogadores.
          </p>
        </section>
      )}

      {players.length < 4 && (
        <div className="bg-amber-950/40 border border-amber-700/40 text-amber-200 rounded p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          São precisos pelo menos 4 jogadores.
        </div>
      )}

      {error && (
        <div className="bg-red-950/50 border border-red-700 text-red-200 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-col md:flex-row gap-3">
        <button
          onClick={handleStart}
          disabled={players.length < 4 || starting}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-700 disabled:text-stone-500 text-white font-bold py-3 rounded transition flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5" /> {starting ? 'A iniciar…' : 'Iniciar jogo'}
        </button>
        <button
          onClick={handleCancel}
          className="md:w-auto bg-stone-800 hover:bg-red-900 text-stone-300 hover:text-red-100 py-3 px-4 rounded transition flex items-center justify-center gap-2"
        >
          <X className="w-5 h-5" /> Cancelar sessão
        </button>
      </div>
    </main>
  )
}
