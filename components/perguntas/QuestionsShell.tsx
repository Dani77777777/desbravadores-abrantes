import type { ReactNode } from 'react'
import Link from 'next/link'
import { LogIn, MessageCircleQuestion } from 'lucide-react'

/** Cabeçalho e rodapé comuns da página da Pergunta da Semana. */
export function QuestionsShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:pt-12">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-md">
          <MessageCircleQuestion className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-blue-950">Pergunta da Semana</h1>
          <p className="text-sm text-stone-500">Responde o que te vier à cabeça primeiro.</p>
        </div>
      </div>
      {children}
      <p className="mt-8 text-center text-xs text-stone-400">
        As respostas são anónimas e podem ser mostradas, sem nomes, em atividades do JA.
      </p>
    </main>
  )
}

/** Sem sessão nem link válido. */
export function AskForLink({ next }: { next: string }) {
  return (
    <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
      <p className="text-4xl">🔗</p>
      <p className="mt-3 font-bold text-blue-950">Pede o link a alguém do clube.</p>
      <p className="mt-1 text-sm text-stone-500">Se és membro, entra na tua conta para responder.</p>
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-bold text-white transition-colors hover:bg-blue-800"
      >
        <LogIn className="h-4 w-4" /> Entrar
      </Link>
    </div>
  )
}
