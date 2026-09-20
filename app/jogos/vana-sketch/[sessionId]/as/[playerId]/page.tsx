import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getVanaSketchBotForImpersonation } from '@/lib/actions/vana-sketch'
import { PlayerView } from '@/components/vana-sketch/PlayerView'
import type { VanaSketchSession, VanaSketchPlayer } from '@/types/vana-sketch'

// Host a jogar como um bot (apenas sessões de teste) — padrão do VanaWords
export default async function VanaSketchBotImpersonatePage({
  params,
}: {
  params: Promise<{ sessionId: string; playerId: string }>
}) {
  const { sessionId, playerId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jogos/vana-sketch/${sessionId}/as/${playerId}`)

  const { data: session } = await supabase
    .from('vanasketch_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()
  if (session.host_id !== user.id) redirect(`/jogos/vana-sketch/${sessionId}`)

  if (!session.is_test_session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white p-6 text-center">
        Esta sessão não é de teste.
      </div>
    )
  }

  const { bot, error } = await getVanaSketchBotForImpersonation(sessionId, playerId)

  if (error || !bot) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-red-300 p-6 text-center">
        {error ?? 'Bot não encontrado.'}
      </div>
    )
  }

  const { data: players } = await supabase
    .from('vanasketch_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at')

  // Construir um VanaSketchPlayer a partir dos dados do bot
  const botAsPlayer: VanaSketchPlayer = {
    id: bot.id,
    session_id: sessionId,
    user_id: null,
    display_name: bot.display_name,
    avatar_url: null,
    section: null,
    score: bot.score,
    draw_order: bot.draw_order,
    is_bot: true,
    joined_at: new Date().toISOString(),
  }

  return (
    <PlayerView
      session={session as VanaSketchSession}
      myPlayer={botAsPlayer}
      initialPlayers={(players ?? []) as VanaSketchPlayer[]}
      asBotId={bot.id}
    />
  )
}
