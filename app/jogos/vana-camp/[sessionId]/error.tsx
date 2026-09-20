'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

/**
 * Boundary de erro para os ecrãs do VanaCamp (jogador, host, projeção).
 *
 * Sem isto, uma exceção transitória durante a troca de fase deixava o ecrã
 * em branco para sempre. Aqui auto-recuperamos (refresh + reset) algumas vezes
 * e, se persistir, mostramos um botão manual em vez de página em branco.
 *
 * Guardas em variáveis de módulo (persistem entre remontagens do boundary no
 * mesmo separador) evitam um loop infinito de reloads se o erro for permanente.
 */
let firstAttemptAt = 0
let attempts = 0

export default function VanaCampError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[vana-camp] erro de render — a tentar recuperar', error)
    const now = Date.now()
    // Reinicia a janela de tentativas a cada 30s.
    if (firstAttemptAt === 0 || now - firstAttemptAt > 30_000) {
      firstAttemptAt = now
      attempts = 0
    }
    if (attempts >= 3) return // já tentámos várias vezes; espera ação manual
    attempts += 1
    const t = setTimeout(() => {
      router.refresh()
      reset()
    }, 600)
    return () => clearTimeout(t)
  }, [error, reset, router])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 text-amber-100">
      <RefreshCw className="w-12 h-12 text-amber-300/70 mb-4 animate-spin" />
      <p className="text-xl font-semibold">A sincronizar com o jogo…</p>
      <p className="text-stone-400 text-sm mt-2 max-w-xs">
        Houve um soluço a trocar de fase. A recarregar automaticamente.
      </p>
      <button
        onClick={() => {
          attempts = 0
          firstAttemptAt = 0
          router.refresh()
          reset()
        }}
        className="mt-8 inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold px-6 py-2.5 rounded-full transition"
      >
        <RefreshCw className="w-4 h-4" /> Tentar de novo
      </button>
    </main>
  )
}
