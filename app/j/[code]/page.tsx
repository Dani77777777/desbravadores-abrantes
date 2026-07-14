import { redirect } from 'next/navigation'
import { createServiceClient } from '@/utils/supabase/service'

// Rota curta para QR codes (ex.: /j/NVFG) — quanto menos caracteres o QR
// codificar, menos denso fica e mais fácil é de ler à distância no projetor.
// O código pode ser de vários jogos (VanaWords, VanaSketch) — detecta pela BD
// qual a sessão activa mais recente com este código.
export default async function ShortJoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const clean = code.toUpperCase()

  const service = createServiceClient()
  const [{ data: sketch }, { data: words }] = await Promise.all([
    service
      .from('vanasketch_sessions')
      .select('created_at')
      .eq('code', clean)
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('vanawords_sessions')
      .select('created_at')
      .eq('code', clean)
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (sketch && (!words || sketch.created_at > words.created_at)) {
    redirect(`/jogos/vana-sketch?code=${encodeURIComponent(clean)}`)
  }
  redirect(`/jogos/vana-words?code=${encodeURIComponent(clean)}`)
}
