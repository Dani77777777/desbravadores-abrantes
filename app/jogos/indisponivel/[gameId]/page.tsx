import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Ban, ChevronLeft, LogIn, Play, Settings } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { fetchGameSetting, gameVisibilityFor, getGame } from '@/utils/games'
import { effectiveRole } from '@/utils/permissions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Jogo indisponível — Desbravadores de Abrantes',
  robots: { index: false },
}

// O middleware reescreve para aqui qualquer página de um jogo a que o visitante
// não tem acesso (o URL original mantém-se no browser). Se o jogo estiver escondido
// para este visitante, responde 404 — não pode revelar que o jogo existe.
export default async function GameUnavailablePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  const game = getGame(gameId)
  if (!game) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    profile = data
  }

  const role = effectiveRole(profile)
  const setting = await fetchGameSetting(supabase, game.id)
  const visibility = gameVisibilityFor(setting, role)
  if (visibility === 'hidden') notFound()
  // Pode acontecer se o jogo foi reativado entretanto (ou se alguém abriu este URL diretamente).
  const availableNow = visibility === 'available'

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
        <Link
          href="/jogos"
          className="group mb-6 inline-flex items-center gap-2 font-medium text-gray-500 transition-colors hover:text-blue-600"
        >
          <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" /> Voltar ao Centro de Jogos
        </Link>

        <div className="overflow-hidden rounded-3xl bg-white shadow-lg">
          <div className={`relative flex h-40 items-center justify-center bg-gradient-to-br ${game.color} ${availableNow ? '' : 'grayscale'}`}>
            <div className="rounded-3xl bg-white p-4 shadow-xl">
              <img src={game.image} alt={game.title} className="h-16 w-16 object-contain" />
            </div>
            {!availableNow && (
              <span className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                Indisponível
              </span>
            )}
          </div>

          <div className="space-y-4 p-6 text-center sm:p-8">
            {availableNow ? (
              <>
                <h1 className="text-2xl font-black text-gray-900">{game.title} já está disponível!</h1>
                <p className="text-gray-600">Podes voltar a entrar no jogo.</p>
                <Link
                  href={game.href}
                  className="mx-auto flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-blue-700 px-6 py-3 font-bold text-white transition-colors hover:bg-blue-800"
                >
                  <Play className="h-5 w-5" /> Jogar agora
                </Link>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                  <Ban className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-black text-gray-900">{game.title} não está disponível</h1>
                <p className="text-gray-600">
                  De momento este jogo está fechado. Volta mais tarde ou experimenta outro jogo no Centro de Jogos.
                </p>
                <div className="flex flex-col items-center gap-2 pt-2">
                  <Link
                    href="/jogos"
                    className="flex min-h-12 w-full max-w-xs items-center justify-center rounded-2xl bg-blue-700 px-6 py-3 font-bold text-white transition-colors hover:bg-blue-800"
                  >
                    Ver outros jogos
                  </Link>
                  {!user && setting.enabled && (
                    <Link
                      href={`/login?next=${encodeURIComponent(game.href)}`}
                      className="flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:underline"
                    >
                      <LogIn className="h-4 w-4" /> És da liderança? Entra na tua conta
                    </Link>
                  )}
                  {role === 'coordenador' && (
                    <Link
                      href="/admin?tab=games"
                      className="flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:underline"
                    >
                      <Settings className="h-4 w-4" /> Gerir disponibilidade
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
