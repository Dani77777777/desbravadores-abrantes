import Link from 'next/link'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { DailyPlayersCard } from '@/components/admin/DailyPlayersCard'
import { GameAvailabilityBanner } from '../components/GameAvailabilityBanner'
import { getDailyPlayersStats } from '@/lib/actions/daily-game-stats'
import { isAdminRole } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function VanaCodigoAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/vana-codigo')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (!isAdminRole(profile)) redirect('/')

  const dailyStats = await getDailyPlayersStats('vana_codigo_sessions')

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-3">
            <Link href="/admin?tab=games" className="group inline-flex items-center gap-2 font-medium text-slate-500 transition-colors hover:text-emerald-700">
              <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" /> Voltar aos Jogos
            </Link>
            <div className="flex items-center gap-4">
              <img src="/images/VanaCodigo.png" alt="" className="h-14 w-14 object-contain" />
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Gestão VanaCódigo</h1>
                <p className="text-slate-500">Acompanhamento do desafio diário de decifração.</p>
              </div>
            </div>
          </div>
          <Link href="/jogos/vana-codigo" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
            Abrir o jogo <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        <GameAvailabilityBanner gameId="vana-codigo" />

        <div className="max-w-sm">
          <DailyPlayersCard date={dailyStats.date} players={dailyStats.players} accent="emerald" />
        </div>
      </main>
    </div>
  )
}
