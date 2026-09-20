import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { createVanaSketchSession } from '@/lib/actions/vana-sketch'
import { effectiveRole } from '@/utils/permissions'
import { ChevronLeft, Plus, MonitorPlay, Gamepad2, BookOpen, FlaskConical } from 'lucide-react'
import Link from 'next/link'

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  lobby: { label: 'Sala de espera', cls: 'bg-blue-100 text-blue-700' },
  playing: { label: 'A decorrer', cls: 'bg-green-100 text-green-700' },
  finished: { label: 'Terminada', cls: 'bg-gray-100 text-gray-500' },
}

export default async function VanaSketchAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = effectiveRole(profile)
  if (role !== 'coordenador' && role !== 'dirigente') redirect('/')

  const service = createServiceClient()
  const [{ data: sessions }, { count: dictCount }] = await Promise.all([
    service
      .from('vanasketch_sessions')
      .select('*, vanasketch_players(count)')
      .eq('host_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    service.from('vantur_dictionary').select('id', { count: 'exact', head: true }),
  ])

  async function handleCreate() {
    'use server'
    const id = await createVanaSketchSession(false)
    redirect(`/jogos/vana-sketch/${id}/control`)
  }

  async function handleCreateTest() {
    'use server'
    const id = await createVanaSketchSession(true)
    redirect(`/jogos/vana-sketch/${id}/control`)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center gap-3">
          <Link href="/admin?tab=games" className="text-slate-500 hover:text-slate-700" title="Voltar aos Jogos">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">VanaSketch — Admin</h1>
        </div>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-gray-700 text-lg">Sessões recentes</h2>
            <div className="flex gap-2 sm:gap-3">
              <form action={handleCreate} className="flex-1 sm:flex-none">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" /> Nova Sessão
                </button>
              </form>
              <form action={handleCreateTest} className="flex-1 sm:flex-none">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  <FlaskConical className="w-4 h-4" /> Teste (Bots)
                </button>
              </form>
            </div>
          </div>

          <div className="bg-white border rounded-xl px-4 py-3 text-sm text-slate-600 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              As palavras vêm do <strong>dicionário bíblico do Vantur</strong>
              {typeof dictCount === 'number' && <> ({dictCount} palavra{dictCount !== 1 ? 's' : ''})</>}.
              Gere-as em <Link href="/admin/vantur" className="text-pink-600 underline">Admin → Vantur</Link>.
            </span>
          </div>

          {(!sessions || sessions.length === 0) ? (
            <div className="bg-white border rounded-xl p-8 text-center text-slate-400">
              <Gamepad2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Ainda não criaste nenhuma sessão.
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s: any) => {
                const status = STATUS_LABEL[s.status] ?? STATUS_LABEL.finished
                const playerCount = s.vanasketch_players?.[0]?.count ?? 0
                return (
                  <div key={s.id} className="bg-white border rounded-xl p-4 flex flex-wrap items-center gap-3">
                    <span className="font-mono font-black text-lg tracking-widest text-gray-800">{s.code}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${status.cls}`}>
                      {status.label}
                    </span>
                    {s.is_test_session && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase bg-purple-100 text-purple-700">
                        Teste
                      </span>
                    )}
                    <span className="text-sm text-slate-500">
                      {playerCount} jogador{playerCount !== 1 ? 'es' : ''}
                      {' · '}{new Date(s.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Link
                        href={`/jogos/vana-sketch/${s.id}/present`}
                        target="_blank"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <MonitorPlay className="w-4 h-4" /> Projetor
                      </Link>
                      <Link
                        href={`/jogos/vana-sketch/${s.id}/control`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold"
                      >
                        Controlo →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
