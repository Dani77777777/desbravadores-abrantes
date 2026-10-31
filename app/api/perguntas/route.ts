import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { resolveRespondent } from '@/lib/perguntas/handler'
import { identityDeps, loadOpenQuestions } from '@/lib/perguntas/data'

const QuerySchema = z.object({
  guest_id: z.string().uuid().optional(),
  token: z.string().min(1).max(40).optional(),
})

// Perguntas abertas com as respostas da própria pessoa. Os membros já as recebem
// com a página; isto serve sobretudo aos convidados, cujo id só existe no browser.
export async function GET(req: NextRequest) {
  const params = QuerySchema.safeParse({
    guest_id: req.nextUrl.searchParams.get('guest_id') ?? undefined,
    token: req.nextUrl.searchParams.get('token') ?? undefined,
  })
  if (!params.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })

  const supabase = await createClient()
  const who = await resolveRespondent(params.data, identityDeps(supabase))
  if ('error' in who) return NextResponse.json(who.error.body, { status: who.error.status })

  const questions = await loadOpenQuestions(who.respondent, { guest: who.respondent.kind === 'guest' })
  return NextResponse.json({ questions }, { headers: { 'Cache-Control': 'no-store' } })
}
