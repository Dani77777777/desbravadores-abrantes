import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getSiteUrl } from '@/utils/site-url'
import { Presentation } from '@/components/vana-camp/Presentation'

/**
 * Vista para projetor / TV. Apenas o Narrador (host) pode aceder.
 *
 * Princípio cardeal: NUNCA revela papéis enquanto o jogo decorre.
 */
export default async function VanaCampPresentPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/jogos/vana-camp/${sessionId}/present`)

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()
  if (session.host_id !== user.id) {
    redirect(`/jogos/vana-camp/${sessionId}`)
  }

  const siteUrl = await getSiteUrl()
  const joinUrl = `${siteUrl}/jogos/vana-camp?code=${session.code}`

  return (
    <Presentation
      sessionId={sessionId}
      initialStatus={session.status}
      initialDayNumber={session.day_number}
      initialPhaseEndsAt={session.phase_ends_at}
      initialPhasePausedAt={session.phase_paused_at}
      initialPhaseStartedAt={session.phase_started_at}
      code={session.code}
      joinUrl={joinUrl}
      winnerSide={session.winner_side}
    />
  )
}
