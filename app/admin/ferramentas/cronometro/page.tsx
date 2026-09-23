import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { TimerClient } from '@/components/timer/TimerClient'
import { effectiveRole } from '@/utils/permissions'

export default async function TimerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/cronometro')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) redirect('/')

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <TimerClient userId={user.id} />
    </div>
  )
}
