/**
 * Valida o parâmetro `next` usado para redirecionar após autenticação.
 * Só aceita caminhos internos: um único "/" seguido de algo que não seja "/" ou "\"
 * (bloqueia "//evil.com" e "/\evil.com", que os browsers tratam como URLs externos).
 * Também rejeita caracteres de controlo, porque o parser de URLs remove tabs/newlines
 * e "/\t/evil.com" acabaria por virar "//evil.com".
 * Se não for válido, devolve a home.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return '/'
  if (!/^\/(?![\/\\])/.test(value)) return '/'
  if (/[\x00-\x1f\x7f]/.test(value)) return '/'
  return value
}
