
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = {
        _cookies: [] as any[],
        getAll() {
            // @ts-ignore
            return request.cookies.getAll() || []
        },
        setAll(cookiesToSet: any[]) {
            this._cookies = cookiesToSet
        }

    }
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            // @ts-ignore
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
             // @ts-ignore
             cookieStore.setAll(cookiesToSet)
          },
        },
      }
    )
    
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        const response = NextResponse.redirect(`${origin}${next}`)
         // @ts-ignore
        cookieStore._cookies.forEach(({ name, value, options }) =>
             response.cookies.set(name, value, options)
        )
        return response
      } else if (forwardedHost) {
        const response = NextResponse.redirect(`https://${forwardedHost}${next}`)
         // @ts-ignore
        cookieStore._cookies.forEach(({ name, value, options }) =>
             response.cookies.set(name, value, options)
        )
        return response
      } else {
        const response = NextResponse.redirect(`${origin}${next}`)
         // @ts-ignore
        cookieStore._cookies.forEach(({ name, value, options }) =>
             response.cookies.set(name, value, options)
        )
        return response
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
