import { headers } from 'next/headers'

/**
 * Resolve o URL absoluto do site para o request atual.
 * Prioridade:
 *   1. NEXT_PUBLIC_SITE_URL (se definido e não for o default de dev)
 *   2. Headers do request (x-forwarded-host / host + x-forwarded-proto)
 *   3. Fallback para localhost:3000
 */
export async function getSiteUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl.replace(/\/$/, '')
  }

  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') || h.get('host')
    if (host) {
      const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
      return `${proto}://${host}`
    }
  } catch {
    // headers() may fail outside a request scope
  }

  return envUrl || 'http://localhost:3000'
}
