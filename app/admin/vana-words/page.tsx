import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Navbar } from '@/components/layout/Navbar'
import { createVanaWordsSession, addWordToBank, addWordsToBank, deleteWordFromBank } from '@/lib/actions/vana-words'
import { ChevronLeft, Plus, FlaskConical, ExternalLink, Users, Clock, Trash2, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { WordBankClient } from './WordBankClient'

export default async function VanaWordsAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'coordenador' || profile?.role === 'dirigente'
  if (!isAdmin) redirect('/')

  const service = createServiceClient()

  const [{ data: sessions }, { data: wordBank }] = await Promise.all([
    service
      .from('vanawords_sessions')
      .select('*, vanawords_players(count)')
      .eq('host_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    service
      .from('vanawords_word_bank')
      .select('id, word, created_at')
      .order('word'),
  ])

  async function handleCreate() {
    'use server'
    const id = await createVanaWordsSession(false)
    redirect(`/jogos/vana-words/${id}/control`)
  }

  async function handleCreateTest() {
    'use server'
    const id = await createVanaWordsSession(true)
    redirect(`/jogos/vana-words/${id}/control`)
  }

  async function handleDeleteWord(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    await deleteWordFromBank(id)
    revalidatePath('/admin/vana-words')
  }

  async function handleAddWord(formData: FormData) {
    'use server'
    const word = formData.get('word') as string
    await addWordToBank(word)
    revalidatePath('/admin/vana-words')
  }

  async function handleBulkAdd(formData: FormData) {
    'use server'
    const raw = formData.get('words') as string
    // Aceita separadores: vírgula, ponto e vírgula, nova linha
    const words = raw.split(/[,;\n]+/).map((w) => w.trim()).filter(Boolean)
    await addWordsToBank(words)
    revalidatePath('/admin/vana-words')
  }

  const statusLabels: Record<string, string> = {
    lobby: 'Lobby',
    team_preview: 'A definir equipas',
    arauto_spin: 'A escolher Arautos',
    arauto_ready: 'Arautos prontos',
    playing: 'A jogar',
    finished: 'Terminado',
  }

  const wordCount = wordBank?.length ?? 0
  const enoughWords = wordCount >= 25

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-slate-500 hover:text-slate-700">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">VanaWords — Admin</h1>
        </div>

        {/* ── Sessões ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-lg">Sessões</h2>
            <div className="flex gap-3">
              <form action={handleCreate}>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" /> Nova Sessão
                </button>
              </form>
              <form action={handleCreateTest}>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  <FlaskConical className="w-4 h-4" /> Teste (Bots)
                </button>
              </form>
            </div>
          </div>

          {!enoughWords && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-sm">
              ⚠️ O banco de palavras tem apenas <strong>{wordCount}</strong> palavra(s). São necessárias pelo menos 25 para iniciar um jogo.
              {wordCount === 0 && ' Usa a lista integrada adicionando palavras abaixo, ou o jogo usará automaticamente a lista padrão como fallback.'}
            </div>
          )}

          {(!sessions || sessions.length === 0) && (
            <p className="text-slate-500 text-sm">Ainda não criaste nenhuma sessão.</p>
          )}
          <div className="space-y-3">
            {sessions?.map((s) => {
              const playerCount = (s.vanawords_players as any)?.[0]?.count ?? 0
              const isActive = s.status !== 'finished'
              return (
                <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-50 rounded-xl px-3 py-2 text-center min-w-[56px]">
                      <p className="text-emerald-700 font-black text-lg tracking-widest">{s.code}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 flex items-center gap-2">
                        {statusLabels[s.status] ?? s.status}
                        {s.is_test_session && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">TESTE</span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 text-slate-400 text-xs mt-0.5">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {playerCount}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(s.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isActive && (
                      <Link
                        href={`/jogos/vana-words/${s.id}/control`}
                        className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Abrir
                      </Link>
                    )}
                    <Link
                      href={`/jogos/vana-words/${s.id}/present`}
                      target="_blank"
                      className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold"
                    >
                      Projetor
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Banco de Palavras ────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-slate-500" />
            <h2 className="font-semibold text-gray-700 text-lg">
              Banco de Palavras
              <span className="ml-2 text-sm font-normal text-slate-400">({wordCount} palavra{wordCount !== 1 ? 's' : ''})</span>
            </h2>
          </div>

          <p className="text-slate-500 text-sm">
            As palavras aqui definidas serão usadas nas grelhas dos jogos.
            {wordCount < 25
              ? ` Adiciona pelo menos 25 palavras para as usar (actualmente ${wordCount}). Enquanto houver menos de 25, o jogo usa a lista padrão integrada.`
              : ' O jogo usará estas palavras em vez da lista padrão.'}
          </p>

          {/* Client component para interactividade em tempo real */}
          <WordBankClient
            initialWords={wordBank ?? []}
            onAddWord={handleAddWord}
            onBulkAdd={handleBulkAdd}
            onDeleteWord={handleDeleteWord}
          />
        </section>
      </main>
    </div>
  )
}
