import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { TeamsProjector } from '@/components/teams/TeamsProjector'
import { effectiveRole } from '@/utils/permissions'
import type { TeamsScreenState } from '@/utils/teams'

/**
 * Ecrã do projetor do Formador de equipas. Abre-se no computador ligado ao projetor com a
 * MESMA conta de quem forma as equipas; segue a linha `team_screens` dessa conta.
 */
export default async function TeamsProjectorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/equipas/projetor')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) redirect('/')

  const { data: screen } = await supabase.from('team_screens').select('state').eq('host_id', user.id).maybeSingle()

  return <TeamsProjector userId={user.id} initialState={(screen?.state as TeamsScreenState) ?? null} />
}
