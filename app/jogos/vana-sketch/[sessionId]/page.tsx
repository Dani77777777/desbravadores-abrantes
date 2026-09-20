import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PlayerView } from '@/components/vana-sketch/PlayerView'
import type { VanaSketchSession, VanaSketchPlayer } from '@/types/vana-sketch'

export default async function VanaSketchSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jogos/vana-sketch/${sessionId}`)

  const { data: session } = await supabase
    .from('vanasketch_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()

  const { data: me } = await supabase
    .from('vanasketch_players')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!me) {
    redirect(`/jogos/vana-sketch?code=${session.code}`)
  }

  const { data: players } = await supabase
    .from('vanasketch_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at')

  return (
    <PlayerView
      session={session as VanaSketchSession}
      myPlayer={me as VanaSketchPlayer}
      initialPlayers={(players ?? []) as VanaSketchPlayer[]}
    />
  )
}
