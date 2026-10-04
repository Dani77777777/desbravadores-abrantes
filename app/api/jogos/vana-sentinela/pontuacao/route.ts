import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { canAccessGame, fetchGameSetting } from '@/utils/games'
import { effectiveRole } from '@/utils/permissions'
import { GAME_ID } from '@/utils/vana-sentinela/game'
import { handleScorePost, type Recompensa } from '@/lib/vana-sentinela/score-handler'

// Grava a pontuação de uma ronda do VanaSentinela (membros e convidados com alcunha).
// A tabela não aceita inserts diretos (RLS), por isso grava-se com a service role
// depois de validar tudo em handleScorePost. O prémio dos membros vai pela RPC
// award_vana_sentinela_rewards com a sessão do próprio (auth.uid()).
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
    async lastScoreAt(jogador) {
      const query = createServiceClient().from('vana_sentinela_scores').select('created_at')
      const { data } = await ('userId' in jogador
        ? query.eq('user_id', jogador.userId)
        : query.eq('guest_id', jogador.guestId))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data ? new Date(data.created_at) : null
    },
    async insert(row) {
      const { data, error } = await createServiceClient()
        .from('vana_sentinela_scores')
        .insert(row)
        .select('id')
        .single()
      if (error) console.error('VanaSentinela: erro a gravar pontuação', error)
      return { id: data?.id ?? null, error: error?.message ?? null }
    },
    async award(scoreId) {
      const { data, error } = await supabase.rpc('award_vana_sentinela_rewards', { p_score_id: scoreId })
      if (error) {
        console.error('VanaSentinela: erro no prémio', error)
        return null
      }
      return data as Recompensa
    },
  })

  return NextResponse.json(result.body, { status: result.status })
}
