import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccessGame, fetchGameSetting, findGameByPath, isSpectatorPath } from '@/utils/games'
import { effectiveRole } from '@/utils/permissions'

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

  // Copy cookies from supabaseResponse to a redirect/rewrite response
  const withSessionCookies = (response: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach(cookie => {
      response.cookies.set(cookie.name, cookie.value, cookie)
    })
    return response
  }

  const profile = user
    ? (await supabase
        .from('profiles')
        .select('birth_date, role, helper_role')
        .eq('id', user.id)
        .single()).data
    : null

  // 0. Game availability (Gestão → Jogos). Corre antes do login: um jogo
  // indisponível mostra o aviso em vez de pedir para entrar na conta.
  const game = findGameByPath(request.nextUrl.pathname)
  if (game) {
    const setting = await fetchGameSetting(supabase, game.id)
    const allowed = isSpectatorPath(request.nextUrl.pathname)
      ? setting.enabled
      : canAccessGame(setting, effectiveRole(profile))

    if (!allowed) {
      // Server actions / pedidos que não são páginas: recusa simples.
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return withSessionCookies(new NextResponse('Jogo indisponível', { status: 403 }))
      }
      // Mantém o URL: quando o jogo voltar a estar disponível, basta recarregar.
      const url = request.nextUrl.clone()
      url.pathname = `/jogos/indisponivel/${game.id}`
      url.search = ''
      return withSessionCookies(NextResponse.rewrite(url))
    }
  }

  // 1. Protected Routes Protection
  if (
    !user &&
    request.nextUrl.pathname !== '/' &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/leaderboard') &&
    !request.nextUrl.pathname.startsWith('/shop') &&
    !request.nextUrl.pathname.startsWith('/contacts') &&
    !request.nextUrl.pathname.startsWith('/codes') &&
    !request.nextUrl.pathname.startsWith('/jogos/vana-quest') &&
    !request.nextUrl.pathname.startsWith('/jogos/vana-espada') &&
    !request.nextUrl.pathname.startsWith('/jogos/vana-sentinela') &&
    !request.nextUrl.pathname.startsWith('/jogos/vana-coro') &&
    // Código curto dos QR (/j/ABCD): os convidados do VanaCoro entram sem conta
    !request.nextUrl.pathname.startsWith('/j/') &&
    // Pergunta da Semana: as páginas e a API verificam sozinhas a sessão ou o link de convite
    !request.nextUrl.pathname.startsWith('/perguntas') &&
    !request.nextUrl.pathname.startsWith('/api/perguntas') &&
    // A rota responde 401 sozinha (sem redirecionar para o login)
    !request.nextUrl.pathname.startsWith('/api/jogos/vana-sentinela') &&
    !request.nextUrl.pathname.startsWith('/jogos/vana-trilha/como-jogar') &&
    !request.nextUrl.pathname.startsWith('/jogos/indisponivel') &&
    !request.nextUrl.pathname.startsWith('/embed') &&
    // Deixar de receber convites por email (link assinado, sem sessão)
    !request.nextUrl.pathname.startsWith('/convites/sair') &&
    !request.nextUrl.pathname.startsWith('/api/convites/sair') &&
    // Presenças por QR: os convidados marcam sem conta (a página valida o passe do QR)
    !request.nextUrl.pathname.startsWith('/presenca') &&
    !request.nextUrl.pathname.includes('/present') &&
    request.nextUrl.pathname !== '/jogos'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Onboarding Protection
  if (user) {
    const isOnboarding = request.nextUrl.pathname.startsWith('/onboarding')
  const isResetPassword = request.nextUrl.pathname.startsWith('/login/reset-password')

  // If no birth_date and not on onboarding or reset-password, redirect to onboarding
  if ((!profile || !profile.birth_date) && !isOnboarding && !isResetPassword && !request.nextUrl.pathname.startsWith('/embed')) {
       const url = request.nextUrl.clone()
       url.pathname = '/onboarding'
       return withSessionCookies(NextResponse.redirect(url))
    }

    // If birth_date exists and on onboarding, redirect to dashboard
    if (profile?.birth_date && isOnboarding) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return withSessionCookies(NextResponse.redirect(url))
    }
  }

  return supabaseResponse
}
