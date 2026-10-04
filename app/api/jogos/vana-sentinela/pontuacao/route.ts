import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { canAccessGame, fetchGameSetting } from '@/utils/games'
import { effectiveRole } from '@/utils/permissions'
import { GAME_ID } from '@/utils/vana-sentinela/game'
import { handleScorePost } from '@/lib/vana-sentinela/score-handler'

// Grava a pontuação de uma ronda do VanaSentinela. Só membros com sessão:
// os visitantes jogam à vontade, mas o cliente nunca chama esta rota por eles.
// A tabela não aceita inserts diretos (RLS), por isso grava-se com a service role
// depois de validar tudo em handleScorePost.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json().catch(() => null)

  const result = await handleScorePost(body, {
    async getUserId() {
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id ?? null
    },
    async getRole(userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, helper_role')
        .eq('id', userId)
        .maybeSingle()
      return profile ? effectiveRole(profile) ?? null : null
    },
    async canPlay(role) {
      return canAccessGame(await fetchGameSetting(supabase, GAME_ID), role)
    },
    async lastScoreAt(userId) {
      const { data } = await createServiceClient()
        .from('vana_sentinela_scores')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data ? new Date(data.created_at) : null
    },
    async insert(row) {
      const { error } = await createServiceClient().from('vana_sentinela_scores').insert(row)
      if (error) console.error('VanaSentinela: erro a gravar pontuação', error)
      return { error: error?.message ?? null }
    },
  })

  return NextResponse.json(result.body, { status: result.status })
}
