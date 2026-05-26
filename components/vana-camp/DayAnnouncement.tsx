'use client'

import { useEffect, useState } from 'react'
import { Sunrise, Skull, Shield, Trophy } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { usePhaseCountdown } from './usePhaseCountdown'
import { usePhaseReload } from './usePhaseReload'
import type { VanaCampEvent, VanaCampSide } from '@/types/vana-camp'

interface Props {
  sessionId: string
  dayNumber: number
  phaseEndsAt: string | null
  phasePausedAt: string | null
  winnerSide?: VanaCampSide | null
}

/**
 * Mostra o resultado da noite acabada de resolver.
 * Lê os eventos do dia (`death`, `save`, `night_resolved`, `win`).
 */
export function DayAnnouncement({ sessionId, dayNumber, phaseEndsAt, phasePausedAt, winnerSide }: Props) {
  usePhaseReload(sessionId, winnerSide ? 'finished' : 'day_announce')
  const remaining = usePhaseCountdown(phaseEndsAt, phasePausedAt)
  const [events, setEvents] = useState<VanaCampEvent[]>([])

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data } = await supabase
        .from('vanacamp_events')
        .select('*')
        .eq('session_id', sessionId)
        .eq('day_number', dayNumber)
        .in('event_type', ['death', 'save', 'night_resolved', 'win'])
        .order('created_at', { ascending: true })
      if (data) setEvents(data as VanaCampEvent[])
    }
    load()
  }, [sessionId, dayNumber])

  if (winnerSide) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-amber-700 via-orange-600 to-yellow-500 text-white">
        <Trophy className="w-24 h-24 mb-4 drop-shadow-lg" />
        <h1 className="text-5xl font-black mb-2">
          {winnerSide === 'infiltrators' ? 'Vitória dos Infiltrados!' : 'Vitória dos Desbravadores!'}
        </h1>
        <p className="text-xl text-amber-100">
          {winnerSide === 'infiltrators'
            ? 'O acampamento foi sabotado.'
            : 'Todos os infiltrados foram desmascarados.'}
        </p>
      </main>
    )
  }

  const death = events.find((e) => e.event_type === 'death')
  const save = events.find((e) => e.event_type === 'save')
  const nobody = events.find((e) => e.event_type === 'night_resolved')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-amber-200 via-amber-400 to-orange-500 text-stone-900">
      <Sunrise className="w-20 h-20 text-amber-700 mb-4 drop-shadow-lg" />
      <p className="text-amber-900 text-sm uppercase tracking-widest font-bold">Dia {dayNumber}</p>
      <h1 className="text-3xl md:text-4xl font-black text-stone-900 mb-4 mt-2">
        O Sol nasce no horizonte
      </h1>

      <div className="max-w-md bg-white/40 backdrop-blur rounded-lg p-5 border border-amber-700/30 shadow-lg">
        {death && (
          <div className="flex items-center gap-3 justify-center text-stone-900">
            <Skull className="w-8 h-8 text-stone-700" />
            <p className="text-lg">
              <strong className="text-red-700">{(death.payload as { target_name?: string }).target_name ?? 'Alguém'}</strong>{' '}
              foi <strong>sabotado</strong> esta noite e foi para a cozinha lavar a loiça.
            </p>
          </div>
        )}
        {save && !death && (
          <div className="flex items-center gap-3 justify-center text-stone-900">
            <Shield className="w-8 h-8 text-sky-700" />
            <p className="text-lg">
              O <strong>Conselheiro</strong> salvou um desbravador esta noite. Ninguém morreu!
            </p>
          </div>
        )}
        {nobody && !death && !save && (
          <p className="text-lg text-stone-800">
            Nada de mau aconteceu esta noite. O acampamento continua a postos.
          </p>
        )}
      </div>

      {remaining !== null && (
        <p className="text-amber-900/70 text-sm mt-6">A discussão começa em {remaining}s</p>
      )}
    </main>
  )
}
