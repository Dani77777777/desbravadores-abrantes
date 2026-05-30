import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PlayerView } from '@/components/vana-words/PlayerView'
import type { VanaWordsSession, VanaWordsPlayer } from '@/types/vana-words'

export default async function VanaWordsSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jogos/vana-words/${sessionId}`)

  const { data: session } = await supabase
    .from('vanawords_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()

  // Host → control
  if (session.host_id === user.id) {
    redirect(`/jogos/vana-words/${sessionId}/control`)
  }

  const { data: me } = await supabase
    .from('vanawords_players')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!me) {
    redirect(`/jogos/vana-words?code=${session.code}`)
  }

  // Arauto com jogo activo → sugerir abrir vista de arauto (mas deixar na player view)
  const { data: players } = await supabase
    .from('vanawords_players')
    .select('*')
    .eq('session_id', sessionId)

  return (
    <PlayerView
      session={session as VanaWordsSession}
      myPlayer={me as VanaWordsPlayer}
      initialPlayers={(players ?? []) as VanaWordsPlayer[]}
    />
  )
}
