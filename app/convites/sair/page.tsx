import Link from 'next/link'
import { MailX, CheckCircle2 } from 'lucide-react'
import { isValidUnsubscribeToken } from '@/lib/email'
import { displayFont } from '@/components/landing/fonts'

export const metadata = { title: 'Convites por email · Desbravadores de Abrantes' }

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; ok?: string }> }) {
  const { u = '', t = '', ok } = await searchParams
  const valid = isValidUnsubscribeToken(u, t)

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-12">
      <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 text-center shadow-sm ring-1 ring-stone-200 sm:p-8">
        {ok ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className={`${displayFont.className} mt-4 text-2xl font-extrabold text-blue-950`}>Pronto</h1>
            <p className="mt-2 text-sm text-stone-600">Não vais voltar a receber convites para eventos por email. Os eventos continuam a aparecer no Painel do site.</p>
          </>
        ) : valid ? (
          <>
            <MailX className="mx-auto h-12 w-12 text-orange-500" />
            <h1 className={`${displayFont.className} mt-4 text-2xl font-extrabold text-blue-950`}>Deixar de receber convites?</h1>
            <p className="mt-2 text-sm text-stone-600">Deixas de receber os emails com convites para os eventos do clube. Podes pedir à liderança para voltar a recebê-los.</p>
            <form method="post" action={`/api/convites/sair?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`} className="mt-6">
              <button type="submit" className="h-11 w-full cursor-pointer rounded-xl bg-blue-950 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-900">
                Sim, não quero receber
              </button>
            </form>
          </>
        ) : (
          <>
            <MailX className="mx-auto h-12 w-12 text-stone-300" />
            <h1 className={`${displayFont.className} mt-4 text-2xl font-extrabold text-blue-950`}>Link inválido</h1>
            <p className="mt-2 text-sm text-stone-600">Este link não está completo. Abre-o outra vez a partir do email.</p>
          </>
        )}
        <Link href="/" className="mt-6 inline-block text-sm font-bold text-blue-700 hover:underline">Ir para o site</Link>
      </div>
    </main>
  )
}
