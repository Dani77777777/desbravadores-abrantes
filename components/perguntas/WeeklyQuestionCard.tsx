import Link from 'next/link'
import { CheckCircle2, MessageCircleQuestion } from 'lucide-react'
import type { PublicQuestion } from '@/lib/perguntas/types'

/** Cartão do Painel com a pergunta aberta mais recente. */
export function WeeklyQuestionCard({ question, displayClass }: { question: PublicQuestion; displayClass: string }) {
  const given = question.answers.length
  const remaining = 3 - given
  return (
    <section className="flex flex-col gap-4 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:flex-row sm:items-center sm:p-6">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-md">
        <MessageCircleQuestion className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700">Pergunta da Semana</p>
        <h2 className={`${displayClass} mt-0.5 text-xl font-extrabold leading-snug text-blue-950`}>{question.prompt}</h2>
        {given > 0 && (
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Já respondeste
            {remaining > 0 && <span className="font-normal text-stone-500"> · podes dar mais {remaining}</span>}
          </p>
        )}
      </div>
      <Link
        href="/perguntas"
        className={`inline-flex h-11 shrink-0 items-center justify-center rounded-2xl px-5 font-bold transition-colors ${
          given > 0
            ? 'bg-stone-100 text-blue-950 hover:bg-stone-200'
            : 'bg-yellow-400 text-blue-950 hover:bg-yellow-300'
        }`}
      >
        {given > 0 ? 'Ver respostas' : 'Responder'}
      </Link>
    </section>
  )
}
