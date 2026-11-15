// Cada erro é registado uma só vez, mesmo que o efeito volte a correr.
const reported = new WeakSet<object>()

/**
 * Envia o erro para client_error_logs sem esperar pela resposta. Nunca lança
 * exceção nem atrasa a recuperação do ecrã.
 *
 * Vai por fetch para /api/client-error (que chama a server action
 * logClientError) e não pela server action diretamente: chamada de dentro de
 * um error boundary, a server action entra na fila do router do Next e, junto
 * com o router.refresh() + reset(), rebentava o router e dava a página branca.
 *
 * O jogo e a sessão vêm do endereço: /jogos/<jogo>/<sessão>/...
 */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    if (!error || reported.has(error)) return
    reported.add(error)

    const path = window.location.pathname
    const parts = path.split('/').filter(Boolean)
    const inGames = parts[0] === 'jogos'

    void fetch('/api/client-error', {
      method: 'POST',
      keepalive: true, // sobrevive a um reload logo a seguir
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error.message ?? error).slice(0, 500),
        stack: typeof error.stack === 'string' ? error.stack.slice(0, 4000) : null,
        digest: error.digest ?? null,
        url: path,
        game: inGames ? parts[1] ?? null : null,
        sessionId: inGames ? parts[2] ?? null : null,
      }),
    }).catch(() => {})
  } catch {
    // registar o erro nunca pode provocar outro
  }
}
