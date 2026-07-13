import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getVanaWordsBotForImpersonation } from '@/lib/actions/vana-words'
import { PlayerView } from '@/components/vana-words/PlayerView'
import { ArautoView } from '@/components/vana-words/ArautoView'
import type { VanaWordsSession, VanaWordsPlayer } from '@/types/vana-words'

export default async function VanaWordsBotImpersonatePage({
  params,
}: {
  params: Promise<{ sessionId: string; playerId: string }>
}) {
  const { sessionId, playerId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jogos/vana-words/${sessionId}/as/${playerId}`)

  const { data: session } = await supabase
    .from('vanawords_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()
  if (session.host_id !== user.id) redirect(`/jogos/vana-words/${sessionId}`)

  if (!session.is_test_session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white p-6 text-center">
        Esta sessão não é de teste.
      </div>
    )
  }

  const { bot, error } = await getVanaWordsBotForImpersonation(sessionId, playerId)

  if (error || !bot) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-red-300 p-6 text-center">
        {error ?? 'Bot não encontrado.'}
      </div>
    )
  }

  const { data: players } = await supabase
    .from('vanawords_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at')

  // Construir um VanaWordsPlayer a partir dos dados do bot
  const botAsPlayer: VanaWordsPlayer = {
    id: bot.id,
    session_id: sessionId,
    user_id: null,
    display_name: bot.display_name,
    avatar_url: null,
    section: null,
    team: bot.team as 'a' | 'b' | null,
    is_arauto: bot.is_arauto,
    is_bot: true,
    swap_requested: false,
    arauto_response: 'pending',
    joined_at: new Date().toISOString(),
  }

  // Se o bot for Arauto, mostrar ArautoView — senão PlayerView
  if (bot.is_arauto && (session.status === 'arauto_ready' || session.status === 'playing')) {
    return (
      <ArautoView
        session={session as VanaWordsSession}
        myPlayer={botAsPlayer}
        initialPlayers={(players ?? []) as VanaWordsPlayer[]}
      />
    )
  }

  return (
    <PlayerView
      session={session as VanaWordsSession}
      myPlayer={botAsPlayer}
      initialPlayers={(players ?? []) as VanaWordsPlayer[]}
      asBotId={bot.id}
    />
  )
}
