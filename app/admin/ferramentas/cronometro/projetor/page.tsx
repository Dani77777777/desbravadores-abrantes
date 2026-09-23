import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { TimerProjector } from '@/components/timer/TimerProjector'
import { effectiveRole } from '@/utils/permissions'
import type { TimerScreenState } from '@/utils/timer'

/**
 * Ecrã do projetor do Cronómetro. Abre-se no computador ligado ao projetor com a
 * MESMA conta de quem controla; segue a linha `timer_screens` dessa conta.
 */
export default async function TimerProjectorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/cronometro/projetor')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) redirect('/')

  const { data: screen } = await supabase
    .from('timer_screens')
    .select('state')
    .eq('host_id', user.id)
    .maybeSingle()

  return <TimerProjector userId={user.id} initialState={(screen?.state as TimerScreenState) ?? null} />
}
