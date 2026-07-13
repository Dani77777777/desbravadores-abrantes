import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect, notFound } from 'next/navigation'
import { HostControl } from '@/components/vana-sketch/HostControl'
import type { VanaSketchSession, VanaSketchPlayer } from '@/types/vana-sketch'

export default async function VanaSketchControlPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jogos/vana-sketch/${sessionId}/control`)

  const { data: session } = await supabase
    .from('vanasketch_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()
  if (session.host_id !== user.id) redirect(`/jogos/vana-sketch/${sessionId}`)

  const service = createServiceClient()
  const { data: players } = await service
    .from('vanasketch_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at')

  return (
    <HostControl
      session={session as VanaSketchSession}
      initialPlayers={(players ?? []) as VanaSketchPlayer[]}
    />
  )
}
