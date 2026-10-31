import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { effectiveRole } from '@/utils/permissions'
import { getQuestionReview } from '@/lib/actions/vana-coro-review'
import { QuestionReview } from '@/components/vana-coro/QuestionReview'

export const dynamic = 'force-dynamic'
// O agrupamento com IA corre numa server action desta página.
export const maxDuration = 60

export default async function VanaCoroReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/vana-coro/perguntas/${id}`)

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (effectiveRole(profile) !== 'coordenador') redirect('/admin?tab=games')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const data = await getQuestionReview(id)
  if (data === null) notFound()

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Link href="/admin/vana-coro" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700">
          <ChevronLeft className="h-4 w-4" /> Perguntas
        </Link>
        {data === 'missing' ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Os grupos ainda não existem na base de dados. Corre{' '}
              <code className="font-mono font-bold">supabase-migration-vana-coro-grupos.sql</code> no SQL Editor do Supabase.
            </span>
          </div>
        ) : (
          <QuestionReview data={data} />
        )}
      </main>
    </div>
  )
}
