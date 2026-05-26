import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { VanaCampHome } from '@/components/vana-camp/VanaCampHome'

export default async function VanaCampHomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Acesso restrito a membros autenticados
  if (!user) {
    redirect('/login?next=/jogos/vana-camp')
  }

  const { code } = await searchParams

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const canHost = profile?.role === 'dirigente' || profile?.role === 'coordenador'

  // Sessões em que o utilizador é jogador e que ainda não terminaram (reconectar)
  const { data: myPlayers } = await supabase
    .from('vanacamp_players')
    .select('session_id, vanacamp_sessions(id, code, status, host_id)')
    .eq('user_id', user.id)

  const activeSessions = (myPlayers || [])
    .map((p) => {
      const s = p.vanacamp_sessions as unknown as {
        id: string; code: string; status: string; host_id: string
      } | null
      if (!s) return null
      if (s.status === 'finished' || s.status === 'cancelled') return null
      return s
    })
    .filter(Boolean) as { id: string; code: string; status: string; host_id: string }[]

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900">
      <Navbar user={user} profile={profile} />
      <VanaCampHome
        canHost={canHost}
        initialCode={code || ''}
        activeSessions={activeSessions}
        userId={user.id}
      />
    </div>
  )
}
