import { logClientError } from '@/lib/actions/client-errors'

/**
 * Recebe os erros do browser enviados pelos ecrãs de erro e entrega-os à
 * server action logClientError.
 *
 * Os ecrãs de erro não chamam a server action diretamente: uma server action
 * passa pela fila do router do Next e, lançada de dentro de um error boundary
 * ao mesmo tempo que o router.refresh() + reset(), rebentava o próprio router
 * ("Rendered more hooks than during the previous render") e voltava a dar a
 * página branca. Um fetch simples não passa pelo router.
 *
 * Responde sempre 204: quem regista um erro não pode receber outro.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (raw.length <= 20_000) {
      const body = JSON.parse(raw)
      if (body && typeof body === 'object') await logClientError(body)
    }
  } catch {
    // corpo inválido: ignora
  }
  return new Response(null, { status: 204 })
}
