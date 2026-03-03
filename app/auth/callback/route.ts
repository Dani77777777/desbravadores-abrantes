
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // We only care about 'next'. Do NOT use 'redirect_to' here as Supabase includes 
  // the callback URL in that parameter, which causes infinite redirect loops.
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // If next is a full URL, use it (but check for safety)
      if (next.startsWith('http')) {
        // If it's trying to redirect back to the callback, go to home instead
        if (next.includes('/auth/callback')) {
          return NextResponse.redirect(`${origin}/`)
        }
        return NextResponse.redirect(next)
      }

      // Otherwise, redirect to the relative path on this origin
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}

