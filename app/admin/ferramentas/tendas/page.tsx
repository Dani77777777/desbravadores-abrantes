import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { TripsClient } from '@/components/trips/TripsClient'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import type { TripEvent, TripMember } from '@/utils/trips'

const MEMBER_COLUMNS =
  'id, full_name, avatar_url, role, section, leadership_section, helper_role, helper_section, birth_date, gender'
const EVENTS_PAST_DAYS = 14
const EVENTS_FUTURE_DAYS = 365

/** Janela de eventos no seletor: recentes e os do próximo ano (as saídas planeiam-se cedo). */
function eventWindow() {
  const now = Date.now()
  return {
    from: new Date(now - EVENTS_PAST_DAYS * 86400000).toISOString(),
    to: new Date(now + EVENTS_FUTURE_DAYS * 86400000).toISOString(),
  }
}

export default async function TripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/tendas')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) redirect('/')

  // A coordenação organiza qualquer evento; o dirigente (ou ajudante de secção) só os da
  // sua secção — é o mesmo âmbito da RLS de trip_plans.
  const section = role === 'dirigente' ? effectiveLeadershipSection(profile) || profile.section : null

  let membersQuery = supabase.from('profiles').select(MEMBER_COLUMNS).order('full_name')
  if (section) membersQuery = membersQuery.eq('section', section)

  const { from, to } = eventWindow()
  let eventsQuery = supabase
    .from('events')
    .select('id, title, start_at, end_at, target_section, location, rsvp_enabled')
    .gte('start_at', from)
    .lte('start_at', to)
    .order('start_at', { ascending: true })
  if (section) eventsQuery = eventsQuery.eq('target_section', section)

  const [{ data: members }, { data: events }] = await Promise.all([membersQuery, eventsQuery])

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <TripsClient
        userId={user.id}
        members={(members || []) as TripMember[]}
        events={(events || []) as TripEvent[]}
        canConfirmGender={role === 'coordenador'}
      />
    </div>
  )
}
