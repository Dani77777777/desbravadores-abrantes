import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'
import { ChevronLeft, Plus, Trash2, Pencil, ListChecks, BookOpen, History, Users, Trophy, ChevronRight } from 'lucide-react'
import { startSession } from '@/lib/actions/vana-quest'
import { DeleteSessionButton } from '@/components/vana-quest/DeleteSessionButton'

export default async function VanaQuestAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'coordenador' || profile?.role === 'dirigente'
  if (!isAdmin) redirect('/')

  const { data: quests } = await supabase
    .from('vana_quests')
    .select('*, vana_quest_questions(count)')
    .order('created_at', { ascending: false })

  const { data: sessions } = await supabase
    .from('vana_quest_sessions')
    .select('*, vana_quests(title), vana_quest_participants(count)')
    .order('created_at', { ascending: false })
    .limit(30)

  async function handleCreate(formData: FormData) {
    'use server'
    const s = await (await import('@/utils/supabase/server')).createClient()
    const { data: { user: u } } = await s.auth.getUser()
    if (!u) return
    await s.from('vana_quests').insert({
      title: formData.get('title') as string,
      description: (formData.get('description') as string) || null,
      created_by: u.id,
    })
    revalidatePath('/admin/vana-quest')
  }

  async function handleDelete(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    const s = await (await import('@/utils/supabase/server')).createClient()
    await s.from('vana_quests').delete().eq('id', id)
    revalidatePath('/admin/vana-quest')
  }

  async function handleStart(formData: FormData) {
    'use server'
    const questId = formData.get('questId') as string
    const sessionId = await startSession(questId)
    redirect(`/jogos/vana-quest/${sessionId}/control`)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-gray-500 hover:text-gray-900 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <img src="/images/VanaQuest.png" alt="VanaQuest" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">VanaQuest</h1>
              <p className="text-sm text-gray-500">Gestão de quizzes interativos</p>
            </div>
          </div>
        </div>

        {/* Create */}
        <div className="bg-white rounded-2xl border shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" /> Criar novo VanaQuest
          </h2>
          <form action={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <input
              name="title"
              required
              placeholder="Título do VanaQuest"
              className="flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              name="description"
              placeholder="Descrição (opcional)"
              className="flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-800 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Criar
            </button>
          </form>
        </div>

        {/* Quest list */}
        <div className="space-y-3">
          {(!quests || quests.length === 0) && (
            <div className="bg-white rounded-2xl border shadow-sm p-12 text-center text-gray-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Ainda não existem VanaQuests.</p>
              <p className="text-sm">Cria o primeiro acima.</p>
            </div>
          )}

          {quests?.map((quest) => {
            const questionCount = (quest.vana_quest_questions as any)?.[0]?.count ?? 0
            return (
              <div key={quest.id} className="bg-white rounded-2xl border shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{quest.title}</h3>
                  {quest.description && (
                    <p className="text-sm text-gray-500 truncate">{quest.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-full px-2.5 py-0.5">
                      <ListChecks className="w-3 h-3" /> {questionCount} pergunta{questionCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(quest.created_at).toLocaleDateString('pt-PT')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/vana-quest/${quest.id}`}
                    className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border hover:bg-gray-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Perguntas
                  </Link>

                  <form action={handleStart}>
                    <input type="hidden" name="questId" value={quest.id} />
                    <button
                      type="submit"
                      disabled={questionCount === 0}
                      className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ▶ Iniciar
                    </button>
                  </form>

                  <form action={handleDelete}>
                    <input type="hidden" name="id" value={quest.id} />
                    <button
                      type="submit"
                      className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>

        {/* Past sessions */}
        {sessions && sessions.length > 0 && (
          <div className="space-y-3 pt-6">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" /> Sessões anteriores
            </h2>

            <div className="space-y-2">
              {sessions.map((s) => {
                const playerCount = (s.vana_quest_participants as any)?.[0]?.count ?? 0
                const statusLabel: Record<string, { label: string; color: string }> = {
                  waiting: { label: 'Em sala de espera', color: 'bg-purple-100 text-purple-700' },
                  question_intro: { label: 'A decorrer', color: 'bg-blue-100 text-blue-700' },
                  question_active: { label: 'A decorrer', color: 'bg-blue-100 text-blue-700' },
                  question_results: { label: 'A decorrer', color: 'bg-blue-100 text-blue-700' },
                  question_leaderboard: { label: 'A decorrer', color: 'bg-blue-100 text-blue-700' },
                  finished: { label: 'Terminada', color: 'bg-green-100 text-green-700' },
                }
                const sLabel = statusLabel[s.status] || statusLabel.waiting

                return (
                  <div
                    key={s.id}
                    className="bg-white rounded-2xl border shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex items-center"
                  >
                    <Link
                      href={`/admin/vana-quest/sessions/${s.id}`}
                      className="flex-1 min-w-0 flex items-center gap-4 p-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${sLabel.color}`}>
                            {sLabel.label}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">PIN {s.pin}</span>
                        </div>
                        <p className="font-semibold text-gray-900 text-sm truncate">{(s.vana_quests as any)?.title || 'Sem título'}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {playerCount}</span>
                          <span>{new Date(s.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </Link>
                    {s.status === 'finished' && (
                      <div className="pr-3 flex-shrink-0">
                        <DeleteSessionButton
                          sessionId={s.id}
                          sessionTitle={(s.vana_quests as any)?.title || 'sessão'}
                          compact
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
