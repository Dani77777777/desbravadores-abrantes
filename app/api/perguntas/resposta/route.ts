import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { handleAnswerDelete, handleAnswerPost } from '@/lib/perguntas/handler'
import { answerDeps } from '@/lib/perguntas/data'

// Responder à "Pergunta da Semana" (membros e convidados com o link do clube).
// As tabelas não aceitam escritas diretas (RLS), por isso grava-se com a service
// role depois de validar tudo no handler. O prémio dos membros vai por RPC com a
// sessão do próprio (auth.uid()).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json().catch(() => null)
  const result = await handleAnswerPost(body, answerDeps(supabase, req.headers))
  return NextResponse.json(result.body, { status: result.status })
}

// Apagar a própria resposta enquanto a pergunta está aberta (para corrigir um erro).
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json().catch(() => null)
  const result = await handleAnswerDelete(body, answerDeps(supabase, req.headers))
  return NextResponse.json(result.body, { status: result.status })
}
