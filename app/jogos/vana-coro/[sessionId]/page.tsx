import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { shortDisplayName } from '@/utils/display-name'
import { PlayerView } from '@/components/vana-coro/PlayerView'
import type { VanaCoroPlayer, VanaCoroSession } from '@/types/vana-coro'

export const dynamic = 'force-dynamic'

// Telemóvel de um jogador (membro ou convidado). Os membros são reconhecidos pela
// sessão; os convidados pelo id guardado no browser quando entraram.
export default async function VanaCoroPlayerPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const service = createServiceClient()
  const [{ data: session }, { data: players }] = await Promise.all([
    service.from('vanacoro_sessions').select('*').eq('id', sessionId).maybeSingle(),
    service.from('vanacoro_players').select('*').eq('session_id', sessionId).order('joined_at'),
  ])
  if (!session) notFound()

  const list = (players ?? []) as VanaCoroPlayer[]
  const mine = user ? list.find((p) => p.profile_id === user.id) : undefined

  // Convidados: desbravadores a quem podem oferecer os pontos no fim.
  const { data: kids } = mine
    ? { data: [] }
    : await service.from('profiles').select('id, full_name').eq('role', 'desbravador').order('full_name')

  return (
    <PlayerView
      session={session as VanaCoroSession}
      initialPlayers={list}
      myPlayerId={mine?.id ?? null}
      recipients={(kids ?? []).map((k) => ({ id: k.id, name: shortDisplayName(k.full_name) }))}
    />
  )
}
