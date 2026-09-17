import { createClient } from '@/utils/supabase/server'
import { PlayerScreen } from '@/components/vana-espada/PlayerScreen'
import { toEspadaSession } from '@/utils/vana-espada'

export default async function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-2xl font-bold">Sessão não encontrada.</p>
          <a href="/jogos/vana-espada" className="mt-4 text-amber-300 underline block">Voltar</a>
        </div>
      </div>
    )
  }

  // Lista para os convidados escolherem a quem doam os prémios no fim.
  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, section, avatar_url')
    .eq('role', 'desbravador')
    .order('full_name')

  return (
    <PlayerScreen
      sessionId={sessionId}
      userId={user?.id ?? null}
      initialSession={toEspadaSession(session)}
      serverNow={serverNow}
      allMembers={members ?? []}
    />
  )
}
