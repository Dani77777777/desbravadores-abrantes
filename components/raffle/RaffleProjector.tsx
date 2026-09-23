'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize, Shuffle, Smartphone, Users, Volume2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { RaffleScreenState } from '@/utils/raffle'
import { unlockRaffleSound } from '@/utils/raffle-sound'
import { RaffleStage } from './RaffleStage'

export function RaffleProjector({ userId, initialState }: { userId: string; initialState: RaffleScreenState | null }) {
  const [supabase] = useState(() => createClient())
  const [screen, setScreen] = useState<RaffleScreenState | null>(initialState)
  // Um sorteio que já existia quando o ecrã abriu mostra logo o resultado (sem rodar).
  const [instantDrawId] = useState<string | null>(initialState?.draw?.id ?? null)
  const [soundOn, setSoundOn] = useState(false)
  const [isFull, setIsFull] = useState(false)

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('raffle_screens').select('state').eq('host_id', userId).maybeSingle()
    if (data) setScreen(data.state as RaffleScreenState)
  }, [supabase, userId])

  useEffect(() => {
    const channel = supabase
      .channel(`raffle-screen-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raffle_screens', filter: `host_id=eq.${userId}` }, () =>
        refetch(),
      )
      .subscribe((status) => {
        // (Re)ligou — apanha o que possa ter mudado entretanto
        if (status === 'SUBSCRIBED') refetch()
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId, refetch])

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const rootRef = useRef<HTMLDivElement>(null)
  const start = () => {
    unlockRaffleSound()
    setSoundOn(true)
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  const draw = screen?.draw ?? null
  const pool = screen?.pool ?? []

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950 text-white"
    >
      <header className="flex items-center justify-between px-10 pt-8">
        <p className="flex items-center gap-3 text-2xl font-black uppercase tracking-widest text-blue-200">
          <Shuffle className="h-8 w-8" /> Sorteio
        </p>
        {screen?.title && <p className="max-w-[50%] truncate text-2xl font-bold text-blue-200/80">{screen.title}</p>}
      </header>

      <main className="flex flex-1 items-center justify-center px-10 py-8">
        {draw ? (
          <RaffleStage
            key={draw.id}
            draw={draw}
            variant="projector"
            sound={soundOn}
            instant={draw.id === instantDrawId}
          />
        ) : screen ? (
          <div className="flex w-full max-w-6xl flex-col items-center text-center">
            <p className="flex items-center gap-4 text-7xl font-black">
              <Users className="h-16 w-16 text-amber-300" /> {pool.length}
            </p>
            <p className="mt-2 text-3xl font-bold text-blue-200">{pool.length === 1 ? 'pessoa em jogo' : 'pessoas em jogo'}</p>
            {pool.length > 0 && (
              <div className="mt-12 flex max-h-[50vh] flex-wrap justify-center gap-3 overflow-hidden">
                {pool.map((p) => (
                  <span key={p.id} className="rounded-full bg-white/10 px-5 py-2 text-2xl font-bold text-white/90 ring-1 ring-white/10">
                    {p.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <Smartphone className="h-20 w-20 text-blue-300" />
            <p className="mt-6 text-4xl font-black">À espera do telemóvel…</p>
            <p className="mt-3 max-w-2xl text-xl text-blue-200">
              No telemóvel, abre Gestão → Ferramentas → Sorteador com esta mesma conta e liga &quot;Mostrar no projetor&quot;.
            </p>
          </div>
        )}
      </main>

      {(!soundOn || !isFull) && (
        <button
          type="button"
          onClick={start}
          className="absolute bottom-6 right-6 flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-blue-100 ring-1 ring-white/15 backdrop-blur hover:bg-white/20"
        >
          {!soundOn ? <Volume2 className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          {!soundOn ? 'Clicar para ativar som e ecrã inteiro' : 'Ecrã inteiro'}
        </button>
      )}
    </div>
  )
}
