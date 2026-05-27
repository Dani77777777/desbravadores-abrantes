import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { HostLobby } from '@/components/vana-camp/HostLobby'
import { HostRolePreview } from '@/components/vana-camp/HostRolePreview'
import { HostRevealMonitor } from '@/components/vana-camp/HostRevealMonitor'
import { HostNightMonitor } from '@/components/vana-camp/HostNightMonitor'
import { HostDayMonitor } from '@/components/vana-camp/HostDayMonitor'
import { DayAnnouncement } from '@/components/vana-camp/DayAnnouncement'
import { HostDebugOverlay } from '@/components/vana-camp/HostDebugOverlay'
import { OpenPresentButton } from '@/components/vana-camp/OpenPresentButton'

export default async function VanaCampControlPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/jogos/vana-camp/${sessionId}/control`)

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()
  if (session.host_id !== user.id) redirect(`/jogos/vana-camp/${sessionId}`)

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900">
      <OpenPresentButton sessionId={sessionId} />
      {children}
      {session.is_test_session && <HostDebugOverlay sessionId={sessionId} />}
    </div>
  )

  if (session.status === 'lobby') {
    return wrap(
      <HostLobby
        sessionId={sessionId}
        code={session.code}
        chatMode={session.chat_mode}
        mayorMode={session.mayor_mode}
        assignMode={session.role_assignment_mode}
        isTestSession={session.is_test_session}
      />
    )
  }

  if (session.status === 'role_preview') {
    return wrap(
      <HostRolePreview
        sessionId={sessionId}
        mayorMode={session.mayor_mode}
        isManualMode={session.role_assignment_mode === 'manual'}
      />
    )
  }

  if (session.status === 'role_reveal') {
    return wrap(<HostRevealMonitor sessionId={sessionId} phaseEndsAt={session.phase_ends_at} />)
  }

  if (
    session.status === 'night_infiltrators' ||
    session.status === 'night_seer' ||
    session.status === 'night_guardian'
  ) {
    // Lista de jogadores para o painel de alerta
    const service = createServiceClient()
    const { data: players } = await service
      .from('vanacamp_players')
      .select('id, display_name, is_alive')
      .eq('session_id', sessionId)
      .order('display_name', { ascending: true })

    return wrap(
      <HostNightMonitor
        sessionId={sessionId}
        status={session.status}
        dayNumber={session.day_number}
        phaseEndsAt={session.phase_ends_at}
        phasePausedAt={session.phase_paused_at}
        allPlayers={players ?? []}
      />
    )
  }

  if (
    session.status === 'day_announce' ||
    session.status === 'day_discussion' ||
    session.status === 'day_vote' ||
    session.status === 'day_result'
  ) {
    const service = createServiceClient()
    const { data: players } = await service
      .from('vanacamp_players')
      .select('id, display_name, is_alive')
      .eq('session_id', sessionId)
      .order('display_name', { ascending: true })

    return wrap(
      <HostDayMonitor
        sessionId={sessionId}
        status={session.status}
        dayNumber={session.day_number}
        phaseEndsAt={session.phase_ends_at}
        phasePausedAt={session.phase_paused_at}
        allPlayers={players ?? []}
      />
    )
  }

  if (session.status === 'finished') {
    return wrap(
      <DayAnnouncement
        sessionId={sessionId}
        dayNumber={session.day_number}
        phaseEndsAt={null}
        phasePausedAt={null}
        winnerSide={session.winner_side}
      />
    )
  }

  return wrap(
    <div className="min-h-screen flex items-center justify-center text-amber-100 p-8 text-center">
      <div>
        <p className="text-2xl font-bold mb-2">Painel de controlo</p>
        <p className="text-stone-400 text-sm">Estado atual: {session.status}</p>
        <p className="text-stone-500 text-xs mt-2">(fase ainda por implementar)</p>
      </div>
    </div>
  )
}
