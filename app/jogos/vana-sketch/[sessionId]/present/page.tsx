import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { ProjectorView } from '@/components/vana-sketch/ProjectorView'
import type { VanaSketchSession, VanaSketchPlayer } from '@/types/vana-sketch'

// A página do projetor é pública — não precisa de autenticação
export default async function VanaSketchPresentPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('vanasketch_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()

  const { data: players } = await supabase
    .from('vanasketch_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at')

  return (
    <ProjectorView
      session={session as VanaSketchSession}
      initialPlayers={(players ?? []) as VanaSketchPlayer[]}
    />
  )
}
