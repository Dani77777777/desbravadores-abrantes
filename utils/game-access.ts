// Verificação de disponibilidade do lado do servidor (server actions).
// O middleware já bloqueia as páginas dos jogos; isto cobre as ações de "entrar"
// quando chamadas diretamente.

import { createClient } from '@/utils/supabase/server'
import { canAccessGame, fetchGameSetting } from '@/utils/games'
import { effectiveRole } from '@/utils/permissions'

export const GAME_UNAVAILABLE_MESSAGE = 'Este jogo não está disponível de momento.'

/** Mensagem de erro se o utilizador atual (ou visitante) não puder entrar no jogo; null se puder. */
export async function gameUnavailableError(gameId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let role: string | undefined
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, helper_role')
      .eq('id', user.id)
      .maybeSingle()
    role = effectiveRole(profile)
  }

  const setting = await fetchGameSetting(supabase, gameId)
  return canAccessGame(setting, role) ? null : GAME_UNAVAILABLE_MESSAGE
}
