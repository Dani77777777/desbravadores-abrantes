import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { HostControl } from '@/components/vana-quest/HostControl'
import { getSiteUrl } from '@/utils/site-url'

export default async function ControlPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'coordenador' || profile?.role === 'dirigente'
  if (!isAdmin) redirect('/')

  const { data: session } = await supabase
    .from('vana_quest_sessions')
    .select('*, vana_quests(title)')
    .eq('id', sessionId)
    .single()

  if (!session || session.host_id !== user.id) redirect('/admin/vana-quest')

  const { data: questions } = await supabase
    .from('vana_quest_questions')
    .select('*')
    .eq('vana_quest_id', session.vana_quest_id)
    .order('question_order')

  const siteUrl = await getSiteUrl()

  return (
    <HostControl
      sessionId={sessionId}
      initialSession={session}
      questions={questions || []}
      siteUrl={siteUrl}
    />
  )
}
