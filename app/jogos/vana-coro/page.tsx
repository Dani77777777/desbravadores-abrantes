import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveRole } from '@/utils/permissions'
import { VanaCoroHome } from '@/components/vana-coro/VanaCoroHome'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'VanaCoro — O que é que o JA disse?',
  description: 'Adivinha as respostas mais populares e ganha pela tua equipa!',
}

// Entrada do jogo: os jogadores metem o código; o anfitrião cria a sessão.
// O middleware já esconde esta página a quem não pode jogar (Gestão → Jogos).
export default async function VanaCoroPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user
    ? (await supabase.from('profiles').select('role, helper_role').eq('id', user.id).maybeSingle()).data
    : null
  const role = effectiveRole(profile)
  const canHost = role === 'dirigente' || role === 'coordenador'

  const { data: mySessions } = canHost
    ? await createServiceClient()
        .from('vanacoro_sessions')
        .select('id, code, status, is_test_session, created_at, ended_at, team_a_name, team_b_name, team_a_score, team_b_score, rewards_awarded_at')
        .eq('host_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(30)
    : { data: [] }

  // Veio do QR (/j/ABCD → ?code=ABCD): já mostra a escolha da equipa.
  const cleanCode = (code ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
  const { data: found } =
    cleanCode.length === 4
      ? await createServiceClient()
          .from('vanacoro_sessions')
          .select('id, code, team_a_name, team_b_name, status')
          .eq('code', cleanCode)
          .neq('status', 'finished')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null }

  return (
    <VanaCoroHome
      canHost={canHost}
      isCoordinator={role === 'coordenador'}
      isMember={!!profile}
      initialCode={cleanCode}
      initialFound={found}
      mySessions={mySessions ?? []}
    />
  )
}
