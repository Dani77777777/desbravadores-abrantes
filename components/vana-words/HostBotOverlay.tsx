'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bot, EyeOff, User, Crown, UserCog } from 'lucide-react'
import { TEAM_LABELS } from '@/types/vana-words'
import type { VanaWordsPlayer } from '@/types/vana-words'

interface Props {
  sessionId: string
  players: VanaWordsPlayer[]
}

/**
 * Overlay flutuante visível apenas em sessões de teste.
 * Lista os jogadores/bots e permite abrir o ecrã de cada bot num separador novo
 * para o impersonar (jogar como ele). Inspirado no HostDebugOverlay do VanaCamp.
 */
export function HostBotOverlay({ sessionId, players }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="bg-purple-700 hover:bg-purple-600 text-white rounded-full p-3.5 shadow-lg shadow-purple-900/50"
          title="Abrir painel de bots"
        >
          <Bot className="w-5 h-5" />
        </button>
      ) : (
        <div className="bg-slate-950/95 border border-purple-700 rounded-2xl shadow-2xl text-sm overflow-hidden backdrop-blur w-72">
          <div className="bg-purple-900/60 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-purple-100 font-semibold">
              <Bot className="w-4 h-4" /> Bots (teste)
            </div>
            <button onClick={() => setOpen(false)} className="text-purple-300 hover:text-white">
              <EyeOff className="w-4 h-4" />
            </button>
          </div>

          <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800">
            {players.map((p) => {
              const teamLabel = p.team ? TEAM_LABELS[p.team] : null
              const teamColor = p.team === 'a' ? 'text-amber-300' : p.team === 'b' ? 'text-blue-300' : 'text-slate-500'
              return (
                <li key={p.id} className="px-3 py-2 flex items-center gap-2">
                  {p.is_bot ? (
                    <Bot className="w-4 h-4 text-purple-400 shrink-0" />
                  ) : (
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="text-slate-100 flex-1 truncate text-xs">{p.display_name}</span>
                  {p.is_arauto && <Crown className="w-3 h-3 text-yellow-300 shrink-0" />}
                  {teamLabel && (
                    <span className={`text-[10px] font-bold ${teamColor} shrink-0`}>
                      {p.team === 'a' ? '🦁' : '🦅'}
                    </span>
                  )}
                  {p.is_bot && (
                    <Link
                      href={`/jogos/vana-words/${sessionId}/as/${p.id}`}
                      target="_blank"
                      className="text-slate-500 hover:text-purple-300 transition shrink-0"
                      title="Abrir o ecrã deste bot num separador novo"
                    >
                      <UserCog className="w-4 h-4" />
                    </Link>
                  )}
                </li>
              )
            })}
            {players.length === 0 && (
              <li className="px-3 py-3 text-slate-500 text-xs text-center">Sem jogadores ainda.</li>
            )}
          </ul>
          <div className="px-3 py-2 bg-slate-900 text-slate-500 text-[10px]">
            🤖 = bot &middot; <UserCog className="inline w-3 h-3" /> abre o ecrã do bot para jogares como ele
          </div>
        </div>
      )}
    </div>
  )
}
