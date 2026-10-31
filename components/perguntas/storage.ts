'use client'

// Id anónimo do convidado neste browser (para ver e apagar as próprias respostas).
// Sempre dentro de try/catch: em modo privado guarda-se só em memória e a página
// funciona na mesma (o convidado só perde as respostas que deu se recarregar).

const KEY = 'perguntas-guest-id'
let memoria: string | null = null

function novoUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Browsers antigos / http: UUID v4 à mão
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Id deste browser (cria-o na primeira vez). */
export function obterConvidadoId(): string {
  try {
    const atual = localStorage.getItem(KEY)
    if (atual && /^[0-9a-f-]{36}$/i.test(atual)) return atual
  } catch {
    /* sem localStorage */
  }
  if (memoria) return memoria
  const novo = novoUuid()
  memoria = novo
  try {
    localStorage.setItem(KEY, novo)
  } catch {
    /* fica em memória */
  }
  return novo
}
