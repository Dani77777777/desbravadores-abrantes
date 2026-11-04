import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { createVanaSketchSession } from '@/lib/actions/vana-sketch'
import { getVanaSketchPacksWithWords } from '@/lib/actions/vana-sketch-packs'
import { WordPacksManager } from '@/components/vana-sketch/WordPacksManager'
import { effectiveRole } from '@/utils/permissions'
import { ChevronLeft, Plus, MonitorPlay, Gamepad2, FlaskConical, Layers, AlertTriangle } from 'lucide-react'
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
  const [{ data: sessions }, packs] = await Promise.all([
    service
      .from('vanasketch_sessions')
      // Há duas FKs entre sessões e jogadores (players.session_id e sessions.drawer_player_id):
      // sem indicar qual, o PostgREST recusa o embed e a lista vinha vazia.
      .select('*, vanasketch_players!vanasketch_players_session_id_fkey(count)')
      .eq('host_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    getVanaSketchPacksWithWords(),
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

        <section className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-gray-700 text-lg">
              <Layers className="w-5 h-5 text-pink-600" /> Packs de palavras
            </h2>
            <p className="text-sm text-slate-500">
              Escolhes os packs no lobby antes de começar — por exemplo, só o de Natal num evento de Natal.
              Os marcados com ★ vêm já escolhidos.
            </p>
          </div>
          {packs === null ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
              <span>
                Os packs ainda não existem na base de dados. Corre <code className="font-mono font-bold">supabase-migration-vana-sketch-packs.sql</code> no
                Supabase — até lá, o jogo usa a lista de reserva que vem no código.
              </span>
            </div>
          ) : (
            <WordPacksManager packs={packs} />
          )}
        </section>
      </main>
    </div>
  )
}
