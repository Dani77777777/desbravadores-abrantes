'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize, MonitorSmartphone, Users, UsersRound, Volume2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { teamsLocalChannelName, type TeamsLocalMessage, type TeamsScreenState } from '@/utils/teams'
import { unlockRaffleSound } from '@/utils/raffle-sound'
import { TeamsBoard } from './TeamsBoard'

/**
 * `embedded`: dentro do Ecrã do Clube, que já trata do som e do ecrã inteiro (sem botão próprio).
 */
export function TeamsProjector({
  userId,
  initialState,
  embedded = false,
  sound = false,
}: {
  userId: string
  initialState: TeamsScreenState | null
  embedded?: boolean
  sound?: boolean
}) {
  const [supabase] = useState(() => createClient())
  const [screen, setScreen] = useState<TeamsScreenState | null>(initialState?.teams ? initialState : null)
  // Uma revelação que já existia quando o ecrã abriu aparece logo completa (sem animação).
  const [instantId, setInstantId] = useState<string | null>(initialState?.revealId ?? null)
  const [soundOnLocal, setSoundOn] = useState(false)
  const soundOn = embedded ? sound : soundOnLocal
  const [isFull, setIsFull] = useState(false)
  const localActiveRef = useRef(false)

  const refetch = useCallback(async () => {
    if (localActiveRef.current) return
    const { data } = await supabase.from('team_screens').select('state').eq('host_id', userId).maybeSingle()
    const state = data?.state as TeamsScreenState | undefined
    if (state?.teams && !localActiveRef.current) setScreen(state)
  }, [supabase, userId])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(teamsLocalChannelName(userId))
    const send = (m: TeamsLocalMessage) => bc.postMessage(m)
    bc.onmessage = (ev: MessageEvent<TeamsLocalMessage>) => {
      const m = ev.data
      if (m.type === 'state') {
        if (!localActiveRef.current) {
          // Primeiro contacto: uma revelação que já tinha sido feita aparece logo completa
          localActiveRef.current = true
          setInstantId(m.state.revealId)
        }
        setScreen(m.state)
      } else if (m.type === 'bye' && m.from === 'controller') {
        localActiveRef.current = false
        refetch()
      }
    }
    send({ type: 'hello' })
    const ping = setInterval(() => send({ type: 'ping' }), 2000)
    const onHide = () => send({ type: 'bye', from: 'projector' })
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(ping)
      window.removeEventListener('pagehide', onHide)
      onHide()
      bc.close()
    }
  }, [userId, refetch])

  useEffect(() => {
    const channel = supabase
      .channel(`team-screen-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_screens', filter: `host_id=eq.${userId}` }, () =>
        refetch(),
      )
      .subscribe((status) => {
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

  const revealed = !!screen?.revealId && screen.teams.length > 0

  return (
    <div
      ref={rootRef}
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950 text-white"
    >
      <header className="flex items-center justify-between px-[4vh] pt-[3vh]">
        <p className="flex items-center gap-3 text-[3.2vh] font-black uppercase tracking-widest text-blue-200">
          <UsersRound className="h-[4vh] w-[4vh]" /> Equipas
        </p>
        {screen?.title && <p className="max-w-[55%] truncate text-[3.2vh] font-bold text-blue-200/80">{screen.title}</p>}
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-[4vh] py-[3vh]">
        {revealed ? (
          <TeamsBoard
            key={screen!.revealId!}
            teams={screen!.teams}
            revealId={screen!.revealId!}
            instant={screen!.revealId === instantId}
            sound={soundOn}
          />
        ) : screen ? (
          <div className="flex flex-col items-center text-center">
            <p className="flex items-center gap-4 text-[10vh] font-black leading-none">
              <Users className="h-[9vh] w-[9vh] text-amber-300" /> {screen.peopleCount}
            </p>
            <p className="mt-[2vh] text-[4vh] font-bold text-blue-200">
              {screen.peopleCount === 1 ? 'pessoa' : 'pessoas'} à espera das equipas…
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <MonitorSmartphone className="h-20 w-20 text-blue-300" />
            <p className="mt-6 text-4xl font-black">À espera do formador de equipas…</p>
            <p className="mt-3 max-w-2xl text-xl text-blue-200">
              Abre o Formador de equipas noutra janela deste computador, ou no telemóvel com esta mesma conta e liga &quot;Controlar a
              partir do telemóvel&quot;.
            </p>
          </div>
        )}
      </main>

      {!embedded && (!soundOn || !isFull) && (
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
