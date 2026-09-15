'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { effectiveRole } from '@/utils/permissions'
import { GAME_ROLES, getGame, normalizeGameSetting, type GameRole, type GameSetting } from '@/utils/games'

/** Ativa/desativa um jogo e define quem pode entrar. Só a coordenação (RLS garante o mesmo). */
export async function updateGameSetting(
  gameId: string,
  input: { enabled: boolean; allowed_roles: string[] },
): Promise<{ setting?: GameSetting; error?: string }> {
  if (!getGame(gameId)) return { error: 'Jogo desconhecido.' }

  const roles = GAME_ROLES.filter((r) => input.allowed_roles.includes(r)) as GameRole[]
  if (roles.length === 0) return { error: 'Escolhe pelo menos um grupo. Para bloquear todos, desativa o jogo.' }

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
        enabled: !!input.enabled,
        allowed_roles: roles,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'game_id' },
    )
    .select('game_id, enabled, allowed_roles')
    .single()

  if (error) {
    return {
      error: error.code === '42P01' || error.code === 'PGRST205'
        ? 'Falta correr supabase-migration-game-settings.sql no Supabase.'
        : error.message,
    }
  }

  revalidatePath('/')
  revalidatePath('/jogos')
  revalidatePath('/admin')
  return { setting: normalizeGameSetting(gameId, data as Partial<GameSetting>) }
}
