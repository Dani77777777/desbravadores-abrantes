import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { GameAvailabilityBanner } from '../components/GameAvailabilityBanner'
import { effectiveRole } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { processVanaArcaPayouts, loadVanaArcaSettings } from '@/lib/vana-arca-server'
import { getAdminPreview, getPayoutHistory } from '@/lib/actions/vana-arca'
import VanaArcaAdmin from '@/components/vana-arca/VanaArcaAdmin'

export const dynamic = 'force-dynamic'

export default async function VanaArcaAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/vana-arca')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (effectiveRole(profile) !== 'coordenador') redirect('/')

  // Rede de segurança sem pg_cron: paga os períodos semanais que já acabaram.
  await processVanaArcaPayouts()

  const [settings, preview, history] = await Promise.all([
    loadVanaArcaSettings().catch(() => null),
    getAdminPreview().catch(() => null),
    getPayoutHistory().catch(() => []),
  ])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar user={user} profile={profile} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-3">
            <Link href="/admin?tab=games" className="group inline-flex items-center gap-2 font-medium text-slate-500 transition-colors hover:text-sky-700">
              <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" /> Voltar aos Jogos
            </Link>
            <div className="flex items-center gap-4">
              <img src="/images/VanaArca.jpeg" alt="" className="h-14 w-14 rounded-xl object-cover" />
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Gestão VanaArca</h1>
                <p className="text-slate-500">Prémios semanais, partidas pagas por dia e histórico de pagamentos.</p>
              </div>
            </div>
          </div>
          <Link href="/jogos/vana-arca" className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800">
            Abrir o jogo <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        <GameAvailabilityBanner gameId="vana-arca" />

        {settings && preview ? (
          <VanaArcaAdmin initialSettings={settings} preview={preview} history={history} />
        ) : (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Falta correr o <code>supabase-setup-vana-arca.sql</code> no Supabase.
          </p>
        )}
      </main>
    </div>
  )
}
