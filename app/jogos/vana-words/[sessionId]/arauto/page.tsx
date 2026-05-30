import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ArautoView } from '@/components/vana-words/ArautoView'
import type { VanaWordsSession, VanaWordsPlayer } from '@/types/vana-words'

export default async function VanaWordsArautoPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jogos/vana-words/${sessionId}/arauto`)

  const { data: session } = await supabase
    .from('vanawords_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) notFound()

  // Host também pode ver esta página (útil para teste)
  const isHost = session.host_id === user.id

  const { data: me } = await supabase
    .from('vanawords_players')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!isHost && (!me || !me.is_arauto)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-2xl font-bold text-white">Acesso negado</p>
          <p className="text-slate-400">Apenas os Arautos podem aceder a esta vista.</p>
          <a href={`/jogos/vana-words/${sessionId}`} className="text-emerald-400 underline text-sm">Voltar ao jogo</a>
        </div>
      </div>
    )
  }

  const { data: players } = await supabase
    .from('vanawords_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at')

  // Para o host, criar um "me" sintético para o ArautoView funcionar
  const mePlayer = me ?? {
    id: 'host',
    session_id: sessionId,
    user_id: user.id,
    display_name: 'Host',
    avatar_url: null,
    section: null,
    team: session.current_team ?? 'a',
    is_arauto: true,
    is_bot: false,
    joined_at: new Date().toISOString(),
  }

  return (
    <ArautoView
      session={session as VanaWordsSession}
      myPlayer={mePlayer as VanaWordsPlayer}
      initialPlayers={(players ?? []) as VanaWordsPlayer[]}
    />
  )
}
