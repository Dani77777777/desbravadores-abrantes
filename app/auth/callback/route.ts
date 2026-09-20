import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import crypto from 'crypto'
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
    // The user's email IS already confirmed by Supabase at this point.
    // Try to auto-login using the signed email parameter.
    const email = searchParams.get('e')
    const sig = searchParams.get('s')

    if (email && sig) {
      // Verify the HMAC signature to ensure the email wasn't tampered with
      const expectedSig = crypto
        .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
        .update(email.toLowerCase().trim())
        .digest('hex')
        .substring(0, 16)

      if (sig === expectedSig) {
        try {
          // Use admin API to generate a magic link token (no email sent)
          const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
          )

          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: email.toLowerCase().trim(),
          })

          if (linkData?.properties?.hashed_token) {
            // Verify the OTP on the server client (which manages cookies)
            // This establishes the session and sets auth cookies
            const { error: otpError } = await supabase.auth.verifyOtp({
              token_hash: linkData.properties.hashed_token,
              type: 'magiclink',
            })

            if (!otpError) {
              // Auto-login successful! Redirect to home.
              // The middleware will handle onboarding if needed.
              return NextResponse.redirect(`${origin}/`)
            }
          }
        } catch (e) {
          // If auto-login fails for any reason, fall through to manual login
          console.error('Auto-login failed:', e)
        }
      }
    }

    // Fallback: PKCE failed and auto-login failed or wasn't available.
    // Redirect to login with a success message (email IS confirmed).
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('verified', 'true')
    return NextResponse.redirect(loginUrl.toString())
  }

  // No code at all — error
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
