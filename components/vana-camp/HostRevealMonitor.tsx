'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Skull, Shield, User, Crown, Bot } from 'lucide-react'
import { getAllRolesForHost } from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { HostAlertPanel } from './HostAlertPanel'
import { StartNightButton } from './HostNightMonitor'
import { StartMayorElectionButton } from './StartMayorElectionButton'
import type { VanaCampRole } from '@/types/vana-camp'

interface Props {
  sessionId: string
  phaseEndsAt: string | null
  /** Quando 'vote_day1', mostra o botão de eleição em vez de "Começar Noite". */
  mayorMode?: 'none' | 'auto' | 'vote_day1' | 'manual'
}

interface Row {
  id: string
  display_name: string
  role: VanaCampRole | null
  is_mayor: boolean
  is_bot: boolean
  is_alive: boolean
}

const ROLE_LABEL: Record<VanaCampRole, string> = {
  infiltrator: 'Infiltrado',
  seer: 'Profeta',
  guardian: 'Conselheiro',
  villager: 'Fiel',
}
const ROLE_COLOR: Record<VanaCampRole, string> = {
  infiltrator: 'text-red-300 bg-red-950/40 border-red-800/50',
  seer: 'text-purple-300 bg-purple-950/40 border-purple-800/50',
  guardian: 'text-sky-300 bg-sky-950/40 border-sky-800/50',
  villager: 'text-amber-200 bg-amber-950/40 border-amber-800/50',
}
const ROLE_ICON: Record<VanaCampRole, typeof User> = {
  infiltrator: Skull,
  seer: Eye,
  guardian: Shield,
  villager: User,
}

/**
 * Vista do NARRADOR durante o role_reveal.
 * Mostra todos os jogadores e os seus papéis, com countdown.
 */
export function HostRevealMonitor({ sessionId, phaseEndsAt, mayorMode }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    getAllRolesForHost(sessionId).then((r) => r.players && setRows(r.players))
  }, [sessionId])

  useEffect(() => {
    if (!phaseEndsAt) return
    const end = new Date(phaseEndsAt).getTime()
    const tick = () => setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000)))
    tick()
    const i = setInterval(tick, 250)
    return () => clearInterval(i)
  }, [phaseEndsAt])

  // Quando o host avança para a próxima fase
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`vc_hrm_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vanacamp_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const s = (payload.new as { status?: string }).status
          if (s && s !== 'role_reveal') router.refresh()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId, router])

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <header className="text-center space-y-2 py-4">
        <Eye className="w-10 h-10 text-amber-400 mx-auto" />
        <h1 className="text-3xl font-black text-amber-100">Os jogadores estão a ler os seus papéis…</h1>
        {remaining !== null && (
          <p className="text-amber-300 text-sm">
            Ecrã deles esconde-se em <span className="font-bold text-2xl text-amber-200">{remaining}s</span>
          </p>
        )}
      </header>

      <section className="bg-stone-800/60 border border-amber-700/40 rounded-lg p-4">
        <h2 className="text-amber-200 font-semibold text-sm uppercase tracking-wide mb-3">
          Papéis atribuídos
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {rows.map((p) => {
            const Icon = p.role ? ROLE_ICON[p.role] : User
            const colorClass = p.role ? ROLE_COLOR[p.role] : 'text-stone-400 bg-stone-900 border-stone-700'
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-3 py-2 rounded border ${colorClass}`}
              >
                {p.is_bot ? <Bot className="w-4 h-4 text-purple-300 shrink-0" /> : <User className="w-4 h-4 shrink-0" />}
                <span className="text-stone-100 font-medium flex-1 truncate">{p.display_name}</span>
                {p.is_mayor && <Crown className="w-4 h-4 text-amber-300" />}
                {p.role && (
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    <Icon className="w-4 h-4" /> {ROLE_LABEL[p.role]}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className="text-center">
        {mayorMode === 'vote_day1' ? (
          <StartMayorElectionButton sessionId={sessionId} />
        ) : (
          <StartNightButton sessionId={sessionId} />
        )}
        <p className="text-stone-500 text-xs mt-2">
          Carrega quando achares que todos já leram o seu papel.
        </p>
      </div>

      <HostAlertPanel
        sessionId={sessionId}
        players={rows.map((r) => ({ id: r.id, display_name: r.display_name, is_alive: r.is_alive }))}
      />
    </main>
  )
}
