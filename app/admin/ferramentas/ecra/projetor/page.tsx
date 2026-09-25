import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { ClubScreenProjector } from '@/components/club-screen/ClubScreenProjector'
import { effectiveRole } from '@/utils/permissions'
import { normalizeClubState } from '@/utils/club-screen'

/**
 * Ecrã do projetor do Ecrã do Clube. Abre-se no computador ligado ao projetor (na app do
 * clube ou no browser) com a MESMA conta de quem controla; segue a linha `club_screens`.
 */
export default async function ClubScreenProjectorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/ecra/projetor')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) redirect('/')

  const { data: screen } = await supabase.from('club_screens').select('state').eq('host_id', user.id).maybeSingle()

  return <ClubScreenProjector userId={user.id} initialState={normalizeClubState(screen?.state)} />
}
