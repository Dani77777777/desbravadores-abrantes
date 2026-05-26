'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Flame, LogOut, Users, Bot } from 'lucide-react'
import { leaveSession } from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { usePlayerList } from './usePlayerList'
import { useVibrationSignal } from './useVibrationSignal'
import { usePhaseReload } from './usePhaseReload'

interface Props {
  sessionId: string
  code: string
  /** Quando definido, este lobby está a representar um bot (impersonação pelo host). */
  myPlayerId?: string
  impersonatingBotName?: string
}

export function PlayerLobby({ sessionId, code, myPlayerId, impersonatingBotName }: Props) {
  const router = useRouter()
  const { players, loading } = usePlayerList(sessionId)
  const [leaving, setLeaving] = useState(false)
  // Para jogadores reais (sem impersonação), descobrir o próprio player_id
  // para receber sinais de vibração.
  const [resolvedPlayerId, setResolvedPlayerId] = useState<string | null>(myPlayerId ?? null)
  useEffect(() => {
    if (myPlayerId) return
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('vanacamp_players_public')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) setResolvedPlayerId(data.id)
    })
  }, [sessionId, myPlayerId])
  useVibrationSignal(sessionId, resolvedPlayerId)
  usePhaseReload(sessionId, 'lobby')

  async function handleLeave() {
    if (!confirm('Sair desta sala?')) return
    setLeaving(true)
    const result = await leaveSession(sessionId)
    if (result.error) {
      alert(result.error)
      setLeaving(false)
    } else {
      router.push('/jogos/vana-camp')
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
      {impersonatingBotName && (
        <div className="bg-purple-900/60 border border-purple-500 rounded-lg p-3 flex items-center gap-2 text-purple-100 text-sm">
          <Bot className="w-5 h-5" />
          <span>Estás a controlar <strong>{impersonatingBotName}</strong> (modo teste).</span>
        </div>
      )}
      <header className="text-center space-y-2 py-6">
        <Flame className="w-12 h-12 text-amber-400 mx-auto" />
        <h1 className="text-3xl font-black text-amber-100">À volta da fogueira</h1>
        <p className="text-amber-300/80">À espera que o jogo comece…</p>
      </header>

      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-6 text-center">
        <div className="text-xs uppercase tracking-wider text-amber-300 mb-2">Código da sala</div>
        <div className="text-5xl font-mono font-black text-amber-100 tracking-widest">
          {code}
        </div>
      </section>

      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4">
        <h2 className="text-amber-200 font-semibold flex items-center gap-2 mb-3 text-sm uppercase tracking-wide">
          <Users className="w-4 h-4" /> Jogadores ({players.length})
        </h2>
        {loading ? (
          <p className="text-stone-400 text-sm">A carregar…</p>
        ) : (
          <ul className="space-y-1">
            {players.map((p) => (
              <li
                key={p.id}
                className="bg-stone-900/60 rounded px-3 py-2 text-stone-100"
              >
                {p.display_name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!impersonatingBotName && (
        <button
          onClick={handleLeave}
          disabled={leaving}
          className="w-full bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-300 py-2 rounded transition flex items-center justify-center gap-2 text-sm"
        >
          <LogOut className="w-4 h-4" /> {leaving ? 'A sair…' : 'Sair da sala'}
        </button>
      )}
    </main>
  )
}
