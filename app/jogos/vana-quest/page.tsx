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
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-900">
      {user && <Navbar user={user} profile={profile} />}
      <JoinForm user={user} profile={profile} initialPin={pin || ''} />
    </div>
  )
}
