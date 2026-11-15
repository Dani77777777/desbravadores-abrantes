'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

/**
 * Ecrã de erro partilhado pelos jogos (usado nos error.tsx de app/jogos).
 *
 * Sem um boundary, uma exceção num render deixa o ecrã em branco com
 * "Application error: a client-side exception has occurred". Aqui
 * auto-recuperamos (router.refresh() + reset()) até 3 vezes por janela de 30 s
 * e, se o erro persistir, fica só o botão manual "Tentar de novo".
 *
 * Os guardas são variáveis de módulo: persistem entre remontagens do boundary
 * no mesmo separador e evitam um loop infinito de refreshes se o erro for
 * permanente.
 *
 * Nunca mexe no localStorage: o lugar do jogador (ex.: vana_participant_<sessão>
 * no VanaQuest) fica intacto e o refresh volta a pô-lo no jogo.
 */
const WINDOW_MS = 30_000
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 600

let firstAttemptAt = 0
let attempts = 0
// Para cada erro apanhado: ainda havia tentativas automáticas?
const decisions = new WeakMap<object, boolean>()

function windowExpired(now: number) {
  return firstAttemptAt === 0 || now - firstAttemptAt > WINDOW_MS
}

export type GameErrorScreenProps = {
  error: Error & { digest?: string }
  reset: () => void
  /** Nome do jogo para o texto ("A sincronizar com o VanaQuest…"). */
  gameName?: string
  /** Classes de fundo e de texto do ecrã. */
  backgroundClassName?: string
  /** Classes de cor do botão. */
  buttonClassName?: string
  /** Classe de cor do ícone. */
  iconClassName?: string
  /** Frase por baixo do título enquanto recupera sozinho. */
  message?: string
}

export function GameErrorScreen({
  error,
  reset,
  gameName,
  backgroundClassName = 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white',
  buttonClassName = 'bg-sky-600 hover:bg-sky-500 text-white',
  iconClassName = 'text-sky-300/70',
  message = 'Houve um soluço. A recarregar automaticamente.',
}: GameErrorScreenProps) {
  const router = useRouter()
  // true quando as tentativas automáticas desta janela já se gastaram.
  const [exhausted, setExhausted] = useState(false)

  // O reset e o router mudam de identidade quando o router.refresh() acaba.
  // Ficam em refs para o efeito abaixo depender só do erro: se voltasse a correr
  // a cada refresh, gastava tentativas e cancelava o temporizador já marcado.
  const recover = useRef(() => {})
  useEffect(() => {
    recover.current = () => {
      router.refresh()
      reset()
    }
  }, [router, reset])

  // Uma tentativa por erro apanhado.
  useEffect(() => {
    console.error('[jogo] erro de render — a tentar recuperar', error)
    // Decide uma só vez por erro (o efeito pode correr mais de uma vez para o
    // mesmo erro, por exemplo em StrictMode, e não deve gastar duas tentativas).
    let canRetry = decisions.get(error)
    if (canRetry === undefined) {
      const now = Date.now()
      // Reinicia a janela de tentativas a cada 30 s.
      if (windowExpired(now)) {
        firstAttemptAt = now
        attempts = 0
      }
      canRetry = attempts < MAX_ATTEMPTS
      if (canRetry) attempts += 1
      decisions.set(error, canRetry)
    }
    const t = setTimeout(() => {
      // Já tentámos várias vezes: fica só o botão manual.
      if (!canRetry) return setExhausted(true)
      setExhausted(false)
      recover.current()
    }, canRetry ? RETRY_DELAY_MS : 0)
    return () => clearTimeout(t)
  }, [error])

  function retryNow() {
    attempts = 0
    firstAttemptAt = 0
    setExhausted(false)
    recover.current()
  }

  return (
    <main className={`min-h-[100dvh] flex flex-col items-center justify-center text-center p-8 ${backgroundClassName}`}>
      <RefreshCw className={`w-12 h-12 mb-4 ${iconClassName} ${exhausted ? '' : 'animate-spin'}`} />
      <p className="text-xl font-semibold">
        {exhausted
          ? 'Não foi possível recuperar sozinho'
          : gameName ? `A sincronizar com o ${gameName}…` : 'A sincronizar com o jogo…'}
      </p>
      <p className="text-sm mt-2 max-w-xs opacity-70">
        {exhausted ? 'Toca em "Tentar de novo". Não perdes o teu lugar no jogo.' : message}
      </p>
      <button
        onClick={retryNow}
        className={`mt-8 inline-flex items-center gap-2 font-semibold px-6 py-2.5 rounded-full transition ${buttonClassName}`}
      >
        <RefreshCw className="w-4 h-4" /> Tentar de novo
      </button>
    </main>
  )
}
