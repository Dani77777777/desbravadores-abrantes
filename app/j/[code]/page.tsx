import { redirect } from 'next/navigation'
import { createServiceClient } from '@/utils/supabase/service'

// Rota curta para QR codes (ex.: /j/NVFG) — quanto menos caracteres o QR
// codificar, menos denso fica e mais fácil é de ler à distância no projetor.
// O código pode ser de vários jogos (VanaWords, VanaSketch, VanaCoro) — detecta
// pela BD qual a sessão activa mais recente com este código.
export default async function ShortJoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const clean = code.toUpperCase()

  const service = createServiceClient()
  const latest = (table: string) =>
    service
      .from(table)
      .select('created_at')
      .eq('code', clean)
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  const [{ data: sketch }, { data: words }, { data: coro }] = await Promise.all([
    latest('vanasketch_sessions'),
    latest('vanawords_sessions'),
    latest('vanacoro_sessions'), // sem a tabela (migração por correr) vem null
  ])

  const candidates = [
    { href: '/jogos/vana-sketch', at: sketch?.created_at },
    { href: '/jogos/vana-words', at: words?.created_at },
    { href: '/jogos/vana-coro', at: coro?.created_at },
  ].filter((c): c is { href: string; at: string } => !!c.at)
  const best = candidates.sort((a, b) => b.at.localeCompare(a.at))[0]

  redirect(`${best?.href ?? '/jogos/vana-words'}?code=${encodeURIComponent(clean)}`)
}
