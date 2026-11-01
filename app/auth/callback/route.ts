import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { safeNextPath } from '@/utils/safe-next-path'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Só caminhos internos, para evitar open-redirects (ex.: "@evil.com" viraria origin@evil.com)
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // PKCE exchange succeeded (same browser) — redirect to content
      return NextResponse.redirect(`${origin}${next}`)
    }

    // PKCE exchange failed (different browser — code_verifier cookie missing).
    // The email IS already confirmed by Supabase at this point, so the user just
    // signs in with their password. Nunca iniciar sessão só com o email: qualquer
    // pessoa conseguiria entrar na conta de outra.
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('verified', 'true')
    return NextResponse.redirect(loginUrl.toString())
  }

  // No code at all — error
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
