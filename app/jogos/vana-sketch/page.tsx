import { createClient } from '@/utils/supabase/server'
import { VanaSketchHome } from '@/components/vana-sketch/VanaSketchHome'

export default async function VanaSketchEntryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Qualquer utilizador autenticado com perfil pode jogar
  let canPlay = false
  let activeSessions: { id: string; code: string; status: string }[] = []
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    canPlay = !!profile?.role

    // Failsafe: sessões a decorrer onde o utilizador já entrou (para reconectar)
    const { data: participations } = await supabase
      .from('vanasketch_players')
      // FK explícita: sessions.drawer_player_id também liga as duas tabelas.
      .select('session_id, vanasketch_sessions!vanasketch_players_session_id_fkey(id, code, status)')
      .eq('user_id', user.id)

    activeSessions = (participations || [])
      .map((p) => p.vanasketch_sessions as any)
      .filter((s) => s && s.status !== 'finished')
      .map((s) => ({ id: s.id, code: s.code, status: s.status }))
  }

  return <VanaSketchHome userId={user?.id ?? null} canPlay={canPlay} activeSessions={activeSessions} />
}
