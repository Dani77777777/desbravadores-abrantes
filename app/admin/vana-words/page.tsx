import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Navbar } from '@/components/layout/Navbar'
import { createVanaWordsSession, addWordToBank, addWordsToBank, deleteWordFromBank } from '@/lib/actions/vana-words'
import { ChevronLeft, Plus, FlaskConical, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { WordBankClient } from './WordBankClient'
import { SessionsClient } from './SessionsClient'

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-gray-700 text-lg">Sessões recentes</h2>
            <div className="flex gap-2 sm:gap-3">
              <form action={handleCreate} className="flex-1 sm:flex-none">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors"
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

          {!enoughWords && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-sm">
              ⚠️ O banco de palavras tem apenas <strong>{wordCount}</strong> palavra(s). São necessárias pelo menos 25 para iniciar um jogo.
              {wordCount === 0 && ' Usa a lista integrada adicionando palavras abaixo, ou o jogo usará automaticamente a lista padrão como fallback.'}
            </div>
          )}

          <SessionsClient sessions={(sessions ?? []) as any} />
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
