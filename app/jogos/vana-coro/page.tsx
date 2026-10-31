import Link from 'next/link'
import { ChevronLeft, MessageCircleQuestion } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { effectiveRole } from '@/utils/permissions'

// Só a coordenação chega aqui (o jogo está escondido em Gestão → Jogos).
// O jogo ao vivo é a Fase 3 da spec (docs/VanaCoro.md); por agora há só a recolha.
export default async function VanaCoroPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user
    ? (await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()).data
    : null
  const isCoord = effectiveRole(profile) === 'coordenador'

  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-700 via-purple-900 to-indigo-950 text-white">
      <Navbar user={user} profile={profile} />
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <Link href="/jogos" className="inline-flex items-center gap-1 text-sm font-semibold text-white/60 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> Centro de Jogos
        </Link>
        <h1 className="mt-6 text-5xl font-black tracking-tight">VanaCoro</h1>
        <p className="mt-2 text-lg font-semibold text-amber-300">O que é que o JA disse?</p>
        <div className="mt-8 rounded-3xl bg-white/10 p-6 ring-1 ring-white/15">
          <p className="font-bold">O jogo ao vivo ainda está em construção.</p>
          <p className="mt-1 text-sm text-white/70">
            Para já estamos a encher o banco de perguntas com a Pergunta da Semana.
          </p>
          {isCoord && (
            <Link
              href="/admin/vana-coro"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-5 py-3 font-bold text-purple-950 transition-colors hover:bg-amber-300"
            >
              <MessageCircleQuestion className="h-4 w-4" /> Gerir as perguntas
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
