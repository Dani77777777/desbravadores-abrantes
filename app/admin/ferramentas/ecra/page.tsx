import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { ClubScreenClient } from '@/components/club-screen/ClubScreenClient'
import { ClubNoAccess } from '@/components/club-screen/ClubNoAccess'
import { effectiveRole } from '@/utils/permissions'
import { normalizeClubState } from '@/utils/club-screen'

/**
 * Controlo do Ecrã do Clube (logo, ranking e ferramentas no projetor). Funciona no PC,
 * no telemóvel e dentro da app "Ecrã do Clube"; o projetor segue a linha `club_screens`.
 */
export default async function ClubScreenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/ecra')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  const allowed = !!profile && (role === 'coordenador' || role === 'dirigente')

  const { data: screen } = allowed
    ? await supabase.from('club_screens').select('state').eq('host_id', user.id).maybeSingle()
    : { data: null }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      {allowed ? (
        <ClubScreenClient
          userId={user.id}
          userName={profile.full_name || user.email || 'Sem nome'}
          initialState={normalizeClubState(screen?.state)}
        />
      ) : (
        <ClubNoAccess />
      )}
    </div>
  )
}
