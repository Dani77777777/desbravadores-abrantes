'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize, MonitorSmartphone, Volume2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { timerLocalChannelName, type TimerLocalMessage, type TimerScreenState } from '@/utils/timer'
import { unlockTimerSound } from '@/utils/timer-sound'
import { TimerStage } from './TimerStage'

type Screen = { state: TimerScreenState; anchor: number }

/**
 * `anchor` = hora local em que `elapsedMs` era verdade. Numa mensagem que acabou de
 * chegar é "agora" (imune a relógios desacertados entre dispositivos); num estado lido
 * ao abrir/religar usa-se a hora de envio, que é o melhor que há.
 */
function received(state: TimerScreenState, live: boolean): Screen {
  return { state, anchor: live ? Date.now() : state.sentAt }
}

export function TimerProjector({ userId, initialState }: { userId: string; initialState: TimerScreenState | null }) {
  const [supabase] = useState(() => createClient())
  const [screen, setScreen] = useState<Screen | null>(() => (initialState?.config ? received(initialState, false) : null))
  const [soundOn, setSoundOn] = useState(false)
  const [isFull, setIsFull] = useState(false)
  // Enquanto um controlo aberto NESTE computador está ligado, ignora a base de dados.
  const localActiveRef = useRef(false)

  const refetch = useCallback(
    async (live: boolean) => {
      if (localActiveRef.current) return
      const { data } = await supabase.from('timer_screens').select('state').eq('host_id', userId).maybeSingle()
      const state = data?.state as TimerScreenState | undefined
      if (state?.config && !localActiveRef.current) setScreen(received(state, live))
    },
    [supabase, userId],
  )

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(timerLocalChannelName(userId))
    const send = (m: TimerLocalMessage) => bc.postMessage(m)
    bc.onmessage = (ev: MessageEvent<TimerLocalMessage>) => {
      const m = ev.data
      if (m.type === 'state') {
        localActiveRef.current = true
        // Mesmo computador → mesmo relógio: a hora de envio é exata.
        setScreen({ state: m.state, anchor: m.state.sentAt })
      } else if (m.type === 'bye' && m.from === 'controller') {
        localActiveRef.current = false
        refetch(false)
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
      .channel(`timer-screen-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timer_screens', filter: `host_id=eq.${userId}` },
        (payload) => {
          if (localActiveRef.current) return
          const state = (payload.new as { state?: TimerScreenState } | null)?.state
          if (state?.config) setScreen(received(state, true))
          else refetch(true)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refetch(false)
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
    unlockTimerSound()
    setSoundOn(true)
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <div ref={rootRef} className="relative h-screen w-screen overflow-hidden bg-slate-950 text-white">
      {screen ? (
        <TimerStage state={screen.state} anchor={screen.anchor} variant="projector" sound={soundOn} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950 px-10 text-center">
          <MonitorSmartphone className="h-20 w-20 text-blue-300" />
          <p className="mt-6 text-4xl font-black">À espera do cronómetro…</p>
          <p className="mt-3 max-w-2xl text-xl text-blue-200">
            Abre o Cronómetro noutra janela deste computador, ou no telemóvel com esta mesma conta e liga &quot;Controlar a partir
            do telemóvel&quot;.
          </p>
        </div>
      )}

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
