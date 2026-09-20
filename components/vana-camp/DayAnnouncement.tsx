'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sunrise, Home, Shield, Trophy, VenetianMask } from 'lucide-react'
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
    const infWin = winnerSide === 'infiltrators'
    return (
      <main className={`min-h-screen flex flex-col items-center justify-center text-center px-6 py-12 text-white bg-gradient-to-br ${
        infWin ? 'from-red-950 via-stone-900 to-red-950' : 'from-amber-600 via-orange-500 to-yellow-400'
      }`}>
        <div className="flex flex-col items-center gap-5 sm:gap-6 max-w-sm w-full animate-in fade-in zoom-in duration-700">
          <div className={`rounded-full p-5 sm:p-6 ring-4 ${
            infWin ? 'bg-red-500/15 ring-red-400/30' : 'bg-white/15 ring-white/25'
          }`}>
            {infWin
              ? <VenetianMask className="w-16 h-16 sm:w-20 sm:h-20 text-red-200 drop-shadow-lg" />
              : <Trophy className="w-16 h-16 sm:w-20 sm:h-20 text-amber-50 drop-shadow-lg" />}
          </div>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight text-balance">
            {infWin ? 'Vitória dos Infiltrados!' : 'Vitória dos Desbravadores!'}
          </h1>
          <p className={`text-base sm:text-xl text-balance ${infWin ? 'text-red-100/90' : 'text-amber-50/95'}`}>
            {infWin
              ? 'Os Infiltrados ficaram com o acampamento.'
              : 'Todos os Infiltrados foram descobertos. O acampamento está a salvo!'}
          </p>
          <Link
            href="/jogos/vana-camp"
            className="mt-3 inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 active:bg-white/30 border border-white/30 rounded-full px-6 py-2.5 font-semibold backdrop-blur transition"
          >
            Voltar ao início
          </Link>
        </div>
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
            <Home className="w-8 h-8 text-stone-700" />
            <p className="text-lg">
              <strong className="text-red-700">{(death.payload as { target_name?: string }).target_name ?? 'Alguém'}</strong>{' '}
              ficou com medo esta noite e <strong>foi para casa</strong>.
            </p>
          </div>
        )}
        {save && !death && (
          <div className="flex items-center gap-3 justify-center text-stone-900">
            <Shield className="w-8 h-8 text-sky-700" />
            <p className="text-lg">
              O <strong>Conselheiro</strong> acalmou os ânimos esta noite. Ninguém foi para casa!
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
