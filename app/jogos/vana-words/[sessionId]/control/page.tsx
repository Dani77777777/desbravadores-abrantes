import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect, notFound } from 'next/navigation'
import { HostControl } from '@/components/vana-words/HostControl'
import PresentationController from '@/components/presentation-effects/PresentationController'
import type { VanaWordsSession, VanaWordsPlayer, VanaWordsWord } from '@/types/vana-words'

export default async function VanaWordsControlPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jogos/vana-words/${sessionId}/control`)

  const { data: session } = await supabase
    .from('vanawords_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()
  if (session.host_id !== user.id) redirect(`/jogos/vana-words/${sessionId}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', user.id)
    .single()

  const service = createServiceClient()

  const { data: players } = await service
    .from('vanawords_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at')

  // Host sempre vê palavras com cores
  const { data: words } = await service
    .from('vanawords_words')
    .select('*')
    .eq('session_id', sessionId)
    .order('grid_pos')

  return (
    <>
      <HostControl
        session={session as VanaWordsSession}
        initialPlayers={(players ?? []) as VanaWordsPlayer[]}
        initialWords={(words ?? []) as VanaWordsWord[]}
        hostProfile={profile as { id: string; full_name: string }}
      />
      <PresentationController />
    </>
  )
}
