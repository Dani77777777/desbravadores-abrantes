import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { RaffleProjector } from '@/components/raffle/RaffleProjector'
import { effectiveRole } from '@/utils/permissions'
import type { RaffleScreenState } from '@/utils/raffle'

/**
 * Ecrã do projetor do Sorteador. Abre-se no computador ligado ao projetor com a
 * MESMA conta de quem sorteia no telemóvel; segue a linha `raffle_screens` dessa conta.
 */
export default async function RaffleProjectorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/ferramentas/sorteio/projetor')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (!profile || (role !== 'coordenador' && role !== 'dirigente')) redirect('/')

  const { data: screen } = await supabase
    .from('raffle_screens')
    .select('state')
    .eq('host_id', user.id)
    .maybeSingle()

  return <RaffleProjector userId={user.id} initialState={(screen?.state as RaffleScreenState) ?? null} />
}
