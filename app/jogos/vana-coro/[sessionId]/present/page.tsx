import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { ProjectorView } from '@/components/vana-coro/ProjectorView'
import PresentationReceiver from '@/components/presentation-effects/PresentationReceiver'
import type { VanaCoroPlayer, VanaCoroSession } from '@/types/vana-coro'

export const dynamic = 'force-dynamic'

// O projetor é público (não precisa de sessão iniciada). Só lê a sessão e os
// jogadores; o quadro vem do servidor só com as respostas já reveladas.
export default async function VanaCoroPresentPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound()
  const supabase = await createClient()
  const [{ data: session }, { data: players }] = await Promise.all([
    supabase.from('vanacoro_sessions').select('*').eq('id', sessionId).maybeSingle(),
    supabase.from('vanacoro_players').select('*').eq('session_id', sessionId).order('joined_at'),
  ])
  if (!session) notFound()

  return (
    <>
      <ProjectorView session={session as VanaCoroSession} initialPlayers={(players ?? []) as VanaCoroPlayer[]} />
      {/* Efeitos de apresentação (confettis…) como nos outros jogos */}
      <PresentationReceiver />
    </>
  )
}
