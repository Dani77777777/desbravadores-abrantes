import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { HostControl, type HostRound } from '@/components/vana-espada/HostControl'
import { getSiteUrl } from '@/utils/site-url'
import { isAdminRole } from '@/utils/permissions'
import { toEspadaSession } from '@/utils/vana-espada'
import PresentationController from '@/components/presentation-effects/PresentationController'

// O middleware deixa /jogos/vana-espada passar sem login (por causa dos
// convidados), por isso o painel do anfitrião faz aqui a sua própria guarda.
export default async function ControlPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/jogos/vana-espada/${sessionId}/control`)

  // Hora do servidor: os clientes calculam o desvio do seu próprio relógio a partir
  // daqui, para a contagem decrescente ficar certa mesmo com a hora do telemóvel errada.
  const serverNow = Date.now()

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!isAdminRole(profile)) redirect('/jogos/vana-espada')

  const { data: session } = await supabase
    .from('vanaespada_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) redirect('/jogos/vana-espada')

  const isCoordenador = (profile?.helper_role || profile?.role) === 'coordenador'
  if (session.host_id !== user.id && !isCoordenador) redirect('/jogos/vana-espada')

  // As rondas trazem a resposta certa: só chegam aqui depois das guardas acima.
  // A tabela não tem política de SELECT para o cliente, por isso lê-se pelo service role.
  const service = createServiceClient()
  const { data: rounds } = await service
    .from('vanaespada_session_rounds')
    .select('round_index, book_id, chapter, verse_start, verse_end, excerpt, translation, time_seconds')
    .eq('session_id', sessionId)
    .order('round_index')

  const siteUrl = await getSiteUrl()

  return (
    <>
      <HostControl
        sessionId={sessionId}
        initialSession={toEspadaSession(session)}
        rounds={(rounds ?? []) as HostRound[]}
        siteUrl={siteUrl}
        serverNow={serverNow}
      />
      {/* Efeitos para o projetor (confettis, cortina, tambores…), os mesmos do VanaQuest e do VanaWords */}
      <PresentationController />
    </>
  )
}
