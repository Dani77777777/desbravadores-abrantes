import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import DailyGame from '@/components/vana-trilha/DailyGame'
import { getDailyState, getStationProgress } from '@/lib/actions/vana-trilha'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'VanaTrilha — A Rota da Promessa',
  description: 'Desafio bíblico diário: do Egito à Terra Prometida.',
}

export default async function VanaTrilhaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jogos/vana-trilha')

  const [{ data: profile }, state, progress] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    getDailyState(),
    getStationProgress(),
  ])

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/70 via-stone-50 to-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8 lg:px-8">
        <Link
          href="/jogos"
          className="group mb-5 inline-flex items-center gap-2 font-medium text-gray-500 transition-colors hover:text-amber-700"
        >
          <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" /> Voltar ao Hub de Jogos
        </Link>

        <DailyGame
          initialState={state}
          initialProgress={{ stations: progress.stations, badge_unlocked: progress.badge_unlocked }}
          playerName={profile?.full_name?.trim().split(/\s+/)[0] ?? null}
        />
      </main>
    </div>
  )
}
