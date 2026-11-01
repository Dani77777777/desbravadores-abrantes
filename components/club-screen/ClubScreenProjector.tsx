'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize, Volume2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getClubApp, isClubStage, type ClubScreenState, type ClubStage } from '@/utils/club-screen'
import { unlockTimerSound } from '@/utils/timer-sound'
import { unlockRaffleSound } from '@/utils/raffle-sound'
import type { TimerScreenState } from '@/utils/timer'
import type { RaffleScreenState } from '@/utils/raffle'
import type { TeamsScreenState } from '@/utils/teams'
import { TimerProjector } from '@/components/timer/TimerProjector'
import { RaffleProjector } from '@/components/raffle/RaffleProjector'
import { TeamsProjector } from '@/components/teams/TeamsProjector'
import { useClubScreen } from './useClubScreen'
import { LogoStage } from './LogoStage'
import { RankingBoard } from './RankingBoard'
import { CheckinStage } from './CheckinStage'

/**
 * Ecrã do Clube no projetor: mostra o logo, o ranking, o QR das presenças ou o ecrã de uma
 * ferramenta (cronómetro, sorteio, equipas), conforme o que se escolhe no controlo.
 * Dentro da app do clube o som e o ecrã inteiro já vêm ligados.
 */
export function ClubScreenProjector({ userId, initialState }: { userId: string; initialState: ClubScreenState }) {
  const { state, update } = useClubScreen(userId, initialState, 'projector')
  const [inApp, setInApp] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [isFull, setIsFull] = useState(false)

  // App do clube: o som pode tocar sem clique, e ela própria pede ferramentas para o ecrã
  // (quando se carrega em "Abrir janela do projetor" numa ferramenta).
  useEffect(() => {
    const app = getClubApp()
    if (!app) return
    unlockTimerSound()
    unlockRaffleSound()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInApp(true)
    setSoundOn(true)
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('stage')
    if (isClubStage(fromUrl)) {
      update((s) => ({ ...s, stage: fromUrl }))
      params.delete('stage')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
    return app.onShowStage((stage) => {
      if (isClubStage(stage)) update((s) => ({ ...s, stage }))
    })
  }, [update])

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const rootRef = useRef<HTMLDivElement>(null)
  const start = () => {
    unlockTimerSound()
    unlockRaffleSound()
    setSoundOn(true)
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  const stage = state.stage

  return (
    <div ref={rootRef} className={`relative h-screen w-screen overflow-hidden bg-blue-950 text-white ${inApp ? 'cursor-none' : ''}`}>
      <div key={stage} className="cs-stage-in absolute inset-0">
        {stage === 'logo' && <LogoStage />}
        {stage === 'ranking' && <RankingBoard settings={state.ranking} />}
        {stage === 'checkin' && <CheckinStage eventId={state.checkin.eventId} />}
        {(stage === 'timer' || stage === 'raffle' || stage === 'teams') && <ToolStage kind={stage} userId={userId} sound={soundOn} />}
      </div>

      {!inApp && (!soundOn || !isFull) && (
        <button
          type="button"
          onClick={start}
          className="absolute bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-blue-100 ring-1 ring-white/15 backdrop-blur hover:bg-white/20"
        >
          {!soundOn ? <Volume2 className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          {!soundOn ? 'Clicar para ativar som e ecrã inteiro' : 'Ecrã inteiro'}
        </button>
      )}
    </div>
  )
}

const TOOL_TABLE = { timer: 'timer_screens', raffle: 'raffle_screens', teams: 'team_screens' } as const

/**
 * Ecrã de uma ferramenta. Vai buscar o estado atual antes de a mostrar, para um sorteio
 * ou equipas que já tinham sido revelados aparecerem logo (sem repetir a animação).
 */
function ToolStage({ kind, userId, sound }: { kind: Exclude<ClubStage, 'logo' | 'ranking' | 'checkin'>; userId: string; sound: boolean }) {
  const [supabase] = useState(() => createClient())
  const [initial, setInitial] = useState<{ state: unknown } | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from(TOOL_TABLE[kind])
      .select('state')
      .eq('host_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setInitial({ state: data?.state ?? null })
      })
    return () => {
      cancelled = true
    }
  }, [supabase, kind, userId])

  if (!initial) return <div className="h-full w-full bg-blue-950" />
  if (kind === 'timer')
    return <TimerProjector userId={userId} initialState={initial.state as TimerScreenState | null} embedded sound={sound} />
  if (kind === 'raffle')
    return <RaffleProjector userId={userId} initialState={initial.state as RaffleScreenState | null} embedded sound={sound} />
  return <TeamsProjector userId={userId} initialState={initial.state as TeamsScreenState | null} embedded sound={sound} />
}
