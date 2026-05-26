'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Plus, LogIn, ArrowRight } from 'lucide-react'
import {
  createSession,
  joinSessionByCode,
  type CreateSessionInput,
} from '@/lib/actions/vana-camp'
import type {
  VanaCampChatMode,
  VanaCampMayorMode,
  VanaCampRoleAssignmentMode,
} from '@/types/vana-camp'

interface Props {
  canHost: boolean
  initialCode: string
  activeSessions: { id: string; code: string; status: string; host_id: string }[]
  userId: string
}

export function VanaCampHome({ canHost, initialCode, activeSessions, userId }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(initialCode.toUpperCase())
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Config para criar sessão (só host vê)
  const [chatMode, setChatMode] = useState<VanaCampChatMode>('presencial')
  const [mayorMode, setMayorMode] = useState<VanaCampMayorMode>('none')
  const [assignMode, setAssignMode] = useState<VanaCampRoleAssignmentMode>('auto')
  const [isTestSession, setIsTestSession] = useState(false)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setJoining(true)
    const result = await joinSessionByCode(code)
    setJoining(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.sessionId) router.push(`/jogos/vana-camp/${result.sessionId}`)
  }

  async function handleCreate() {
    setError(null)
    setCreating(true)
    try {
      const input: CreateSessionInput = {
        chat_mode: chatMode,
        mayor_mode: mayorMode,
        role_assignment_mode: assignMode,
        is_test_session: isTestSession,
      }
      const sessionId = await createSession(input)
      router.push(`/jogos/vana-camp/${sessionId}/control`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar sessão.')
      setCreating(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <header className="text-center py-6">
        <Image
          src="/images/VanaCamp.png"
          alt="VanaCamp: Infiltrados"
          width={280}
          height={280}
          priority
          className="mx-auto drop-shadow-[0_0_20px_rgba(245,158,11,0.4)]"
        />
      </header>

      {/* Sessões ativas (reconectar) */}
      {activeSessions.length > 0 && (
        <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4 space-y-2">
          <h2 className="text-amber-200 font-semibold text-sm uppercase tracking-wide">
            Voltar a uma partida
          </h2>
          {activeSessions.map((s) => (
            <Link
              key={s.id}
              href={s.host_id === userId ? `/jogos/vana-camp/${s.id}/control` : `/jogos/vana-camp/${s.id}`}
              className="flex items-center justify-between bg-stone-900/60 hover:bg-stone-900 transition rounded p-3 group"
            >
              <div>
                <div className="text-amber-100 font-mono font-bold">{s.code}</div>
                <div className="text-xs text-stone-400">{s.status}</div>
              </div>
              <ArrowRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition" />
            </Link>
          ))}
        </section>
      )}

      {/* Entrar por código */}
      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-6 space-y-4">
        <h2 className="text-amber-100 font-bold text-xl flex items-center gap-2">
          <LogIn className="w-5 h-5" /> Entrar com código
        </h2>
        <form onSubmit={handleJoin} className="space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABCDEF"
            maxLength={6}
            className="w-full bg-stone-950 border border-amber-700/40 rounded px-4 py-3 text-2xl font-mono font-bold text-center tracking-widest text-amber-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={code.length !== 6 || joining}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 disabled:text-stone-500 text-white font-bold py-3 rounded transition"
          >
            {joining ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
      </section>

      {/* Criar sessão (só dirigentes/coordenadores) */}
      {canHost && (
        <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-6 space-y-4">
          <h2 className="text-amber-100 font-bold text-xl flex items-center gap-2">
            <Plus className="w-5 h-5" /> Criar nova partida
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-amber-200 block">Discussão de dia</span>
              <select
                value={chatMode}
                onChange={(e) => setChatMode(e.target.value as VanaCampChatMode)}
                className="w-full bg-stone-950 border border-amber-700/40 rounded px-2 py-2 text-stone-100"
              >
                <option value="presencial">Presencial</option>
                <option value="remote">No site (chat)</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-amber-200 block">Diretor do Clube</span>
              <select
                value={mayorMode}
                onChange={(e) => setMayorMode(e.target.value as VanaCampMayorMode)}
                className="w-full bg-stone-950 border border-amber-700/40 rounded px-2 py-2 text-stone-100"
              >
                <option value="none">Sem Diretor</option>
                <option value="auto">Sorteado</option>
                <option value="vote_day1">Eleito no dia 1</option>
                <option value="manual">Escolhido pelo host</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-amber-200 block">Atribuição de papéis</span>
              <select
                value={assignMode}
                onChange={(e) => setAssignMode(e.target.value as VanaCampRoleAssignmentMode)}
                className="w-full bg-stone-950 border border-amber-700/40 rounded px-2 py-2 text-stone-100"
              >
                <option value="auto">Automática</option>
                <option value="auto_custom">Auto + customizada</option>
                <option value="manual">Manual</option>
              </select>
            </label>
          </div>

          <p className="text-xs text-stone-400">
            Em qualquer dos modos, vais poder rever e ajustar os papéis antes do jogo começar.
          </p>

          <label className="flex items-start gap-2 bg-purple-950/30 border border-purple-700/40 rounded p-3 cursor-pointer hover:bg-purple-950/50 transition">
            <input
              type="checkbox"
              checked={isTestSession}
              onChange={(e) => setIsTestSession(e.target.checked)}
              className="w-5 h-5 mt-0.5 accent-purple-500"
            />
            <div className="text-sm">
              <div className="text-purple-200 font-semibold">Sessão de teste</div>
              <div className="text-purple-300/70 text-xs">
                Permite adicionar jogadores-bot que controlas pelo painel. Não dá XP/Gold.
              </div>
            </div>
          </label>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-700 text-white font-bold py-3 rounded transition"
          >
            {creating ? 'A criar…' : 'Criar sala'}
          </button>
        </section>
      )}

      {error && (
        <div className="bg-red-950/50 border border-red-700 text-red-200 rounded p-3 text-sm">
          {error}
        </div>
      )}
    </main>
  )
}
