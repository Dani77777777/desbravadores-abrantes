import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { JoinForm } from '@/components/vana-espada/JoinForm'
import { isAdminRole } from '@/utils/permissions'
import type { EspadaStatus } from '@/types/vana-espada'

export default async function VanaEspadaJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { pin } = await searchParams

  let profile = null
  let activeSessions: { id: string; pin: string; status: EspadaStatus; isHost: boolean }[] = []

  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data

    // Failsafe para reconectar: sessões a decorrer onde já sou jogador ou anfitrião.
    const [{ data: participations }, { data: hosted }] = await Promise.all([
      supabase
        .from('vanaespada_players')
        .select('session_id, vanaespada_sessions(id, pin, status)')
        .eq('user_id', user.id),
      supabase
        .from('vanaespada_sessions')
        .select('id, pin, status')
        .eq('host_id', user.id)
        .neq('status', 'finished'),
    ])

    const byId = new Map<string, { id: string; pin: string; status: EspadaStatus; isHost: boolean }>()

    for (const row of participations ?? []) {
      const s = row.vanaespada_sessions as unknown as { id: string; pin: string; status: EspadaStatus } | null
      if (!s || s.status === 'finished') continue
      byId.set(s.id, { ...s, isHost: false })
    }
    for (const s of hosted ?? []) {
      byId.set(s.id, { id: s.id, pin: s.pin, status: s.status as EspadaStatus, isHost: true })
    }

    activeSessions = Array.from(byId.values())
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900">
      {user && <Navbar user={user} profile={profile} />}
      <JoinForm
        user={user}
        profile={profile}
        initialPin={pin || ''}
        canHost={isAdminRole(profile)}
        activeSessions={activeSessions}
      />
    </div>
  )
}
