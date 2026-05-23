import { createClient } from '@/utils/supabase/server'
import { Presentation } from '@/components/vana-quest/Presentation'
import { getSiteUrl } from '@/utils/site-url'

export default async function PresentPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('vana_quest_sessions')
    .select('*, vana_quests(title)')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900 flex items-center justify-center text-white">
        Sessão não encontrada.
      </div>
    )
  }

  const { data: questions } = await supabase
    .from('vana_quest_questions')
    .select('*')
    .eq('vana_quest_id', session.vana_quest_id)
    .order('question_order')

  const siteUrl = await getSiteUrl()

  return (
    <Presentation
      sessionId={sessionId}
      initialSession={session}
      questions={questions || []}
      siteUrl={siteUrl}
    />
  )
}
