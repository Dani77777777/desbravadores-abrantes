import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { ProjectorView } from '@/components/vana-words/ProjectorView'
import type { VanaWordsSession, VanaWordsPlayer } from '@/types/vana-words'

// A página do projetor é pública — não precisa de autenticação
export default async function VanaWordsPresentPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('vanawords_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()

  const { data: players } = await supabase
    .from('vanawords_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at')

  return (
    <ProjectorView
      session={session as VanaWordsSession}
      initialPlayers={(players ?? []) as VanaWordsPlayer[]}
    />
  )
}
