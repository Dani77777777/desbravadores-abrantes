import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getBotForImpersonation } from '@/lib/actions/vana-coro-game'
import { PlayerView } from '@/components/vana-coro/PlayerView'
import type { VanaCoroPlayer, VanaCoroSession } from '@/types/vana-coro'

export const dynamic = 'force-dynamic'

// O anfitrião a fazer de bot (só sessões de teste), como nos outros jogos ao vivo.
export default async function VanaCoroBotPage({ params }: { params: Promise<{ sessionId: string; playerId: string }> }) {
  const { sessionId, playerId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/jogos/vana-coro/${sessionId}/as/${playerId}`)

  const bot = await getBotForImpersonation(sessionId, playerId)
  if (!bot) notFound()

  const service = createServiceClient()
  const [{ data: session }, { data: players }] = await Promise.all([
    service.from('vanacoro_sessions').select('*').eq('id', sessionId).maybeSingle(),
    service.from('vanacoro_players').select('*').eq('session_id', sessionId).order('joined_at'),
  ])
  if (!session) notFound()

  return (
    <PlayerView
      session={session as VanaCoroSession}
      initialPlayers={(players ?? []) as VanaCoroPlayer[]}
      myPlayerId={bot.id}
      recipients={[]}
      asBot
    />
  )
}
