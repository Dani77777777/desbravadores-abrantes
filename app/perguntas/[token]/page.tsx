import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { QuestionBoard } from '@/components/perguntas/QuestionBoard'
import { AskForLink, QuestionsShell } from '@/components/perguntas/QuestionsShell'
import { isValidInviteToken, loadOpenQuestions } from '@/lib/perguntas/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pergunta da Semana',
  description: 'Responde à pergunta da semana do clube.',
  robots: { index: false },
}

// Convidados, pelo link do clube. As respostas de cada um ficam presas a um id
// anónimo deste browser (ver components/perguntas/storage.ts).
export default async function PerguntasConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Um membro que abre o link responde com a conta (e ganha o XP).
  if (user) redirect('/perguntas')

  const valid = await isValidInviteToken(token).catch(() => false)
  const questions = valid ? await loadOpenQuestions(null, { guest: true }).catch(() => []) : []

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={null} profile={null} />
      <QuestionsShell>
        {valid ? (
          <QuestionBoard initialQuestions={questions} mode={{ kind: 'guest', token }} />
        ) : (
          <AskForLink next="/perguntas" />
        )}
      </QuestionsShell>
    </div>
  )
}
