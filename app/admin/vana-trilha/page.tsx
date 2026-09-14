import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { isAdminRole } from '@/utils/permissions'
import { getTodayStats, listQuestions } from '@/lib/actions/vana-trilha'
import { getStation, VANATRILHA_STATIONS } from '@/types/vana-trilha'
import { DIFFICULTY_LABEL } from '@/utils/vana-trilha-labels'
import QuestionBankClient from './QuestionBankClient'

export const dynamic = 'force-dynamic'

export default async function VanaTrilhaAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/vana-trilha')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (!isAdminRole(profile)) redirect('/')

  const [{ questions, error }, { stats }] = await Promise.all([listQuestions(), getTodayStats()])
  const todayStation = stats ? getStation(stats.station) : null

  // Contagem de perguntas ativas por estação × dificuldade (mínimo recomendado: 3/3/2 + reservas).
  const counts = VANATRILHA_STATIONS.map((s) => {
    const active = questions.filter((q) => q.station === s.id && q.is_active)
    return {
      station: s,
      facil: active.filter((q) => q.difficulty === 'facil').length,
      media: active.filter((q) => q.difficulty === 'media').length,
      dificil: active.filter((q) => q.difficulty === 'dificil').length,
      total: active.length,
    }
  })

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="space-y-3">
            <Link
              href="/admin"
              className="group inline-flex items-center gap-2 font-medium text-gray-500 transition-colors hover:text-amber-700"
            >
              <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" /> Voltar à Gestão
            </Link>
            <div className="flex items-center gap-4">
              <img src="/images/VanaTrilha.png" alt="" className="h-14 w-14 object-contain" />
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Gestão VanaTrilha</h1>
                <p className="text-slate-500">Banco de perguntas do desafio bíblico diário.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/jogos/vana-trilha/como-jogar"
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-50"
            >
              Página Como Jogar <ExternalLink className="h-4 w-4" />
            </Link>
            <Link
              href="/jogos/vana-trilha"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600"
            >
              Abrir o jogo
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-bold">Não foi possível carregar as perguntas.</p>
            <p>{error}</p>
            <p className="mt-1 text-red-600">
              Confirma que correste <code>supabase-setup-vana-trilha.sql</code> e{' '}
              <code>supabase-seed-vana-trilha-questions.sql</code> no Supabase.
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {stats && todayStation && (
            <div className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Etapa de hoje</p>
              <p className="text-xl font-black text-slate-900">
                {todayStation.id}. {todayStation.name}
              </p>
              <p className="mb-4 text-sm text-slate-500">{stats.run_date.split('-').reverse().join('/')}</p>
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-2">
                {[
                  { label: 'Começaram', value: stats.total, cls: 'text-slate-900' },
                  { label: 'Completaram', value: stats.completed, cls: 'text-emerald-600' },
                  { label: 'Sem vidas', value: stats.failed, cls: 'text-rose-600' },
                  { label: 'Perfeitas', value: stats.perfect, cls: 'text-amber-600' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl bg-slate-50 p-3">
                    <p className={`text-2xl font-black ${item.cls}`}>{item.value}</p>
                    <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-3xl border border-amber-100 bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Perguntas ativas por estação</p>
            <p className="mb-3 text-sm text-slate-500">
              Cada etapa usa 3 fáceis + 3 médias + 2 difíceis. Ter pelo menos 5 de cada dá variedade e perguntas de
              reserva para quando alguém erra.
            </p>
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-1.5">Estação</th>
                  <th className="py-1.5 text-center">{DIFFICULTY_LABEL.facil}</th>
                  <th className="py-1.5 text-center">{DIFFICULTY_LABEL.media}</th>
                  <th className="py-1.5 text-center">{DIFFICULTY_LABEL.dificil}</th>
                  <th className="py-1.5 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counts.map((row) => (
                  <tr key={row.station.id} className={row.station.id === stats?.station ? 'bg-amber-50/60' : ''}>
                    <td className="py-2 font-semibold text-slate-700">
                      {row.station.id}. {row.station.name}
                    </td>
                    {([
                      [row.facil, 3],
                      [row.media, 3],
                      [row.dificil, 2],
                    ] as const).map(([n, min], i) => (
                      <td key={i} className="py-2 text-center">
                        <span
                          className={`inline-block min-w-8 rounded-full px-2 py-0.5 font-bold ${
                            n < min ? 'bg-red-100 text-red-700' : n < 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {n}
                        </span>
                      </td>
                    ))}
                    <td className="py-2 text-center font-black text-slate-900">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <QuestionBankClient initialQuestions={questions} />
      </main>
    </div>
  )
}
