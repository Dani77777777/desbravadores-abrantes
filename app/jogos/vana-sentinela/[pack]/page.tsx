import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import SentinelaGame from '@/components/vana-sentinela/SentinelaGame'
import { getPack, getPackDisponivel } from '@/utils/vana-sentinela/packs'
import { effectiveRole } from '@/utils/permissions'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ pack: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pack = getPack((await params).pack)
  return {
    title: pack ? `VanaSentinela — ${pack.cidade}` : 'VanaSentinela',
    description: 'Verdade ou Distorção? Arrasta as cartas e mostra que estiveste atento à pregação.',
  }
}

// Público: qualquer pessoa joga sem conta. Só os membros com sessão gravam no ranking.
export default async function VanaSentinelaPackPage({ params }: Props) {
  const { pack: slug } = await params
  if (!getPack(slug)) notFound()
  const pack = getPackDisponivel(slug)
  if (!pack) redirect('/jogos/vana-sentinela')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const profile = user
    ? (await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()).data
    : null
  const isMember = !!profile

  let recorde: number | null = null
  if (user && isMember) {
    const { data } = await supabase
      .from('vana_sentinela_scores')
      .select('points')
      .eq('user_id', user.id)
      .eq('pack', pack.slug)
      .order('points', { ascending: false })
      .limit(1)
      .maybeSingle()
    recorde = data?.points ?? null
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-blue-950">
      <Navbar user={user} profile={profile} />

      <main className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(50% 30% at 100% 0%, rgba(52,211,153,.14), transparent 70%), radial-gradient(50% 40% at 0% 30%, rgba(99,102,241,.28), transparent 70%), radial-gradient(40% 30% at 100% 100%, rgba(249,115,22,.14), transparent 70%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
          <Link
            href="/jogos/vana-sentinela"
            className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-blue-100/70 transition-colors hover:text-yellow-300"
          >
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Escolher outra pregação
          </Link>

          <SentinelaGame
            pack={pack}
            isMember={isMember}
            isCoordinator={effectiveRole(profile) === 'coordenador'}
            recordeInicial={recorde}
          />
        </div>
      </main>
    </div>
  )
}
