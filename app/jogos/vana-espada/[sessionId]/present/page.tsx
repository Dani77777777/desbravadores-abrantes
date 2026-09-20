import { createClient } from '@/utils/supabase/server'
import { Presentation } from '@/components/vana-espada/Presentation'
import { getSiteUrl } from '@/utils/site-url'
import { toEspadaSession } from '@/utils/vana-espada'
import PresentationReceiver from '@/components/presentation-effects/PresentationReceiver'

// Ecrã do projetor: público por natureza (só existe para sessões que alguém com
// acesso ao jogo criou). Não mostra nada de secreto — o excerto e os palpites
// vêm das RPCs, que só revelam o que já é público em cada estado.
export default async function PresentPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()

  // Hora do servidor: os clientes calculam o desvio do seu próprio relógio a partir
  // daqui, para a contagem decrescente ficar certa mesmo com a hora do telemóvel errada.
  const serverNow = Date.now()

  const { data: session } = await supabase
    .from('vanaespada_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex items-center justify-center text-white text-2xl font-bold">
        Sessão não encontrada.
      </div>
    )
  }

  const siteUrl = await getSiteUrl()

  return (
    <>
      <Presentation
        sessionId={sessionId}
        initialSession={toEspadaSession(session)}
        siteUrl={siteUrl}
        serverNow={serverNow}
      />
      {/* Desenha por cima do jogo os efeitos que o anfitrião dispara no painel de controlo */}
      <PresentationReceiver />
    </>
  )
}
