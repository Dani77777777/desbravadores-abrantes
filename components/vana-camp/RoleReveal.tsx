'use client'

import { useEffect, useState } from 'react'
import { Skull, Eye, Shield, User, Crown, Bot } from 'lucide-react'
import { getMyRoleInSession } from '@/lib/actions/vana-camp'
import { createClient } from '@/utils/supabase/client'
import { vibrate } from '@/utils/vibrate'
import { useVibrationSignal } from './useVibrationSignal'
import { VibrationFlash } from './VibrationFlash'
import { usePhaseReload } from './usePhaseReload'
import type { VanaCampRole } from '@/types/vana-camp'

interface Props {
  sessionId: string
  phaseEndsAt: string | null
  /** Quando definido, mostra o papel deste bot em vez do papel do utilizador. */
  impersonatingBot?: {
    id: string
    display_name: string
    role: VanaCampRole | null
    is_mayor: boolean
  }
}

const ROLE_META: Record<VanaCampRole, {
  label: string
  flavor: string
  icon: typeof User
  color: string
  bg: string
}> = {
  infiltrator: {
    label: 'Infiltrado',
    flavor: 'Sabota o acampamento à noite. Não deixes que te descubram.',
    icon: Skull,
    color: 'text-red-300',
    bg: 'from-red-950 via-stone-950 to-stone-900',
  },
  seer: {
    label: 'Profeta',
    flavor: 'À noite, escolhe alguém e descobre se é Fiel ou Infiltrado.',
    icon: Eye,
    color: 'text-purple-300',
    bg: 'from-purple-950 via-stone-950 to-stone-900',
  },
  guardian: {
    label: 'Conselheiro',
    flavor: 'À noite, protege um desbravador da sabotagem.',
    icon: Shield,
    color: 'text-sky-300',
    bg: 'from-sky-950 via-stone-950 to-stone-900',
  },
  villager: {
    label: 'Desbravador Fiel',
    flavor: 'Sem poder noturno, mas tens voz e voto durante o dia.',
    icon: User,
    color: 'text-amber-200',
    bg: 'from-amber-950 via-stone-950 to-stone-900',
  },
}

export function RoleReveal({ sessionId, phaseEndsAt, impersonatingBot }: Props) {
  const [role, setRole] = useState<VanaCampRole | null>(impersonatingBot?.role ?? null)
  const [isMayor, setIsMayor] = useState(impersonatingBot?.is_mayor ?? false)
  const [fellow, setFellow] = useState<{ id: string; display_name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(impersonatingBot?.id ?? null)

  const { needsGesture, flash } = useVibrationSignal(sessionId, myPlayerId)
  usePhaseReload(sessionId, 'role_reveal')

  useEffect(() => {
    if (impersonatingBot) return
    getMyRoleInSession(sessionId).then((r) => {
      if (r.error) setError(r.error)
      else {
        setRole(r.role ?? null)
        setIsMayor(!!r.is_mayor)
        setFellow(r.fellow_infiltrators ?? [])
      }
    })
    // Buscar o próprio player_id para a vibração funcionar
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('vanacamp_players_public')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) setMyPlayerId(data.id)
    })
  }, [sessionId, impersonatingBot])

  // Vibração suave a indicar que o papel apareceu
  useEffect(() => { if (role) vibrate('short') }, [role])

  // Countdown visual
  useEffect(() => {
    if (!phaseEndsAt) return
    const end = new Date(phaseEndsAt).getTime()
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemaining(left)
    }
    tick()
    const i = setInterval(tick, 250)
    return () => clearInterval(i)
  }, [phaseEndsAt])

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-900 text-red-300 p-8 text-center">
        {error}
      </main>
    )
  }
  if (!role) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-900 text-amber-100 p-8">
        A revelar o teu papel…
      </main>
    )
  }

  const meta = ROLE_META[role]
  const Icon = meta.icon

  return (
    <main className={`min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br ${meta.bg}`}>
      <VibrationFlash flash={flash} needsGesture={needsGesture} />
      {impersonatingBot && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-purple-900/80 border border-purple-500 rounded-full px-4 py-1.5 flex items-center gap-2 text-purple-100 text-xs z-10">
          <Bot className="w-4 h-4" />
          A controlar <strong>{impersonatingBot.display_name}</strong>
        </div>
      )}
      <div className="max-w-md w-full text-center space-y-6 animate-in fade-in duration-700">
        <div className="text-amber-300/70 text-sm uppercase tracking-widest">
          {impersonatingBot ? `${impersonatingBot.display_name} é…` : 'És…'}
        </div>

        <div className={`inline-flex flex-col items-center gap-4 ${meta.color}`}>
          <Icon className="w-24 h-24 drop-shadow-[0_0_20px_currentColor]" strokeWidth={1.5} />
          <h1 className="text-5xl md:text-6xl font-black">{meta.label}</h1>
          {isMayor && (
            <div className="inline-flex items-center gap-2 text-amber-300 bg-amber-950/40 border border-amber-700/50 rounded-full px-4 py-1 text-sm">
              <Crown className="w-4 h-4" /> Diretor do Clube
            </div>
          )}
        </div>

        <p className="text-stone-300 text-lg leading-relaxed">{meta.flavor}</p>

        {role === 'infiltrator' && fellow.length > 0 && (
          <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-4 text-left">
            <div className="text-red-300 text-sm font-semibold mb-2">Os teus companheiros infiltrados:</div>
            <ul className="space-y-1 text-red-100">
              {fellow.map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <Skull className="w-4 h-4 text-red-400" />
                  {f.display_name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {remaining !== null && (
          <div className="text-stone-400 text-sm">
            Memoriza bem — esta vista desaparece em <span className="font-bold text-amber-200">{remaining}s</span>
          </div>
        )}
      </div>
    </main>
  )
}
