import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { ClubScreenClient } from '@/components/club-screen/ClubScreenClient'
import { ClubNoAccess } from '@/components/club-screen/ClubNoAccess'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import { normalizeClubState } from '@/utils/club-screen'
import type { RaffleEvent } from '@/utils/raffle'

/** Eventos que aparecem nas presenças por QR: das últimas 2 semanas e do próximo mês. */
function eventWindow() {
  const now = Date.now()
  return { from: new Date(now - 14 * 86400000).toISOString(), to: new Date(now + 30 * 86400000).toISOString() }
}

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

  // Eventos para as presenças por QR: recentes e próximos. O dirigente só vê os gerais e os da sua secção.
  const section = role === 'dirigente' ? effectiveLeadershipSection(profile) || profile?.section : null
  let eventsQuery = supabase
    .from('events')
    .select('id, title, start_at, end_at, target_section, is_finished')
    .gte('start_at', eventWindow().from)
    .lte('start_at', eventWindow().to)
    .order('start_at', { ascending: false })
  if (section) eventsQuery = eventsQuery.or(`target_section.is.null,target_section.eq.${section}`)
  const { data: events } = allowed ? await eventsQuery : { data: null }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      {allowed ? (
        <ClubScreenClient
          userId={user.id}
          userName={profile.full_name || user.email || 'Sem nome'}
          initialState={normalizeClubState(screen?.state)}
          events={(events || []) as RaffleEvent[]}
        />
      ) : (
        <ClubNoAccess />
      )}
    </div>
  )
}
