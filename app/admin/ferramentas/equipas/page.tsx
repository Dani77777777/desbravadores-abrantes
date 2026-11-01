import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { TeamsClient, type TeamsEvent } from '@/components/teams/TeamsClient'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import type { TeamMember } from '@/utils/teams'
import { createServiceClient } from '@/utils/supabase/service'
import { familyGroupsAmong } from '@/lib/checkin/family'

const MEMBER_COLUMNS =
  'id, full_name, avatar_url, role, section, leadership_section, helper_role, helper_section, birth_date, gender'
const EVENTS_PAST_DAYS = 45
const EVENTS_FUTURE_DAYS = 60

/** Janela de eventos que aparecem no seletor (recentes e próximos). */
function eventWindow() {
  const now = Date.now()
  return {
    from: new Date(now - EVENTS_PAST_DAYS * 86400000).toISOString(),
    to: new Date(now + EVENTS_FUTURE_DAYS * 86400000).toISOString(),
  }
}

export default async function TeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/equipas')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) redirect('/')

  // Mesmo âmbito do Sorteador: o dirigente (ou ajudante de secção) só vê a sua secção.
  const section = role === 'dirigente' ? effectiveLeadershipSection(profile) || profile.section : null

  let membersQuery = supabase.from('profiles').select(MEMBER_COLUMNS).order('full_name')
  if (section) membersQuery = membersQuery.eq('section', section)

  const { from, to } = eventWindow()
  let eventsQuery = supabase
    .from('events')
    .select('id, title, start_at, end_at, target_section, is_finished, rsvp_enabled')
    .gte('start_at', from)
    .lte('start_at', to)
    .order('start_at', { ascending: false })
  if (section) eventsQuery = eventsQuery.or(`target_section.is.null,target_section.eq.${section}`)

  const [{ data: members }, { data: events }] = await Promise.all([membersQuery, eventsQuery])
  // Modo Famílias: quem é da mesma família (contas familiares) fica junto.
  const familyGroups = await familyGroupsAmong(createServiceClient(), (members || []).map((m) => m.id))

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <TeamsClient
        userId={user.id}
        members={(members || []) as TeamMember[]}
        events={(events || []) as TeamsEvent[]}
        familyGroups={familyGroups}
      />
    </div>
  )
}
