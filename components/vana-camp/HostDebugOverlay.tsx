'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bug, EyeOff, VenetianMask, Shield, User, Crown, Bot, UserCog, Eye } from 'lucide-react'
import { getAllRolesForHost } from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import type { VanaCampRole } from '@/types/vana-camp'

interface Props {
  sessionId: string
}

interface DebugPlayer {
  id: string
  display_name: string
  role: VanaCampRole | null
  is_mayor: boolean
  is_bot: boolean
  is_alive: boolean
}

const ROLE_LABEL: Record<VanaCampRole, string> = {
  infiltrator: 'Inf',
  seer: 'Pro',
  guardian: 'Con',
  villager: 'Fie',
}

const ROLE_COLOR: Record<VanaCampRole, string> = {
  infiltrator: 'text-red-300',
  seer: 'text-purple-300',
  guardian: 'text-sky-300',
  villager: 'text-amber-200',
}

const ROLE_ICON: Record<VanaCampRole, typeof User> = {
  infiltrator: VenetianMask,
  seer: Eye,
  guardian: Shield,
  villager: User,
}

/**
 * Overlay flutuante visível apenas em sessões de teste.
 * Mostra papéis (debug) e link de impersonação dos bots.
 * NÃO inclui controlos de jogo — esses estão no HostAlertPanel/HostControlPanel.
 */
export function HostDebugOverlay({ sessionId }: Props) {
  const [players, setPlayers] = useState<DebugPlayer[]>([])
  const [open, setOpen] = useState(true)

  async function refresh() {
    const r = await getAllRolesForHost(sessionId)
    if (r.players) setPlayers(r.players)
  }

  useEffect(() => {
    refresh()
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_debug_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vanacamp_events', filter: `session_id=eq.${sessionId}` }, () => refresh())
      .subscribe()
    const i = setInterval(refresh, 4000)
    return () => { supabase.removeChannel(ch); clearInterval(i) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="bg-purple-700 hover:bg-purple-600 text-white rounded-full p-3 shadow-lg"
          title="Abrir painel de debug"
        >
          <Bug className="w-5 h-5" />
        </button>
      ) : (
        <div className="bg-stone-950/95 border border-purple-700 rounded-lg shadow-2xl text-sm overflow-hidden backdrop-blur w-72">
          <div className="bg-purple-900/60 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-purple-100 font-semibold">
              <Bug className="w-4 h-4" /> Debug (teste)
            </div>
            <button onClick={() => setOpen(false)} className="text-purple-300 hover:text-white">
              <EyeOff className="w-4 h-4" />
            </button>
          </div>

          <ul className="max-h-80 overflow-y-auto divide-y divide-stone-800">
            {players.map((p) => {
              const Icon = p.role ? ROLE_ICON[p.role] : User
              return (
                <li key={p.id} className={`px-3 py-2 flex items-center gap-2 ${!p.is_alive ? 'opacity-50' : ''}`}>
                  {p.is_bot ? (
                    <Bot className="w-4 h-4 text-purple-400 shrink-0" />
                  ) : (
                    <User className="w-4 h-4 text-stone-400 shrink-0" />
                  )}
                  <span className="text-stone-100 flex-1 truncate text-xs">{p.display_name}</span>
                  {p.is_mayor && <Crown className="w-3 h-3 text-amber-300" />}
                  {p.role && (
                    <span className={`flex items-center gap-1 ${ROLE_COLOR[p.role]} font-bold text-xs`}>
                      <Icon className="w-3 h-3" /> {ROLE_LABEL[p.role]}
                    </span>
                  )}
                  {p.is_bot && (
                    <Link
                      href={`/jogos/vana-camp/${sessionId}/as/${p.id}`}
                      target="_blank"
                      className="text-stone-500 hover:text-amber-300 transition"
                      title="Abrir o ecrã deste bot num separador novo"
                    >
                      <UserCog className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="px-3 py-2 bg-stone-900 text-stone-500 text-[10px]">
            🤖 = bot &middot; <UserCog className="inline w-3 h-3" /> abre ecrã do bot
          </div>
        </div>
      )}
    </div>
  )
}
