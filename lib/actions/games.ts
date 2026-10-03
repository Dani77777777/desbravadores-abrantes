'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { effectiveRole } from '@/utils/permissions'
import {
  GAME_ROLES,
  POINTS_MULTIPLIERS,
  getGame,
  isOpenToEveryone,
  normalizeGameSetting,
  type GameRole,
  type GameSetting,
} from '@/utils/games'

/** Colunas/tabela em falta: a migração ainda não foi corrida no Supabase. */
const MISSING_COLUMN_CODES = ['42P01', '42703', 'PGRST204', 'PGRST205']

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
  const hidden = !!input.hidden && !isOpenToEveryone({ enabled, allowed_roles: roles })

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
      error: MISSING_COLUMN_CODES.includes(error.code)
        ? 'Falta correr supabase-migration-game-settings.sql no Supabase.'
        : error.message,
    }
  }

  revalidatePath('/')
  revalidatePath('/jogos')
  revalidatePath('/admin')
  return { setting: normalizeGameSetting(gameId, data as Partial<GameSetting>) }
}

// ── Multiplicador de pontos (campanhas) ───────────────────────
// Só jogos singleplayer: nos jogos ao vivo é o anfitrião que paga no fim da
// sessão, com valores fixos, e não faz sentido multiplicá-los aqui.
export async function updateGamePointsMultiplier(
  gameId: string,
  input: { multiplier: number; endsAt: string | null },
): Promise<{ setting?: GameSetting; error?: string }> {
  const game = getGame(gameId)
  if (!game) return { error: 'Jogo desconhecido.' }
  if (!game.singlePlayer) return { error: 'O multiplicador só existe nos jogos de um jogador.' }

  const multiplier = Number(input.multiplier)
  if (!(POINTS_MULTIPLIERS as readonly number[]).includes(multiplier)) {
    return { error: 'Multiplicador inválido.' }
  }

  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (endsAt && Number.isNaN(endsAt.getTime())) return { error: 'Data de fim inválida.' }
  if (multiplier > 1) {
    if (!endsAt) return { error: 'Escolhe até quando dura a campanha.' }
    if (endsAt.getTime() <= Date.now()) return { error: 'A data de fim já passou.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Volta a entrar.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, helper_role')
    .eq('id', user.id)
    .maybeSingle()
  if (effectiveRole(profile) !== 'coordenador') {
    return { error: 'Só a coordenação pode mexer no multiplicador de pontos.' }
  }

  // A campanha arranca no momento em que é ligada; a 1× limpa a janela toda.
  const patch = multiplier > 1
    ? {
        points_multiplier: multiplier,
        multiplier_starts_at: new Date().toISOString(),
        multiplier_ends_at: endsAt!.toISOString(),
      }
    : { points_multiplier: 1, multiplier_starts_at: null, multiplier_ends_at: null }

  const { data, error } = await supabase
    .from('game_settings')
    .upsert(
      { game_id: gameId, ...patch, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'game_id' },
    )
    .select('*')
    .single()

  if (error) {
    return {
      error: MISSING_COLUMN_CODES.includes(error.code)
        ? 'Falta correr supabase-migration-game-points-multiplier.sql no Supabase.'
        : error.message,
    }
  }

  revalidatePath('/')
  revalidatePath('/jogos')
  revalidatePath('/admin')
  revalidatePath(game.href)
  return { setting: normalizeGameSetting(gameId, data as Partial<GameSetting>) }
}
