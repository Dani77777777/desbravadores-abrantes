import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { effectiveRole } from '@/utils/permissions'
import { getSiteUrl } from '@/utils/site-url'
import { getVanaCoroAdminData } from '@/lib/actions/vana-coro'
import { QuestionQueueAdmin } from '@/components/vana-coro/QuestionQueueAdmin'
import { getWeeklyParticipation } from '@/lib/actions/vana-coro-participation'
import { WeeklyParticipation } from '@/components/vana-coro/WeeklyParticipation'

export const dynamic = 'force-dynamic'

export default async function VanaCoroAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/vana-coro')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (effectiveRole(profile) !== 'coordenador') redirect('/admin?tab=games')

  const [data, siteUrl, participation] = await Promise.all([getVanaCoroAdminData(), getSiteUrl(), getWeeklyParticipation()])
  if (data === null) redirect('/admin?tab=games')

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center gap-3">
          <Link href="/admin?tab=games" className="text-slate-500 hover:text-slate-700" title="Voltar aos Jogos">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">VanaCoro — Admin</h1>
            <p className="text-sm text-slate-500">
              Os membros veem só a <strong>Pergunta da Semana</strong>: nada lhes diz que as respostas são para um jogo.
            </p>
          </div>
        </div>

        {data === 'missing' ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              As tabelas ainda não existem na base de dados. Corre{' '}
              <code className="font-mono font-bold">supabase-setup-vana-coro.sql</code> no SQL Editor do Supabase.
            </span>
          </div>
        ) : (
          <>
            {participation && <WeeklyParticipation data={participation} />}
            <QuestionQueueAdmin
              settings={data.settings}
              questions={data.questions}
              inviteUrl={`${siteUrl}/perguntas/${data.settings.invite_token}`}
            />
          </>
        )}
      </main>
    </div>
  )
}
