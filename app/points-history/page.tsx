import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { Trophy, Coins, ArrowLeft, Calendar, TrendingUp, TrendingDown, ListChecks, History } from 'lucide-react'
import Link from 'next/link'
import { displayFont } from '@/components/landing/fonts'
import { SiteFooter } from '@/components/landing/SiteFooter'

const D = displayFont.className
const TZ = 'Europe/Lisbon'

export default async function PointsHistoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/onboarding')
  }

  const { data: pointsLog } = await supabase
    .from('points_log')
    .select('*')
    .eq('target_user_id', user.id)
    .order('created_at', { ascending: false })

  const entries = pointsLog || []
  const totalXp = entries.reduce((sum, entry) => sum + (entry.amount_xp || 0), 0)
  const totalGold = entries.reduce((sum, entry) => sum + (entry.amount_gold || 0), 0)

  // Agrupar por mês ("setembro de 2026"), mantendo a ordem mais recente primeiro
  const months: { label: string; items: typeof entries }[] = []
  for (const entry of entries) {
    const label = new Date(entry.created_at).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric', timeZone: TZ })
    const last = months[months.length - 1]
    if (last && last.label === label) last.items.push(entry)
    else months.push({ label, items: [entry] })
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-blue-950">
      <Navbar user={user} profile={profile} />

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-24 pt-10 text-white md:pt-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(40% 50% at 85% 20%, rgba(250,204,21,.2), transparent 70%), radial-gradient(45% 60% at 5% 60%, rgba(99,102,241,.3), transparent 70%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-blue-100/80 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
          </Link>

          <div className="lp-rise mt-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">
              <History className="h-3.5 w-3.5" /> Histórico de Pontos
            </span>
            <h1 className={`${D} mt-4 text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl`}>
              Tudo o que <span className="text-yellow-400">conquistaste.</span>
            </h1>
            <p className="mt-3 text-blue-100/75">Todos os pontos e moedas recebidos, {profile.full_name}.</p>
          </div>

          <div className="lp-rise mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3" style={{ '--d': '150ms' } as React.CSSProperties}>
            <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-violet-700 p-5 shadow-xl shadow-indigo-950/40">
              <Trophy aria-hidden className="absolute -bottom-4 -right-4 h-20 w-20 text-white/10" />
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-100">XP Total Ganho</p>
              <p className={`${D} mt-1 text-3xl font-extrabold leading-none sm:text-4xl`}>{totalXp}</p>
            </div>
            <div className="relative overflow-hidden rounded-[1.5rem] bg-yellow-400 p-5 text-blue-950 shadow-xl shadow-yellow-900/30">
              <Coins aria-hidden className="absolute -bottom-4 -right-4 h-20 w-20 text-amber-600/20" />
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-950/70">Gold Total Ganho</p>
              <p className={`${D} mt-1 text-3xl font-extrabold leading-none sm:text-4xl`}>{totalGold}</p>
            </div>
            <div className="relative col-span-2 overflow-hidden rounded-[1.5rem] bg-white/[0.07] p-5 ring-1 ring-inset ring-white/10 sm:col-span-1">
              <ListChecks aria-hidden className="absolute -bottom-4 -right-4 h-20 w-20 text-white/5" />
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-100/70">Entradas</p>
              <p className={`${D} mt-1 text-3xl font-extrabold leading-none sm:text-4xl`}>{entries.length}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Registo de atividade ──────────────────────────────── */}
      <div className="relative -mt-10 rounded-t-[2.5rem] bg-stone-50 pb-20 pt-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className={`${D} text-2xl font-extrabold text-blue-950`}>Registo de Atividade</h2>
          <p className="text-sm text-stone-500">{entries.length} entradas no histórico</p>

          {months.length > 0 ? (
            <div className="mt-6 space-y-8">
              {months.map((month) => (
                <section key={month.label}>
                  {/* O mês fica colado por baixo do header enquanto se percorre a lista */}
                  <div className="sticky top-20 z-10 mb-3">
                    <h3 className="inline-flex rounded-full bg-blue-950 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-yellow-300 shadow-md">
                      {month.label}
                    </h3>
                  </div>
                  <ol className="space-y-2.5">
                    {month.items.map((entry) => {
                      const gained = (entry.amount_xp || 0) + (entry.amount_gold || 0) >= 0
                      return (
                        <li
                          key={entry.id}
                          className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-stone-200 transition-shadow hover:shadow-md sm:gap-4 sm:p-4"
                        >
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${gained ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                            {gained ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-blue-950 sm:text-base">{entry.description}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-400">
                              <Calendar className="h-3 w-3" />
                              {new Date(entry.created_at).toLocaleDateString('pt-PT', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                                timeZone: TZ,
                              })}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                            {entry.amount_xp !== 0 && (
                              <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${entry.amount_xp > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`}>
                                {entry.amount_xp > 0 ? '+' : ''}{entry.amount_xp} XP
                              </span>
                            )}
                            {entry.amount_gold !== 0 && (
                              <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${entry.amount_gold > 0 ? 'bg-yellow-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {entry.amount_gold > 0 ? '+' : ''}{entry.amount_gold} 🪙
                              </span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[2rem] border-2 border-dashed border-stone-200 bg-white py-16 text-center">
              <div className="mx-auto flex h-16 w-16 -rotate-6 items-center justify-center rounded-2xl bg-yellow-400 text-blue-950 shadow-md">
                <Trophy className="h-8 w-8" />
              </div>
              <p className="mt-5 font-bold text-blue-950">Ainda não há pontos registados.</p>
              <p className="mt-1 text-sm text-stone-500">Participa nas atividades para ganhar XP e Gold!</p>
            </div>
          )}
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
