import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/utils/supabase/service'
import { FAMILY_RETURN_COOKIE, FAMILY_RETURN_MAX_AGE, familySwitch, switchableAccounts } from '@/lib/family-accounts'

function sessionClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    }
  )
}

function jsonWithSessionCookies(data: unknown, sessionResponse: NextResponse, init?: ResponseInit) {
  const output = NextResponse.json(data, init)
  sessionResponse.cookies.getAll().forEach((cookie) => output.cookies.set(cookie))
  return output
}

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ linkedAccounts: [] })
  const supabase = sessionClient(request, response)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const accounts = await switchableAccounts(user.id, request.cookies.get(FAMILY_RETURN_COOKIE)?.value)
  return jsonWithSessionCookies({ linkedAccounts: accounts }, response)
}

/** Alterna a sessão para a conta de uma criança da família (ou volta ao adulto que entrou).
 * Não é impersonação por cookie: a sessão passa a ser mesmo da outra conta e toda a RLS
 * existente mantém-se. Só um adulto entra nas crianças; ver lib/family-accounts.ts. */
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: false })
  const supabase = sessionClient(request, response)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let targetId = ''
  try {
    const body = await request.json()
    targetId = typeof body?.targetId === 'string' ? body.targetId : ''
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const decision = targetId ? await familySwitch(user.id, targetId, request.cookies.get(FAMILY_RETURN_COOKIE)?.value) : null
  if (!decision?.allowed) {
    return NextResponse.json({ error: 'Não tens acesso a esta conta.' }, { status: 403 })
  }

  const admin = createServiceClient()
  const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetId)
  if (targetError || !targetData.user?.email) return NextResponse.json({ error: 'A conta associada não está disponível.' }, { status: 404 })

  // Gera um token de sessão sem enviar email. A família já foi confirmada acima
  // (adulto → criança da mesma família, ou voltar ao adulto que entrou).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetData.user.email,
  })
  if (linkError || !linkData.properties.hashed_token) {
    return NextResponse.json({ error: 'Não foi possível mudar de conta.' }, { status: 500 })
  }

  const { error: switchError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })
  if (switchError) return NextResponse.json({ error: 'Não foi possível iniciar a outra conta.' }, { status: 500 })

  if (decision.cookie) {
    response.cookies.set(FAMILY_RETURN_COOKIE, decision.cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: FAMILY_RETURN_MAX_AGE,
    })
  } else {
    response.cookies.set(FAMILY_RETURN_COOKIE, '', { path: '/', maxAge: 0 })
  }
  return jsonWithSessionCookies({ ok: true }, response)
}
