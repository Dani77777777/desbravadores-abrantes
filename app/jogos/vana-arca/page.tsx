import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { Navbar } from '@/components/layout/Navbar'
import VanaArcaGame from '@/components/vana-arca/VanaArcaGame'
import {
  currentMultiplier,
  loadPeriodStandings,
  loadPlayerStatus,
  processVanaArcaPayouts,
  toPublicBoards,
} from '@/lib/vana-arca-server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'VanaArca — Carrega a Arca',
  description: 'Carrega a arca dois a dois sem a deixar virar! Joga as vezes que quiseres.',
}

export default async function VanaArcaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jogos/vana-arca')

  // Rede de segurança sem pg_cron: paga os períodos semanais que já acabaram.
  await processVanaArcaPayouts()

  const service = createServiceClient()
  const [{ data: profile }, standings, multiplier] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    // null = tabelas por criar (supabase-setup-vana-arca.sql por correr).
    loadPeriodStandings(service).catch(() => null),
    currentMultiplier(),
  ])
  const status = standings
    ? await loadPlayerStatus(service, user.id, standings.settings, standings.period, multiplier)
    : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-slate-50">
      <Navbar user={user} profile={profile} />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8 lg:px-8">
        <Link
          href="/jogos"
          className="group mb-5 inline-flex items-center gap-2 font-medium text-gray-500 transition-colors hover:text-sky-700"
        >
          <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" /> Voltar ao Hub de Jogos
        </Link>

        {standings && status ? (
          <VanaArcaGame
            initialStatus={status}
            initialBoards={toPublicBoards(standings, user.id)}
            tiers={{
              reward_low: standings.settings.reward_low,
              reward_mid: standings.settings.reward_mid,
              reward_high: standings.settings.reward_high,
              mid_from: standings.settings.mid_from,
              high_from: standings.settings.high_from,
            }}
            playerName={profile?.full_name?.trim().split(/\s+/)[0] ?? null}
          />
        ) : (
          <p className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">
            O VanaArca ainda não está pronto. Volta daqui a pouco!
          </p>
        )}
      </main>
    </div>
  )
}
