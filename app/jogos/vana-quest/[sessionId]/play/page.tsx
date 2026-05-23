import { createClient } from '@/utils/supabase/server'
import { PlayerScreen } from '@/components/vana-quest/PlayerScreen'

export default async function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  const { data: session } = await supabase
    .from('vana_quest_sessions')
    .select('*, vana_quests(title)')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-2xl font-bold">Sessão não encontrada.</p>
          <a href="/jogos/vana-quest" className="mt-4 text-purple-300 underline block">Voltar</a>
        </div>
      </div>
    )
  }

  const { data: questions } = await supabase
    .from('vana_quest_questions')
    .select('*')
    .eq('vana_quest_id', session.vana_quest_id)
    .order('question_order')

  const { data: allMembers } = await supabase
    .from('profiles')
    .select('id, full_name, section')
    .eq('role', 'desbravador')
    .order('full_name')

  return (
    <PlayerScreen
      sessionId={sessionId}
      userId={user?.id || null}
      userProfile={profile}
      initialSession={session}
      questions={questions || []}
      allMembers={allMembers || []}
    />
  )
}
