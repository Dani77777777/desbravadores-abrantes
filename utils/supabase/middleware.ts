import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 1. Protected Routes Protection
  if (
    !user &&
    request.nextUrl.pathname !== '/' &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/leaderboard') &&
    !request.nextUrl.pathname.startsWith('/contacts') &&
    !request.nextUrl.pathname.startsWith('/codes')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Onboarding Protection
  if (user) {
    // Check if user has birth_date in profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('birth_date')
      .eq('id', user.id)
      .single()

    const isOnboarding = request.nextUrl.pathname.startsWith('/onboarding')
  const isResetPassword = request.nextUrl.pathname.startsWith('/login/reset-password')

  // If no birth_date and not on onboarding or reset-password, redirect to onboarding
  if ((!profile || !profile.birth_date) && !isOnboarding && !isResetPassword) {
       const url = request.nextUrl.clone()
       url.pathname = '/onboarding'
       const redirectResponse = NextResponse.redirect(url)
       // Copy cookies from supabaseResponse to redirectResponse
       supabaseResponse.cookies.getAll().forEach(cookie => {
         redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
       })
       return redirectResponse
    }

    // If birth_date exists and on onboarding, redirect to dashboard
    if (profile?.birth_date && isOnboarding) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        const redirectResponse = NextResponse.redirect(url)
        // Copy cookies from supabaseResponse to redirectResponse
        supabaseResponse.cookies.getAll().forEach(cookie => {
          redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
        })
        return redirectResponse
    }
  }

  return supabaseResponse
}
