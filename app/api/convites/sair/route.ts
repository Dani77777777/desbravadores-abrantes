import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { isValidUnsubscribeToken } from '@/lib/email'

// Deixar de receber convites por email. Recebe o POST do formulário da página
// /convites/sair e o "one-click" do Gmail (cabeçalho List-Unsubscribe-Post).
// Só POST: os antivírus do email abrem os links (GET) e não podem tirar ninguém da lista.
export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('u') || ''
  const token = request.nextUrl.searchParams.get('t') || ''
  if (!isValidUnsubscribeToken(userId, token)) {
    return NextResponse.json({ error: 'Link inválido.' }, { status: 400 })
  }

  const admin = createServiceClient()
  const { error } = await admin.from('email_opt_outs').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: 'Não foi possível guardar.' }, { status: 500 })

  // O one-click do Gmail não segue redirecionamentos; o formulário volta à página.
  const body = await request.text().catch(() => '')
  if (body.includes('List-Unsubscribe=One-Click')) return new NextResponse(null, { status: 200 })
  const url = request.nextUrl.clone()
  url.pathname = '/convites/sair'
  url.search = '?ok=1'
  return NextResponse.redirect(url, 303)
}
