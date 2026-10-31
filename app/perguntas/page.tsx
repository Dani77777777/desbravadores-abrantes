import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { QuestionBoard } from '@/components/perguntas/QuestionBoard'
import { AskForLink, QuestionsShell } from '@/components/perguntas/QuestionsShell'
import { loadOpenQuestions } from '@/lib/perguntas/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pergunta da Semana',
  description: 'Responde à pergunta da semana do clube.',
  robots: { index: false },
}

// Membros com sessão. Os convidados entram por /perguntas/[token].
export default async function PerguntasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user
    ? (await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()).data
    : null

  const questions = profile
    ? await loadOpenQuestions({ kind: 'member', profileId: profile.id }, { guest: false }).catch(() => [])
    : []

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <QuestionsShell>
        {profile ? <QuestionBoard initialQuestions={questions} mode={{ kind: 'member' }} /> : <AskForLink next="/perguntas" />}
      </QuestionsShell>
    </div>
  )
}
