import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { RaffleClient } from '@/components/raffle/RaffleClient'
import { getQuestionRaffleData } from '@/lib/actions/question-raffle'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import type { RaffleEvent, RaffleMember } from '@/utils/raffle'

const MEMBER_COLUMNS = 'id, full_name, avatar_url, role, section, leadership_section, helper_role, helper_section'
const EVENTS_PAST_DAYS = 45
const EVENTS_FUTURE_DAYS = 14

/** Janela de eventos que aparecem no seletor (recentes e próximos). */
function eventWindow() {
  const now = Date.now()
  return {
    from: new Date(now - EVENTS_PAST_DAYS * 86400000).toISOString(),
    to: new Date(now + EVENTS_FUTURE_DAYS * 86400000).toISOString(),
  }
}

export default async function RafflePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/sorteio')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) redirect('/')

  // Mesmo âmbito do painel de gestão: o dirigente (ou ajudante de secção) só vê a sua secção.
  const section = role === 'dirigente' ? effectiveLeadershipSection(profile) || profile.section : null

  let membersQuery = supabase.from('profiles').select(MEMBER_COLUMNS).order('full_name')
  if (section) membersQuery = membersQuery.eq('section', section)

  const { from, to } = eventWindow()
  let eventsQuery = supabase
    .from('events')
    .select('id, title, start_at, end_at, target_section, is_finished')
    .gte('start_at', from)
    .lte('start_at', to)
    .order('start_at', { ascending: false })
  if (section) eventsQuery = eventsQuery.or(`target_section.is.null,target_section.eq.${section}`)

  const [{ data: members }, { data: events }, questions] = await Promise.all([membersQuery, eventsQuery, getQuestionRaffleData()])

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <RaffleClient
        userId={user.id}
        members={(members || []) as RaffleMember[]}
        events={(events || []) as RaffleEvent[]}
        initialQuestions={questions ?? []}
      />
    </div>
  )
}
