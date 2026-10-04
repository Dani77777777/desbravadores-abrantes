import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import PackLobby, { type PackResumo } from '@/components/vana-sentinela/PackLobby'
import { PACKS } from '@/utils/vana-sentinela/packs'
import { effectiveRole } from '@/utils/permissions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'VanaSentinela — Verdade ou Distorção?',
  description: 'Arrasta as cartas: foi isto que a pregação disse, ou está torcido? Jogo do clube sobre as pregações do Evangelista Jefferson Araújo.',
}

export default async function VanaSentinelaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const profile = user
    ? (await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()).data
    : null
  const isMember = !!profile

  // Recorde pessoal por pack (as RLS só deixam ler as próprias pontuações).
  const recordes: Record<string, number> = {}
  if (user && isMember) {
    const { data } = await supabase
      .from('vana_sentinela_scores')
      .select('pack, points')
      .eq('user_id', user.id)
      .order('points', { ascending: false })
      .limit(200)
    for (const row of data ?? []) {
      if (recordes[row.pack] === undefined) recordes[row.pack] = row.points
    }
  }

  const packs: PackResumo[] = PACKS.map((p) => ({
    slug: p.slug,
    cidade: p.cidade,
    titulo: p.titulo,
    orador: p.orador,
    disponivel: p.disponivel && p.cartas.length > 0,
    numCartas: p.cartas.length,
  }))

  return (
    <div className="min-h-screen overflow-x-clip bg-blue-950">
      <Navbar user={user} profile={profile} />

      <main className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(40% 30% at 90% 5%, rgba(52,211,153,.18), transparent 70%), radial-gradient(45% 35% at 0% 20%, rgba(99,102,241,.3), transparent 70%), radial-gradient(40% 40% at 100% 80%, rgba(249,115,22,.15), transparent 70%)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
          <Link
            href="/jogos"
            className="group mb-6 inline-flex items-center gap-2 font-medium text-blue-100/70 transition-colors hover:text-yellow-300"
          >
            <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" /> Voltar ao Hub de Jogos
          </Link>

          <header className="mb-8 flex flex-col items-center gap-5 text-center text-white sm:flex-row sm:text-left">
            <img src="/images/VanaSentinela.jpeg" alt="VanaSentinela" className="h-28 w-28 shrink-0 rounded-3xl object-cover shadow-2xl ring-2 ring-white/20" />
            <div>
              <h1 className="text-5xl font-black tracking-tight sm:text-6xl">VanaSentinela</h1>
              <p className="mt-1 text-xl font-extrabold">
                <span className="text-emerald-300">✓ Verdade</span> <span className="text-blue-100/60">ou</span>{' '}
                <span className="text-orange-300">✗ Distorção</span>?
              </p>
              <p className="mt-2 max-w-xl text-blue-100/75">
                Estiveste atento à pregação? Cada carta traz uma afirmação: umas foram ditas, outras parecem certas mas
                estão torcidas. Sê a sentinela que não deixa passar nenhuma.
              </p>
            </div>
          </header>

          <PackLobby
            packs={packs}
            recordes={recordes}
            isMember={isMember}
            isCoordinator={effectiveRole(profile) === 'coordenador'}
          />
        </div>
      </main>
    </div>
  )
}
