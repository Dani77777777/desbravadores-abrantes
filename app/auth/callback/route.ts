import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Success — redirect to content
      return NextResponse.redirect(`${origin}${next}`)
    }

    // PKCE exchange failed (likely because code_verifier cookie is missing —
    // this happens when the user opens the email confirmation link in a 
    // different browser, device, or incognito window from where they signed up).
    // 
    // In this case, the user's email IS already confirmed on Supabase's side 
    // (the /auth/v1/verify endpoint confirmed it before redirecting here).
    // We just can't establish the session automatically.
    //
    // Redirect to login so the user can sign in manually.
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('verified', 'true')
    return NextResponse.redirect(loginUrl.toString())
  }

  // No code at all — error
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
