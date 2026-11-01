import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { Navbar } from '@/components/layout/Navbar'
import { CheckinPage } from '@/components/checkin/CheckinPage'
import { eventFromPass } from '@/lib/checkin/token'
import { getMyCheckinFamily } from '@/lib/actions/checkin'
import { CHECKIN_PASS_COOKIE, checkinOpen } from '@/utils/checkin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Marcar presença',
  robots: { index: false },
}

// Página aberta pelo QR das presenças (via /presenca/entrar, que dá o passe de 30 min).
// Membros marcam-se a si e à família; convidados escrevem só o nome.
export default async function CheckinRoute({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ expirado?: string }>
}) {
  const { eventId } = await params
  const { expirado } = await searchParams
  const jar = await cookies()
  const hasPass = eventFromPass(jar.get(CHECKIN_PASS_COOKIE)?.value) === eventId

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user ? (await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()).data : null

  const { data: event } = /^[0-9a-f-]{36}$/i.test(eventId)
    ? await createServiceClient().from('events').select('id, title, start_at, end_at, is_finished').eq('id', eventId).maybeSingle()
    : { data: null }

  const family = event && hasPass && user ? await getMyCheckinFamily(eventId) : []

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <CheckinPage
        event={event ? { id: event.id, title: event.title, start_at: event.start_at } : null}
        open={!!event && checkinOpen(event)}
        hasPass={hasPass}
        expired={!hasPass && !!expirado}
        loggedIn={!!user}
        family={family}
      />
    </div>
  )
}
