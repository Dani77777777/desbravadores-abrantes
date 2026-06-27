import { createClient } from '@/utils/supabase/server'
import { VanaWordsHome } from '@/components/vana-words/VanaWordsHome'

export default async function VanaWordsEntryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Qualquer utilizador autenticado com perfil pode jogar (desbravador,
  // dirigente ou coordenador). Apenas convidados/sem login ficam de fora.
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
      .from('vanawords_players')
      .select('session_id, vanawords_sessions(id, code, status)')
      .eq('user_id', user.id)

    activeSessions = (participations || [])
      .map((p) => p.vanawords_sessions as any)
      .filter((s) => s && s.status !== 'finished')
      .map((s) => ({ id: s.id, code: s.code, status: s.status }))
  }

  return <VanaWordsHome userId={user?.id ?? null} canPlay={canPlay} activeSessions={activeSessions} />
}
