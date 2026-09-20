'use client'

import { useEffect, useState } from 'react'
import { Sunset, VenetianMask, Eye, Shield, User, Crown, Smile, Frown } from 'lucide-react'
import { getDayResult } from '@/lib/actions/vana-camp'
import { useLiveSession } from './useLiveSession'
import { usePhaseReload } from './usePhaseReload'
import { usePhaseCountdown } from './usePhaseCountdown'
import type { VanaCampRole } from '@/types/vana-camp'

interface Props {
  sessionId: string
  dayNumber: number
  phaseEndsAt: string | null
  phasePausedAt: string | null
}

const ROLE_META: Record<VanaCampRole, { label: string; icon: typeof User; bg: string; tone: string }> = {
  infiltrator: { label: 'INFILTRADO', icon: VenetianMask, bg: 'from-red-900 via-stone-950 to-stone-900', tone: 'text-red-300' },
  seer: { label: 'PROFETA', icon: Eye, bg: 'from-purple-900 via-stone-950 to-stone-900', tone: 'text-purple-300' },
  guardian: { label: 'CONSELHEIRO', icon: Shield, bg: 'from-sky-900 via-stone-950 to-stone-900', tone: 'text-sky-300' },
  villager: { label: 'DESBRAVADOR', icon: User, bg: 'from-amber-900 via-stone-950 to-stone-900', tone: 'text-amber-200' },
}

/**
 * Ecrã dramático: revela quem foi para casa e qual era o seu papel.
 * Mostrado a TODOS (no acampamento e em casa) — é a catarse do dia.
 */
export function DayResultScreen({ sessionId, dayNumber, phaseEndsAt, phasePausedAt }: Props) {
  const live = useLiveSession(sessionId, {
    status: 'day_result',
    phase_ends_at: phaseEndsAt,
    phase_paused_at: phasePausedAt,
    day_number: dayNumber,
  })
  usePhaseReload(sessionId, 'day_result')
  const remaining = usePhaseCountdown(live.phase_ends_at, live.phase_paused_at)

  const [result, setResult] = useState<Awaited<ReturnType<typeof getDayResult>> | null>(null)

  useEffect(() => {
    getDayResult(sessionId, dayNumber).then(setResult)
  }, [sessionId, dayNumber])

  if (!result) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-900 text-amber-100">
        A apurar votos…
      </main>
    )
  }

  if (!result.eliminated) {
    // Empate sem desempate do Diretor → ninguém vai para casa
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-stone-700 via-stone-900 to-stone-950 text-amber-100">
        <Sunset className="w-20 h-20 text-orange-400 mb-4 drop-shadow-lg" />
        <h1 className="text-4xl font-black mb-3">Hoje ninguém vai para casa</h1>
        <p className="text-stone-300 text-lg max-w-md">
          A assembleia não chegou a um acordo. Ninguém vai para casa esta tarde — o acampamento continua.
        </p>
        {remaining !== null && <p className="text-stone-400 text-sm mt-6">{remaining}s</p>}
      </main>
    )
  }

  const meta = result.eliminated.role ? ROLE_META[result.eliminated.role] : null
  const Icon = meta?.icon ?? User

  return (
    <main className={`min-h-screen flex flex-col items-center justify-center p-8 text-center text-stone-100 bg-gradient-to-br ${meta?.bg ?? 'from-stone-800 via-stone-900 to-stone-950'}`}>
      <Sunset className="w-16 h-16 text-orange-400 mb-4 drop-shadow-lg" />
      <p className="uppercase tracking-[0.3em] text-orange-300/80 text-xs mb-2">Veredito do Dia {dayNumber}</p>

      <div className="space-y-3 animate-in fade-in zoom-in duration-700">
        <h1 className="text-4xl md:text-5xl font-black">
          {result.eliminated.name} vai para casa
        </h1>
        {result.eliminated.role && meta && (
          <div className={`inline-flex flex-col items-center gap-3 mt-4 ${meta.tone}`}>
            <Icon className="w-20 h-20 drop-shadow-[0_0_20px_currentColor]" strokeWidth={1.5} />
            <p className="text-sm uppercase tracking-widest">era</p>
            <p className="text-3xl md:text-4xl font-black">{meta.label}</p>
          </div>
        )}
      </div>

      {result.mayor_tiebreak_used && (
        <p className="text-amber-300 mt-6 text-sm flex items-center gap-2">
          <Crown className="w-4 h-4" /> O voto do Diretor desempatou
        </p>
      )}

      {result.eliminated.role === 'infiltrator' ? (
        <p className="text-emerald-300 mt-4 flex items-center gap-2">
          <Smile className="w-5 h-5" /> Um Infiltrado a menos!
        </p>
      ) : (
        <p className="text-red-300 mt-4 flex items-center gap-2">
          <Frown className="w-5 h-5" /> Um Desbravador a menos…
        </p>
      )}

      {remaining !== null && (
        <p className="text-stone-400 text-sm mt-8">A noite cai em {remaining}s</p>
      )}
    </main>
  )
}
