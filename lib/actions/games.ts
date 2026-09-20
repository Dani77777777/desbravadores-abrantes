'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { effectiveRole } from '@/utils/permissions'
import { GAME_ROLES, getGame, isOpenToEveryone, normalizeGameSetting, type GameRole, type GameSetting } from '@/utils/games'

/** Ativa/desativa um jogo, define quem pode entrar e se fica escondido. Só a coordenação (RLS garante o mesmo). */
export async function updateGameSetting(
  gameId: string,
  input: { enabled: boolean; allowed_roles: string[]; hidden: boolean },
): Promise<{ setting?: GameSetting; error?: string }> {
  if (!getGame(gameId)) return { error: 'Jogo desconhecido.' }

  const roles = GAME_ROLES.filter((r) => input.allowed_roles.includes(r)) as GameRole[]
  if (roles.length === 0) return { error: 'Escolhe pelo menos um grupo. Para bloquear todos, desativa o jogo.' }

  const enabled = !!input.enabled
  // Aberto a todos não há de quem esconder: limpa a opção para não voltar a esconder
  // o jogo de surpresa numa restrição futura.
  const hidden = !!input.hidden && !isOpenToEveryone({ game_id: gameId, enabled, allowed_roles: roles, hidden: false })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Volta a entrar.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, helper_role')
    .eq('id', user.id)
    .maybeSingle()
  if (effectiveRole(profile) !== 'coordenador') {
    return { error: 'Só a coordenação pode alterar a disponibilidade dos jogos.' }
  }

  const { data, error } = await supabase
    .from('game_settings')
    .upsert(
      {
        game_id: gameId,
        enabled,
        allowed_roles: roles,
        hidden,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'game_id' },
    )
    .select('*')
    .single()

  if (error) {
    return {
      error: ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code)
        ? 'Falta correr supabase-migration-game-settings.sql no Supabase.'
        : error.message,
    }
  }

  revalidatePath('/')
  revalidatePath('/jogos')
  revalidatePath('/admin')
  return { setting: normalizeGameSetting(gameId, data as Partial<GameSetting>) }
}
