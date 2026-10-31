// Cliente de IA do VanaCoro: uma API compatível com OpenAI (chat completions),
// com fetch e sem SDK. Por omissão o Groq (plano gratuito); muda-se o fornecedor e
// o modelo só com variáveis de ambiente, sem mexer no código. Só no servidor.
//
//   VANACORO_AI_BASE_URL   (por omissão https://api.groq.com/openai/v1)
//   VANACORO_AI_API_KEY    (sem ela, o "Agrupar com IA" fica desligado)
//   VANACORO_AI_MODEL      (por omissão openai/gpt-oss-120b)

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'
const TIMEOUT_MS = 45_000

export function isAiEnabled(): boolean {
  return !!process.env.VANACORO_AI_API_KEY
}

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** Pede uma resposta em JSON e devolve o texto da resposta (ainda por validar). */
export async function chatJson(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.VANACORO_AI_API_KEY
  if (!apiKey) throw new Error('Sem chave de IA configurada.')
  const baseUrl = (process.env.VANACORO_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.VANACORO_AI_MODEL || DEFAULT_MODEL,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`IA respondeu ${res.status}: ${detail.slice(0, 200)}`)
  }
  const body = await res.json()
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('IA sem conteúdo na resposta.')
  return content
}
