import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { PlayerLobby } from '@/components/vana-camp/PlayerLobby'
import { RoleReveal } from '@/components/vana-camp/RoleReveal'
import { NightScreen } from '@/components/vana-camp/NightScreen'
import { DayAnnouncement } from '@/components/vana-camp/DayAnnouncement'
import { WaitingPhase } from '@/components/vana-camp/WaitingPhase'

export default async function VanaCampSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/jogos/vana-camp/${sessionId}`)

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()

  if (session.host_id === user.id) {
    redirect(`/jogos/vana-camp/${sessionId}/control`)
  }

  const { data: me } = await supabase
    .from('vanacamp_players')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!me) redirect(`/jogos/vana-camp?code=${session.code}`)

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900">
      {children}
    </div>
  )

  if (session.status === 'lobby') return wrap(<PlayerLobby sessionId={sessionId} code={session.code} />)
  if (session.status === 'role_preview') return wrap(<WaitingPhase sessionId={sessionId} message="O Narrador está a preparar os papéis…" />)
  if (session.status === 'role_reveal') return <RoleReveal sessionId={sessionId} phaseEndsAt={session.phase_ends_at} />

  if (
    session.status === 'night_infiltrators' ||
    session.status === 'night_seer' ||
    session.status === 'night_guardian'
  ) {
    return (
      <NightScreen
        sessionId={sessionId}
        status={session.status}
        dayNumber={session.day_number}
        phaseStartedAt={session.phase_started_at}
        phaseEndsAt={session.phase_ends_at}
        phasePausedAt={session.phase_paused_at}
      />
    )
  }

  if (session.status === 'day_announce') {
    return (
      <DayAnnouncement
        sessionId={sessionId}
        dayNumber={session.day_number}
        phaseEndsAt={session.phase_ends_at}
        phasePausedAt={session.phase_paused_at}
      />
    )
  }

  if (session.status === 'finished') {
    return (
      <DayAnnouncement
        sessionId={sessionId}
        dayNumber={session.day_number}
        phaseEndsAt={null}
        phasePausedAt={null}
        winnerSide={session.winner_side}
      />
    )
  }

  return wrap(<WaitingPhase sessionId={sessionId} message="A preparar a próxima fase…" status={session.status} />)
}
