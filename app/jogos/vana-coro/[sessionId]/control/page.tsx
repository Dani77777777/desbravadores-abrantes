import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { listReadyQuestions } from '@/lib/actions/vana-coro-game'
import { HostControl } from '@/components/vana-coro/HostControl'
import PresentationController from '@/components/presentation-effects/PresentationController'
import type { VanaCoroPlayer, VanaCoroSession } from '@/types/vana-coro'

export const dynamic = 'force-dynamic'

export default async function VanaCoroControlPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/jogos/vana-coro/${sessionId}/control`)

  const service = createServiceClient()
  const { data: session } = await service.from('vanacoro_sessions').select('*').eq('id', sessionId).maybeSingle()
  if (!session) notFound()
  if (session.host_id !== user.id) redirect(`/jogos/vana-coro/${sessionId}`)

  const [{ data: players }, readyQuestions] = await Promise.all([
    service.from('vanacoro_players').select('*').eq('session_id', sessionId).order('joined_at'),
    session.status === 'lobby' ? listReadyQuestions() : Promise.resolve([]),
  ])

  return (
    <>
      <HostControl
        session={session as VanaCoroSession}
        initialPlayers={(players ?? []) as VanaCoroPlayer[]}
        readyQuestions={readyQuestions}
      />
      <PresentationController />
    </>
  )
}
