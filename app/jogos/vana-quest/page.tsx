import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { JoinForm } from '@/components/vana-quest/JoinForm'

export default async function VanaQuestJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { pin } = await searchParams

  let profile = null
  let activeSessions: { id: string; pin: string; status: string; title: string }[] = []
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data

    // Procurar sessões a decorrer onde o utilizador é participante (failsafe para reconectar)
    const { data: participations } = await supabase
      .from('vana_quest_participants')
      .select('session_id, vana_quest_sessions(id, pin, status, vana_quests(title))')
      .eq('user_id', user.id)

    activeSessions = (participations || [])
      .map((p) => {
        const s = (p.vana_quest_sessions as any)
        if (!s || s.status === 'finished') return null
        return {
          id: s.id,
          pin: s.pin,
          status: s.status,
          title: s.vana_quests?.title || 'VanaQuest',
        }
      })
      .filter(Boolean) as { id: string; pin: string; status: string; title: string }[]
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-900 to-indigo-900">
      {user && <Navbar user={user} profile={profile} />}
      <JoinForm
        user={user}
        profile={profile}
        initialPin={pin || ''}
        activeSessions={activeSessions}
      />
    </div>
  )
}
