import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'
import { ChevronLeft, Plus, Clock, Zap } from 'lucide-react'
import { QuestEditorClient } from '@/components/vana-quest/QuestEditorClient'

export default async function QuestEditorPage({
  params,
}: {
  params: Promise<{ questId: string }>
}) {
  const { questId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'coordenador' || profile?.role === 'dirigente'
  if (!isAdmin) redirect('/')

  const { data: quest } = await supabase.from('vana_quests').select('*').eq('id', questId).single()
  if (!quest) redirect('/admin/vana-quest')

  const { data: questions } = await supabase
    .from('vana_quest_questions')
    .select('*')
    .eq('vana_quest_id', questId)
    .order('question_order')

  async function handleAddQuestion(formData: FormData) {
    'use server'
    const s = await (await import('@/utils/supabase/server')).createClient()
    const { data: existing } = await s
      .from('vana_quest_questions')
      .select('question_order')
      .eq('vana_quest_id', questId)
      .order('question_order', { ascending: false })
      .limit(1)
      .single()

    await s.from('vana_quest_questions').insert({
      vana_quest_id: questId,
      question_text: formData.get('question_text') as string,
      option_a: formData.get('option_a') as string,
      option_b: formData.get('option_b') as string,
      option_c: formData.get('option_c') as string,
      option_d: formData.get('option_d') as string,
      correct_option: formData.get('correct_option') as string,
      time_seconds: parseInt(formData.get('time_seconds') as string) || 20,
      points_multiplier: parseInt(formData.get('points_multiplier') as string) || 1,
      question_order: (existing?.question_order ?? -1) + 1,
    })
    revalidatePath(`/admin/vana-quest/${questId}`)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin/vana-quest" className="text-gray-500 hover:text-gray-900 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{quest.title}</h1>
            <p className="text-sm text-gray-500">{questions?.length || 0} pergunta{(questions?.length || 0) !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Add question form */}
        <div className="bg-white rounded-2xl border shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-5 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" /> Adicionar pergunta
          </h2>
          <form action={handleAddQuestion} className="space-y-4">
            <textarea
              name="question_text"
              required
              placeholder="Texto da pergunta"
              rows={2}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['a', 'b', 'c', 'd'] as const).map((opt) => (
                <div key={opt} className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0 ${
                    { a: 'bg-red-500', b: 'bg-blue-500', c: 'bg-yellow-400', d: 'bg-green-500' }[opt]
                  }`}>
                    {{ a: '▲', b: '●', c: '◆', d: '■' }[opt]}
                  </span>
                  <input
                    name={`option_${opt}`}
                    required
                    placeholder={`Opção ${opt.toUpperCase()}`}
                    className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Resposta correcta</label>
                <select name="correct_option" className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="A">▲ A</option>
                  <option value="B">● B</option>
                  <option value="C">◆ C</option>
                  <option value="D">■ D</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Tempo
                </label>
                <select name="time_seconds" defaultValue="20" className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="5">5 segundos</option>
                  <option value="10">10 segundos</option>
                  <option value="20">20 segundos</option>
                  <option value="30">30 segundos</option>
                  <option value="60">60 segundos</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Pontos
                </label>
                <select name="points_multiplier" className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="1">Normal (×1)</option>
                  <option value="2">Duplo (×2)</option>
                  <option value="3">Triplo (×3)</option>
                </select>
              </div>
            </div>
            <button type="submit"
              className="w-full bg-blue-900 text-white py-3 rounded-xl font-bold hover:bg-blue-800 transition-colors flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Adicionar pergunta
            </button>
          </form>
        </div>

        {/* Sortable question list (client component) */}
        <QuestEditorClient questions={questions || []} questId={questId} />
      </main>
    </div>
  )
}
