import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { QuestEditorClient } from '@/components/vana-quest/QuestEditorClient'
import { QuestHeader } from '@/components/vana-quest/QuestHeader'
import { isAdminRole } from '@/utils/permissions'

export default async function QuestEditorPage({
  params,
}: {
  params: Promise<{ questId: string }>
}) {
  const { questId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = isAdminRole(profile)
  if (!isAdmin) redirect('/')

  const { data: quest } = await supabase.from('vana_quests').select('*').eq('id', questId).single()
  if (!quest) redirect('/admin/vana-quest')

  const { data: questions } = await supabase
    .from('vana_quest_questions')
    .select('*')
    .eq('vana_quest_id', questId)
    .order('question_order')

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5">
        <QuestHeader
          questId={questId}
          title={quest.title}
          description={quest.description}
          questionCount={questions?.length || 0}
        />

        <QuestEditorClient questions={questions || []} questId={questId} />
      </main>
    </div>
  )
}
