import { redirect } from 'next/navigation'

// Rota curta para QR codes (ex.: /j/NVFG) — quanto menos caracteres o QR
// codificar, menos denso fica e mais fácil é de ler à distância no projetor.
export default async function ShortJoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  redirect(`/jogos/vana-words?code=${encodeURIComponent(code.toUpperCase())}`)
}
