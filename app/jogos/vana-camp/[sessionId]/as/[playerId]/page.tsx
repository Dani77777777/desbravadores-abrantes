import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getBotForImpersonation } from '@/lib/actions/vana-camp'
import { PlayerLobby } from '@/components/vana-camp/PlayerLobby'
import { RoleReveal } from '@/components/vana-camp/RoleReveal'
import { NightScreen } from '@/components/vana-camp/NightScreen'
import { DayAnnouncement } from '@/components/vana-camp/DayAnnouncement'
import { DayScreen } from '@/components/vana-camp/DayScreen'
import { DayResultScreen } from '@/components/vana-camp/DayResultScreen'
import { MayorElectionScreen } from '@/components/vana-camp/MayorElectionScreen'
import { WaitingPhase } from '@/components/vana-camp/WaitingPhase'

export default async function ImpersonateBotPage({
  params,
}: {
  params: Promise<{ sessionId: string; playerId: string }>
}) {
  const { sessionId, playerId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/jogos/vana-camp/${sessionId}`)

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) notFound()
  if (session.host_id !== user.id) redirect(`/jogos/vana-camp/${sessionId}`)
  if (!session.is_test_session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900 text-amber-100 p-8 text-center">
        Esta sessão não é de teste.
      </div>
    )
  }

  const { bot, error } = await getBotForImpersonation(sessionId, playerId)
  if (error || !bot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900 text-red-300 p-8 text-center">
        {error ?? 'Bot não encontrado.'}
      </div>
    )
  }

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900">
      {children}
    </div>
  )

  if (session.status === 'lobby') {
    return wrap(
      <PlayerLobby
        sessionId={sessionId}
        code={session.code}
        myPlayerId={bot.id}
        impersonatingBotName={bot.display_name}
      />
    )
  }

  if (session.status === 'role_reveal') {
    return (
      <RoleReveal
        sessionId={sessionId}
        phaseEndsAt={session.phase_ends_at}
        impersonatingBot={bot}
      />
    )
  }

  if (session.status === 'mayor_election') {
    return (
      <MayorElectionScreen
        sessionId={sessionId}
        phaseEndsAt={session.phase_ends_at}
        phasePausedAt={session.phase_paused_at}
        impersonatingBotId={bot.id}
        impersonatingBotName={bot.display_name}
      />
    )
  }

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
        impersonatingBotId={bot.id}
        impersonatingBotName={bot.display_name}
      />
    )
  }

  if (session.status === 'day_announce' || session.status === 'finished') {
    return (
      <DayAnnouncement
        sessionId={sessionId}
        dayNumber={session.day_number}
        phaseEndsAt={session.phase_ends_at}
        phasePausedAt={session.phase_paused_at}
        winnerSide={session.status === 'finished' ? session.winner_side : null}
      />
    )
  }

  if (session.status === 'day_discussion' || session.status === 'day_vote') {
    return (
      <DayScreen
        sessionId={sessionId}
        status={session.status}
        dayNumber={session.day_number}
        phaseStartedAt={session.phase_started_at}
        phaseEndsAt={session.phase_ends_at}
        phasePausedAt={session.phase_paused_at}
        chatMode={session.chat_mode}
        impersonatingBotId={bot.id}
        impersonatingBotName={bot.display_name}
      />
    )
  }

  if (session.status === 'day_result') {
    return (
      <DayResultScreen
        sessionId={sessionId}
        dayNumber={session.day_number}
        phaseEndsAt={session.phase_ends_at}
        phasePausedAt={session.phase_paused_at}
      />
    )
  }

  return wrap(<WaitingPhase sessionId={sessionId} message={`A controlar ${bot.display_name}…`} status={session.status} />)
}
