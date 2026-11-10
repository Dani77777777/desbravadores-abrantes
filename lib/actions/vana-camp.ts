'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { revalidatePath } from 'next/cache'
import {
  generateSessionCode,
  rolesDistribution,
  assignRoles,
  validateRoleConfig,
  resolveNight,
  tallyVotes,
  checkWinCondition,
  type PlayerSnapshot,
} from '@/utils/vana-camp'
import { shortDisplayName } from '@/utils/display-name'
import { gameUnavailableError } from '@/utils/game-access'
import {
  VANA_CAMP_DEFAULT_PHASE_SECONDS,
  type VanaCampChatMode,
  type VanaCampMayorMode,
  type VanaCampRoleAssignmentMode,
  type VanaCampRole,
  type VanaCampRoleConfig,
  type VanaCampPreviewData,
  type VanaCampPreviewPlayer,
  type VanaCampRoleHistoryEntry,
  type VanaCampSide,
} from '@/types/vana-camp'

// ────────────────────────────────────────────────────────────────────
// Helpers internos
// ────────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado.')
  return { supabase, user }
}

async function requireHost() {
  const { supabase, user } = await requireUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'dirigente' && profile.role !== 'coordenador')) {
    throw new Error('Apenas dirigentes/coordenadores podem criar partidas.')
  }
  return { supabase, user, profile }
}

// ────────────────────────────────────────────────────────────────────
// Criar sessão
// ────────────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  chat_mode: VanaCampChatMode
  mayor_mode: VanaCampMayorMode
  role_assignment_mode: VanaCampRoleAssignmentMode
  is_test_session?: boolean
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const { supabase, user } = await requireHost()

  // Gera código único (tenta 10 vezes)
  let code = generateSessionCode()
  for (let attempts = 0; attempts < 10; attempts++) {
    const { data: existing } = await supabase
      .from('vanacamp_sessions')
      .select('id')
      .eq('code', code)
      .not('status', 'in', '("finished","cancelled")')
      .maybeSingle()
    if (!existing) break
    code = generateSessionCode()
  }

  const { data, error } = await supabase
    .from('vanacamp_sessions')
    .insert({
      host_id: user.id,
      code,
      status: 'lobby',
      chat_mode: input.chat_mode,
      mayor_mode: input.mayor_mode,
      role_assignment_mode: input.role_assignment_mode,
      is_test_session: !!input.is_test_session,
      config_json: {},
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // O host é o NARRADOR — não é jogador, vê tudo, conduz o jogo.
  // (Quem quiser jogar entra pelo código como qualquer outro membro.)

  revalidatePath('/jogos/vana-camp')
  return data.id
}

// ────────────────────────────────────────────────────────────────────
// TEST MODE — bots (só em sessões marcadas como teste)
// ────────────────────────────────────────────────────────────────────

const BOT_NAMES = [
  'Bot Aurora', 'Bot Bússola', 'Bot Cantil', 'Bot Dália', 'Bot Estrela',
  'Bot Fogueira', 'Bot Grilo', 'Bot Horizonte', 'Bot Íris', 'Bot Junco',
  'Bot Lince', 'Bot Murta', 'Bot Nébula', 'Bot Orvalho', 'Bot Pinhão',
  'Bot Quercus', 'Bot Raposa', 'Bot Sálvia', 'Bot Tordo', 'Bot Urze',
]

export async function addTestPlayer(
  sessionId: string,
  customName?: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, status, is_test_session')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host pode adicionar bots.' }
  if (!session.is_test_session) return { error: 'Esta sessão não é de teste.' }
  if (session.status !== 'lobby') return { error: 'Só podes adicionar bots no lobby.' }

  // Escolhe um nome ainda não usado
  let name = customName?.trim()
  if (!name) {
    const { data: existing } = await service
      .from('vanacamp_players')
      .select('display_name')
      .eq('session_id', sessionId)
    const used = new Set((existing ?? []).map((p) => p.display_name))
    name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${Date.now() % 1000}`
  }

  const { error } = await service.from('vanacamp_players').insert({
    session_id: sessionId,
    user_id: null,
    is_bot: true,
    display_name: name,
  })
  if (error) return { error: error.message }

  revalidatePath(`/jogos/vana-camp/${sessionId}/control`)
  return {}
}

export async function removeTestPlayer(
  sessionId: string,
  playerId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host.' }
  if (session.status !== 'lobby') return { error: 'Só podes remover no lobby.' }

  const { error } = await service
    .from('vanacamp_players')
    .delete()
    .eq('id', playerId)
    .eq('session_id', sessionId)
    .eq('is_bot', true)
  if (error) return { error: error.message }

  revalidatePath(`/jogos/vana-camp/${sessionId}/control`)
  return {}
}

/**
 * Devolve todos os papéis dos jogadores (host-only).
 * Útil no modo teste para o host ver o que os bots têm.
 */
export async function getAllRolesForHost(sessionId: string): Promise<{
  players?: { id: string; display_name: string; role: VanaCampRole | null; is_mayor: boolean; is_bot: boolean; is_alive: boolean }[]
  error?: string
}> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host.' }

  const { data } = await service
    .from('vanacamp_players')
    .select('id, display_name, role, is_mayor, is_bot, is_alive')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })

  return { players: (data ?? []) as any }
}

// ────────────────────────────────────────────────────────────────────
// VIBRAÇÃO — host alerta jogadores
// ────────────────────────────────────────────────────────────────────

export type VibrationTargetSpec =
  | { kind: 'all' }
  | { kind: 'alive' }
  | { kind: 'role'; role: VanaCampRole }
  | { kind: 'players'; player_ids: string[] }

export async function triggerVibration(
  sessionId: string,
  target: VibrationTargetSpec,
  pattern: 'short' | 'alert' | 'urgent' | 'night_call' = 'alert',
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o Narrador pode disparar vibração.' }

  // Resolve targets para uma lista de player_ids (evita leak de roles ao cliente)
  let targetIds: string[] | undefined
  if (target.kind === 'all') {
    targetIds = undefined // todos
  } else if (target.kind === 'alive') {
    const { data } = await service
      .from('vanacamp_players')
      .select('id')
      .eq('session_id', sessionId)
      .eq('is_alive', true)
    targetIds = (data ?? []).map((r) => r.id)
  } else if (target.kind === 'role') {
    const { data } = await service
      .from('vanacamp_players')
      .select('id')
      .eq('session_id', sessionId)
      .eq('role', target.role)
      .eq('is_alive', true)
    targetIds = (data ?? []).map((r) => r.id)
  } else {
    targetIds = target.player_ids
  }

  const { error } = await service.from('vanacamp_events').insert({
    session_id: sessionId,
    day_number: 0,
    event_type: 'vibrate',
    payload: { target_player_ids: targetIds, pattern },
  })
  if (error) return { error: error.message }
  return {}
}

// ────────────────────────────────────────────────────────────────────
// IMPERSONAÇÃO DE BOT (host só, em sessão de teste)
// ────────────────────────────────────────────────────────────────────

/**
 * Valida que o user atual (host de uma sessão de teste) pode impersonar este bot.
 * Devolve o registo do jogador-bot.
 */
export async function getBotForImpersonation(
  sessionId: string,
  playerId: string,
): Promise<{
  bot?: { id: string; display_name: string; role: VanaCampRole | null; is_mayor: boolean; is_alive: boolean }
  error?: string
}> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, is_test_session')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o Narrador.' }
  if (!session.is_test_session) return { error: 'Só em sessões de teste.' }

  const { data: bot } = await service
    .from('vanacamp_players')
    .select('id, display_name, role, is_mayor, is_alive, is_bot, session_id')
    .eq('id', playerId)
    .single()
  if (!bot || bot.session_id !== sessionId) return { error: 'Bot não encontrado.' }
  if (!bot.is_bot) return { error: 'Esse jogador não é um bot.' }

  return {
    bot: {
      id: bot.id,
      display_name: bot.display_name,
      role: bot.role as VanaCampRole | null,
      is_mayor: bot.is_mayor,
      is_alive: bot.is_alive,
    },
  }
}

// ────────────────────────────────────────────────────────────────────
// Entrar numa sessão (por código)
// ────────────────────────────────────────────────────────────────────

export interface JoinResult {
  sessionId?: string
  error?: string
}

export async function joinSessionByCode(rawCode: string): Promise<JoinResult> {
  const { supabase, user } = await requireUser()

  const unavailable = await gameUnavailableError('vana-camp')
  if (unavailable) return { error: unavailable }

  const code = rawCode.trim().toUpperCase()
  if (!code || code.length !== 6) {
    return { error: 'Código inválido.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { data: session, error: sessionError } = await supabase
    .from('vanacamp_sessions')
    .select('id, status, host_id')
    .eq('code', code)
    .maybeSingle()

  if (sessionError || !session) {
    return { error: 'Sessão não encontrada.' }
  }
  if (session.host_id === user.id) {
    return { error: 'És o Narrador desta sessão — não podes jogar nela.' }
  }
  if (session.status === 'finished' || session.status === 'cancelled') {
    return { error: 'Esta sessão já terminou.' }
  }
  if (session.status !== 'lobby') {
    return { error: 'A sessão já começou — não é possível entrar agora.' }
  }

  // Já é jogador? — reconectar
  const { data: existing } = await supabase
    .from('vanacamp_players')
    .select('id')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return { sessionId: session.id }

  const { error: insertError } = await supabase.from('vanacamp_players').insert({
    session_id: session.id,
    user_id: user.id,
    display_name: shortDisplayName(profile?.full_name),
  })

  if (insertError) return { error: 'Erro ao entrar na sessão.' }

  revalidatePath(`/jogos/vana-camp/${session.id}`)
  return { sessionId: session.id }
}

// ────────────────────────────────────────────────────────────────────
// Sair (apenas no lobby)
// ────────────────────────────────────────────────────────────────────

export async function leaveSession(sessionId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('status, host_id')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.status !== 'lobby') {
    return { error: 'Já não podes sair — o jogo começou.' }
  }
  if (session.host_id === user.id) {
    return { error: 'O host não pode sair. Cancela a sessão em vez disso.' }
  }

  const { error } = await supabase
    .from('vanacamp_players')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath(`/jogos/vana-camp/${sessionId}`)
  return {}
}

// ────────────────────────────────────────────────────────────────────
// Cancelar sessão (host antes de começar)
// ────────────────────────────────────────────────────────────────────

/**
 * Apaga permanentemente uma sessão (admin). Apenas coordenadores ou o host.
 */
export async function deleteVanaCampSession(sessionId: string): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await requireUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const isCoord = profile?.role === 'coordenador'

    const { data: session } = await supabase
      .from('vanacamp_sessions')
      .select('host_id')
      .eq('id', sessionId)
      .single()
    if (!session) return { error: 'Sessão não encontrada.' }
    if (!isCoord && session.host_id !== user.id) {
      return { error: 'Apenas o host ou um coordenador podem apagar.' }
    }

    const service = createServiceClient()
    const { error } = await service
      .from('vanacamp_sessions')
      .delete()
      .eq('id', sessionId)
    if (error) return { error: error.message }

    revalidatePath('/admin/vana-camp')
    revalidatePath('/jogos/vana-camp')
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

export async function cancelSession(sessionId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('status, host_id')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host pode cancelar.' }
  if (session.status === 'finished') return { error: 'Sessão já terminou.' }

  const { error } = await supabase
    .from('vanacamp_sessions')
    .update({ status: 'cancelled', ended_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) return { error: error.message }

  revalidatePath('/jogos/vana-camp')
  return {}
}

// ────────────────────────────────────────────────────────────────────
// Avançar para role_preview (host clica "Iniciar")
// A atribuição efetiva de papéis é feita na Fase 3.
// ────────────────────────────────────────────────────────────────────

export async function advanceToRolePreview(sessionId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('status, host_id, role_assignment_mode, mayor_mode, config_json')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host pode avançar.' }
  if (session.status !== 'lobby') return { error: 'Sessão não está no lobby.' }

  const service = createServiceClient()

  const { data: players } = await service
    .from('vanacamp_players')
    .select('id')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })

  const playerCount = players?.length ?? 0
  if (playerCount < 4) {
    return { error: 'São precisos pelo menos 4 jogadores para começar.' }
  }

  // Sorteio inicial (exceto no modo manual)
  if (session.role_assignment_mode !== 'manual' && players) {
    const config =
      (session.config_json as { role_counts?: VanaCampRoleConfig })?.role_counts ??
      rolesDistribution(playerCount)

    const validationErr = validateRoleConfig(config, playerCount)
    if (validationErr) return { error: validationErr }

    const assignments = assignRoles(players.map((p) => p.id), config)

    // Atualiza cada jogador. Bulk via Promise.all.
    await Promise.all(
      players.map((p) =>
        service
          .from('vanacamp_players')
          .update({ role: assignments.get(p.id), is_mayor: false })
          .eq('id', p.id)
      )
    )

    // Guarda contagens efetivas
    await service
      .from('vanacamp_sessions')
      .update({ config_json: { ...(session.config_json as object), role_counts: config } })
      .eq('id', sessionId)
  }

  // Diretor automático — também quando os papéis são atribuídos à mão, senão
  // o Narrador ficava sem Diretor e a confirmação falhava até escolher um.
  if (session.mayor_mode === 'auto' && players) {
    await service.from('vanacamp_players').update({ is_mayor: false }).eq('session_id', sessionId)
    const randomIdx = Math.floor(Math.random() * players.length)
    await service
      .from('vanacamp_players')
      .update({ is_mayor: true })
      .eq('id', players[randomIdx].id)
  }

  const { error: updateError } = await service
    .from('vanacamp_sessions')
    .update({
      status: 'role_preview',
      phase_started_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (updateError) return { error: updateError.message }

  await service.from('vanacamp_events').insert({
    session_id: sessionId,
    day_number: 0,
    event_type: 'phase_change',
    payload: { from: 'lobby', to: 'role_preview' },
  })

  revalidatePath(`/jogos/vana-camp/${sessionId}`)
  return {}
}

// ────────────────────────────────────────────────────────────────────
// ROLE PREVIEW — host
// ────────────────────────────────────────────────────────────────────

/**
 * Devolve a lista de jogadores com os seus papéis atuais + histórico das últimas 3
 * sessões terminadas para cada jogador. Restrito ao host.
 */
export async function getRolePreviewData(sessionId: string): Promise<{
  data?: VanaCampPreviewData
  error?: string
}> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, config_json, status, mayor_mode')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host pode ver isto.' }
  if (session.status !== 'role_preview') return { error: 'Esta vista só está disponível no preview.' }

  const { data: players } = await service
    .from('vanacamp_players')
    .select('id, user_id, display_name, role, is_mayor')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })

  if (!players) return { error: 'Sem jogadores.' }

  // Histórico — últimas 3 sessões terminadas por cada user_id
  // Os bots não têm user_id: um null na lista fazia a consulta falhar e ninguém
  // ficava com histórico nas sessões de teste.
  const userIds = players.map((p) => p.user_id).filter((id): id is string => !!id)
  const { data: history } = userIds.length === 0
    ? { data: [] }
    : await service
        .from('vanacamp_players')
        .select('user_id, role, is_mayor, session_id, joined_at, vanacamp_sessions!inner(id, ended_at, status)')
        .in('user_id', userIds)
        .neq('session_id', sessionId)
        .eq('vanacamp_sessions.status', 'finished')
        // Mais recentes primeiro (a ordenação pela tabela embutida não ordena as linhas).
        .order('joined_at', { ascending: false })
        .limit(300)

  const historyByUser = new Map<string, VanaCampRoleHistoryEntry[]>()
  for (const h of history ?? []) {
    if (!h.role) continue
    const sess = h.vanacamp_sessions as unknown as { id: string; ended_at: string | null } | null
    if (!sess) continue
    const arr = historyByUser.get(h.user_id) ?? []
    if (arr.length < 3) {
      arr.push({
        session_id: sess.id,
        role: h.role as VanaCampRole,
        was_mayor: h.is_mayor,
        ended_at: sess.ended_at,
      })
      historyByUser.set(h.user_id, arr)
    }
  }

  const previewPlayers: VanaCampPreviewPlayer[] = players.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    display_name: p.display_name,
    role: p.role as VanaCampRole | null,
    is_mayor: p.is_mayor,
    recent_history: historyByUser.get(p.user_id) ?? [],
  }))

  const currentCounts: VanaCampRoleConfig = {
    infiltrators: players.filter((p) => p.role === 'infiltrator').length,
    seer: players.filter((p) => p.role === 'seer').length,
    guardian: players.filter((p) => p.role === 'guardian').length,
    villagers: players.filter((p) => p.role === 'villager').length,
  }

  const cfg = session.config_json as { role_counts?: VanaCampRoleConfig } | null
  const suggestedCounts = cfg?.role_counts ?? rolesDistribution(players.length)

  return {
    data: {
      players: previewPlayers,
      suggested_counts: suggestedCounts,
      current_counts: currentCounts,
    },
  }
}

/** Re-sorteia papéis preservando a config atual. */
export async function regenerateRoles(sessionId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, status, config_json, mayor_mode')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host.' }
  if (session.status !== 'role_preview') return { error: 'Não estás na fase de preview.' }

  const { data: players } = await service
    .from('vanacamp_players')
    .select('id')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })

  if (!players || players.length < 4) return { error: 'Poucos jogadores.' }

  const cfg = (session.config_json as { role_counts?: VanaCampRoleConfig })?.role_counts
    ?? rolesDistribution(players.length)

  const assignments = assignRoles(players.map((p) => p.id), cfg)
  await Promise.all(
    players.map((p) =>
      service
        .from('vanacamp_players')
        .update({ role: assignments.get(p.id), is_mayor: false })
        .eq('id', p.id)
    )
  )

  if (session.mayor_mode === 'auto') {
    const idx = Math.floor(Math.random() * players.length)
    await service.from('vanacamp_players').update({ is_mayor: true }).eq('id', players[idx].id)
  }

  return {}
}

const VALID_ROLES: VanaCampRole[] = ['infiltrator', 'seer', 'guardian', 'villager']

/** Define o papel de um único jogador (não valida contagens — só validamos ao confirmar). */
export async function updatePlayerRole(
  sessionId: string,
  playerId: string,
  role: VanaCampRole,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host.' }
  if (session.status !== 'role_preview') return { error: 'Não estás na fase de preview.' }
  if (!VALID_ROLES.includes(role)) return { error: 'Papel inválido.' }

  const { error } = await service
    .from('vanacamp_players')
    .update({ role })
    .eq('id', playerId)
    .eq('session_id', sessionId)
  if (error) return { error: error.message }
  return {}
}

/** Troca os papéis entre dois jogadores. */
export async function swapPlayerRoles(
  sessionId: string,
  playerAId: string,
  playerBId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host.' }
  if (session.status !== 'role_preview') return { error: 'Não estás na fase de preview.' }

  const { data: pair } = await service
    .from('vanacamp_players')
    .select('id, role')
    .eq('session_id', sessionId)
    .in('id', [playerAId, playerBId])
  if (!pair || pair.length !== 2) return { error: 'Jogadores inválidos.' }

  const a = pair.find((p) => p.id === playerAId)
  const b = pair.find((p) => p.id === playerBId)
  if (!a || !b) return { error: 'Jogadores inválidos.' }

  await service.from('vanacamp_players').update({ role: b.role }).eq('id', a.id)
  await service.from('vanacamp_players').update({ role: a.role }).eq('id', b.id)
  return {}
}

/** Define (ou limpa) o Mayor — usado em mayor_mode='manual'. */
export async function setMayor(
  sessionId: string,
  playerId: string | null,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host.' }
  if (session.status !== 'role_preview') return { error: 'Só na fase de preview.' }

  // Limpa todos primeiro
  await service.from('vanacamp_players').update({ is_mayor: false }).eq('session_id', sessionId)
  if (playerId) {
    await service
      .from('vanacamp_players')
      .update({ is_mayor: true })
      .eq('id', playerId)
      .eq('session_id', sessionId)
  }
  return {}
}

/** Confirma a distribuição, avança para role_reveal. */
export async function confirmRolesAndReveal(sessionId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser()
  const service = createServiceClient()

  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('host_id, status, mayor_mode')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'Sessão não encontrada.' }
  if (session.host_id !== user.id) return { error: 'Apenas o host.' }
  if (session.status !== 'role_preview') return { error: 'Não estás na fase de preview.' }

  const { data: players } = await service
    .from('vanacamp_players')
    .select('id, role, is_mayor')
    .eq('session_id', sessionId)

  if (!players || players.length < 4) return { error: 'Poucos jogadores.' }
  if (players.some((p) => !p.role)) {
    return { error: 'Há jogadores sem papel atribuído.' }
  }

  const counts: VanaCampRoleConfig = {
    infiltrators: players.filter((p) => p.role === 'infiltrator').length,
    seer: players.filter((p) => p.role === 'seer').length,
    guardian: players.filter((p) => p.role === 'guardian').length,
    villagers: players.filter((p) => p.role === 'villager').length,
  }
  const err = validateRoleConfig(counts, players.length)
  if (err) return { error: err }

  if (session.mayor_mode === 'auto' || session.mayor_mode === 'manual') {
    const mayorCount = players.filter((p) => p.is_mayor).length
    if (mayorCount !== 1) {
      return { error: 'Tens de escolher exatamente 1 Diretor do Clube.' }
    }
  }

  const seconds = VANA_CAMP_DEFAULT_PHASE_SECONDS.role_reveal ?? 8
  const now = new Date()
  const endsAt = new Date(now.getTime() + seconds * 1000)

  await service
    .from('vanacamp_sessions')
    .update({
      status: 'role_reveal',
      phase_started_at: now.toISOString(),
      phase_ends_at: endsAt.toISOString(),
      phase_paused_at: null,
    })
    .eq('id', sessionId)

  await service.from('vanacamp_events').insert({
    session_id: sessionId,
    day_number: 0,
    event_type: 'phase_change',
    payload: { from: 'role_preview', to: 'role_reveal' },
  })

  revalidatePath(`/jogos/vana-camp/${sessionId}`)
  return {}
}

// ────────────────────────────────────────────────────────────────────
// PAPEL DO JOGADOR (cliente busca o seu papel via RPC)
// ────────────────────────────────────────────────────────────────────

/**
 * Devolve o papel do utilizador autenticado nesta sessão (+ se é Mayor + colegas infiltrados).
 * Usa SELECT direto com RLS (que permite ao próprio jogador ler a sua linha).
 */
export async function getMyRoleInSession(sessionId: string): Promise<{
  role?: VanaCampRole | null
  is_mayor?: boolean
  is_alive?: boolean
  fellow_infiltrators?: { id: string; display_name: string }[]
  error?: string
}> {
  const { supabase, user } = await requireUser()

  const { data: me, error } = await supabase
    .from('vanacamp_players')
    .select('role, is_mayor, is_alive')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !me) return { error: 'Não estás nesta sessão.' }

  let fellow: { id: string; display_name: string }[] = []
  if (me.role === 'infiltrator') {
    const service = createServiceClient()
    const { data: others } = await service
      .from('vanacamp_players')
      .select('id, display_name, user_id')
      .eq('session_id', sessionId)
      .eq('role', 'infiltrator')
      .neq('user_id', user.id)
    fellow = (others ?? []).map((o) => ({ id: o.id, display_name: o.display_name }))
  }

  return {
    role: me.role as VanaCampRole | null,
    is_mayor: me.is_mayor,
    is_alive: me.is_alive,
    fellow_infiltrators: fellow,
  }
}

// ════════════════════════════════════════════════════════════════════
// FASE 4 — NOITE
// ════════════════════════════════════════════════════════════════════

/**
 * Helper interno: valida que o user atual é o host da sessão.
 * Devolve a sessão completa.
 */
async function requireHostOfSession(sessionId: string) {
  const { supabase, user } = await requireUser()
  const { data: session } = await supabase
    .from('vanacamp_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (!session) throw new Error('Sessão não encontrada.')
  if (session.host_id !== user.id) throw new Error('Apenas o Narrador.')
  return { supabase, user, session }
}

// ────────────────────────────────────────────────────────────────────
// MAYOR ELECTION (mayor_mode='vote_day1')
// ────────────────────────────────────────────────────────────────────

/**
 * Avança de role_reveal para mayor_election (só se mayor_mode='vote_day1').
 */
export async function startMayorElection(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (session.status !== 'role_reveal') {
      return { error: 'Só podes começar a eleição depois do reveal.' }
    }
    if (session.mayor_mode !== 'vote_day1') {
      return { error: 'O modo de Mayor desta sessão não é por eleição.' }
    }
    const service = createServiceClient()
    if (!(await setPhase(sessionId, 'mayor_election', { from: 'role_reveal' }))) {
      return { error: PHASE_ALREADY_CHANGED }
    }
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: 0,
      event_type: 'phase_change',
      payload: { from: 'role_reveal', to: 'mayor_election' },
    })
    revalidatePath(`/jogos/vana-camp/${sessionId}`)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/** Submete (ou substitui) o voto da eleição do Mayor. */
export async function submitMayorVote(
  sessionId: string,
  targetPlayerId: string,
  actAsPlayerId?: string,
): Promise<{ error?: string }> {
  try {
    const { user } = await requireUser()
    const actor = await resolveActorPlayerId(sessionId, user.id, actAsPlayerId)
    if ('error' in actor) return { error: actor.error }
    if (!actor.is_alive) return { error: 'Já estás em casa.' }

    const service = createServiceClient()
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('status')
      .eq('id', sessionId)
      .single()
    if (!session || session.status !== 'mayor_election') {
      return { error: 'Não é hora de votar no Diretor.' }
    }

    const { data: target } = await service
      .from('vanacamp_players')
      .select('id, is_alive, session_id')
      .eq('id', targetPlayerId)
      .single()
    if (!target || target.session_id !== sessionId) return { error: 'Alvo inválido.' }
    if (!target.is_alive) return { error: 'Alvo inválido.' }

    const { error } = await service
      .from('vanacamp_votes')
      .upsert(
        {
          session_id: sessionId,
          day_number: 0,
          vote_type: 'mayor_election',
          voter_player_id: actor.player_id,
          target_player_id: targetPlayerId,
        },
        { onConflict: 'session_id,day_number,vote_type,voter_player_id' },
      )
    if (error) return { error: error.message }
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/** Contexto da eleição para o jogador. */
export async function getMyMayorVoteContext(
  sessionId: string,
  actAsPlayerId?: string,
): Promise<{
  my_player_id?: string
  current_target_id?: string | null
  players?: { id: string; display_name: string }[]
  votes?: { voter_id: string; target_id: string }[]
  error?: string
}> {
  try {
    const { user } = await requireUser()
    const actor = await resolveActorPlayerId(sessionId, user.id, actAsPlayerId)
    if ('error' in actor) return { error: actor.error }

    const service = createServiceClient()
    const { data: alive } = await service
      .from('vanacamp_players')
      .select('id, display_name')
      .eq('session_id', sessionId)
      .eq('is_alive', true)
      .order('display_name', { ascending: true })

    const { data: myVote } = await service
      .from('vanacamp_votes')
      .select('target_player_id')
      .eq('session_id', sessionId)
      .eq('day_number', 0)
      .eq('vote_type', 'mayor_election')
      .eq('voter_player_id', actor.player_id)
      .maybeSingle()

    const { data: allVotes } = await service
      .from('vanacamp_votes')
      .select('voter_player_id, target_player_id')
      .eq('session_id', sessionId)
      .eq('day_number', 0)
      .eq('vote_type', 'mayor_election')

    return {
      my_player_id: actor.player_id,
      current_target_id: myVote?.target_player_id ?? null,
      players: alive ?? [],
      votes: (allVotes ?? []).map((v) => ({
        voter_id: v.voter_player_id,
        target_id: v.target_player_id,
      })),
    }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/** Resolve a eleição: tally simples (sem desempate, vence o mais votado, em
 *  empate fica sem Mayor) e avança para night_infiltrators. */
export async function resolveMayorElection(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (session.status !== 'mayor_election') return { error: 'Não estás na eleição.' }
    const service = createServiceClient()

    const { data: votes } = await service
      .from('vanacamp_votes')
      .select('target_player_id')
      .eq('session_id', sessionId)
      .eq('day_number', 0)
      .eq('vote_type', 'mayor_election')

    const tally = new Map<string, number>()
    for (const v of votes ?? []) {
      tally.set(v.target_player_id, (tally.get(v.target_player_id) ?? 0) + 1)
    }

    let mayorId: string | null = null
    if (tally.size > 0) {
      const sorted = [...tally.entries()].sort(([, a], [, b]) => b - a)
      // Em caso de empate fica sem Mayor (decisão de design)
      if (sorted.length === 1 || sorted[0][1] > sorted[1][1]) {
        mayorId = sorted[0][0]
      }
    }

    // Limpa qualquer is_mayor anterior e atribui
    await service.from('vanacamp_players').update({ is_mayor: false }).eq('session_id', sessionId)
    if (mayorId) {
      await service.from('vanacamp_players').update({ is_mayor: true }).eq('id', mayorId)
    }

    const { data: mayorPlayer } = mayorId
      ? await service.from('vanacamp_players').select('display_name').eq('id', mayorId).single()
      : { data: null }

    // Avança automaticamente para a primeira noite
    const newDay = 1
    if (!(await setPhase(sessionId, 'night_infiltrators', { day_number: newDay, from: 'mayor_election' }))) {
      return { error: PHASE_ALREADY_CHANGED }
    }

    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: 0,
      event_type: 'mayor_elected',
      payload: {
        mayor_id: mayorId,
        mayor_name: mayorPlayer?.display_name ?? null,
        counts: Object.fromEntries(tally),
      },
    })
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: newDay,
      event_type: 'phase_change',
      payload: { from: 'mayor_election', to: 'night_infiltrators', day: newDay },
    })
    await emitVibrationForRole(sessionId, 'infiltrator', 'night_call')

    revalidatePath(`/jogos/vana-camp/${sessionId}`)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/**
 * Resolve a sub-fase noturna seguinte tendo em conta papéis vivos.
 * Devolve null quando já não há sub-fases (passa para day_announce).
 */
async function nextNightSubphase(
  sessionId: string,
  current: 'night_infiltrators' | 'night_seer' | 'night_guardian',
): Promise<'night_seer' | 'night_guardian' | null> {
  const service = createServiceClient()
  const { data: alive } = await service
    .from('vanacamp_players')
    .select('role')
    .eq('session_id', sessionId)
    .eq('is_alive', true)
  const hasSeer = (alive ?? []).some((p) => p.role === 'seer')
  const hasGuardian = (alive ?? []).some((p) => p.role === 'guardian')

  if (current === 'night_infiltrators') {
    if (hasSeer) return 'night_seer'
    if (hasGuardian) return 'night_guardian'
    return null
  }
  if (current === 'night_seer') {
    if (hasGuardian) return 'night_guardian'
    return null
  }
  return null
}

/**
 * Define a nova fase e seu timer. Não emite eventos (faz isso quem chama).
 * Com `from`, devolve false (sem alterar nada) se a sessão já não estiver nessa fase.
 */
async function setPhase(
  sessionId: string,
  newStatus: string,
  options: { day_number?: number; seconds?: number; from?: string } = {},
): Promise<boolean> {
  const service = createServiceClient()
  const seconds =
    options.seconds ??
    VANA_CAMP_DEFAULT_PHASE_SECONDS[newStatus as keyof typeof VANA_CAMP_DEFAULT_PHASE_SECONDS] ??
    60
  const now = new Date()
  const endsAt = new Date(now.getTime() + seconds * 1000)
  const update: Record<string, unknown> = {
    status: newStatus,
    phase_started_at: now.toISOString(),
    phase_ends_at: endsAt.toISOString(),
    phase_paused_at: null,
  }
  if (options.day_number !== undefined) update.day_number = options.day_number
  let query = service.from('vanacamp_sessions').update(update).eq('id', sessionId)
  // Só muda se a sessão ainda estiver na fase de onde partimos: dois pedidos
  // quase simultâneos (dois separadores, toque duplo) não saltam uma fase.
  if (options.from) query = query.eq('status', options.from)
  const { data } = await query.select('id')
  return (data ?? []).length > 0
}

const PHASE_ALREADY_CHANGED = 'A fase já tinha mudado. Atualiza a página.'

/** Emite vibração para um grupo (resolve targets no servidor). */
async function emitVibrationForRole(
  sessionId: string,
  role: VanaCampRole,
  pattern: 'short' | 'alert' | 'urgent' | 'night_call' = 'night_call',
) {
  const service = createServiceClient()
  const { data } = await service
    .from('vanacamp_players')
    .select('id')
    .eq('session_id', sessionId)
    .eq('role', role)
    .eq('is_alive', true)
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length === 0) return
  await service.from('vanacamp_events').insert({
    session_id: sessionId,
    day_number: 0,
    event_type: 'vibrate',
    payload: { target_player_ids: ids, pattern },
  })
}

/**
 * Avança de role_reveal (ou day_result, ou mayor_election) para a primeira
 * sub-fase da noite.
 */
export async function startNight(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (
      session.status !== 'role_reveal' &&
      session.status !== 'day_result' &&
      session.status !== 'mayor_election'
    ) {
      return { error: 'Não estás no momento de começar a noite.' }
    }

    const service = createServiceClient()
    // No mayor_election já fizemos day_number=1 e avançámos; nos outros casos sobe.
    const newDay = session.status === 'mayor_election'
      ? session.day_number
      : (session.day_number ?? 0) + 1
    if (!(await setPhase(sessionId, 'night_infiltrators', { day_number: newDay, from: session.status }))) {
      return { error: PHASE_ALREADY_CHANGED }
    }

    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: newDay,
      event_type: 'phase_change',
      payload: { from: session.status, to: 'night_infiltrators', day: newDay },
    })

    await emitVibrationForRole(sessionId, 'infiltrator', 'night_call')

    revalidatePath(`/jogos/vana-camp/${sessionId}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro.' }
  }
}

/**
 * Avança a sub-fase noturna ou resolve a noite e passa para day_announce.
 * O host invoca isto manualmente ou através do timeout.
 */
export async function advanceNightPhase(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    const service = createServiceClient()

    if (
      session.status !== 'night_infiltrators' &&
      session.status !== 'night_seer' &&
      session.status !== 'night_guardian'
    ) {
      return { error: 'Não estás numa fase noturna.' }
    }

    const next = await nextNightSubphase(sessionId, session.status as 'night_infiltrators' | 'night_seer' | 'night_guardian')

    if (next) {
      if (!(await setPhase(sessionId, next, { from: session.status }))) {
        return { error: PHASE_ALREADY_CHANGED }
      }
      await service.from('vanacamp_events').insert({
        session_id: sessionId,
        day_number: session.day_number,
        event_type: 'phase_change',
        payload: { from: session.status, to: next },
      })
      const roleToVibe: VanaCampRole = next === 'night_seer' ? 'seer' : 'guardian'
      await emitVibrationForRole(sessionId, roleToVibe, 'night_call')
      revalidatePath(`/jogos/vana-camp/${sessionId}`)
      return {}
    }

    // Acabou a noite — resolve
    await resolveNightAndAdvanceToDay(sessionId, session.day_number, session.status)
    revalidatePath(`/jogos/vana-camp/${sessionId}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro.' }
  }
}

/**
 * Calcula sabotagem, aplica eliminações, regista eventos, verifica vitória.
 */
async function resolveNightAndAdvanceToDay(sessionId: string, dayNumber: number, fromStatus: string) {
  const service = createServiceClient()

  const { data: actions } = await service
    .from('vanacamp_night_actions')
    .select('*')
    .eq('session_id', sessionId)
    .eq('day_number', dayNumber)
    .order('created_at', { ascending: true })

  const resolution = resolveNight((actions ?? []) as never)

  // Lookup p/ enriquecer eventos
  const { data: allPlayers } = await service
    .from('vanacamp_players')
    .select('id, role, is_alive, display_name')
    .eq('session_id', sessionId)

  const playersById = new Map((allPlayers ?? []).map((p) => [p.id, p]))

  if (resolution.killed_player_id) {
    const target = playersById.get(resolution.killed_player_id)
    await service
      .from('vanacamp_players')
      .update({
        is_alive: false,
        eliminated_on_day: dayNumber,
        eliminated_by: 'sabotage',
      })
      .eq('id', resolution.killed_player_id)
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: dayNumber,
      event_type: 'death',
      payload: {
        target_id: resolution.killed_player_id,
        target_name: target?.display_name ?? null,
        cause: 'sabotage',
      },
    })
  } else if (resolution.saved) {
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: dayNumber,
      event_type: 'save',
      payload: { protected_by_guardian: true },
    })
  } else {
    // Não houve consenso dos infiltrados
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: dayNumber,
      event_type: 'night_resolved',
      payload: { outcome: 'nobody_targeted' },
    })
  }

  // Verifica vitória
  const snapshots: PlayerSnapshot[] = (allPlayers ?? []).map((p) => ({
    id: p.id,
    role: (p.id === resolution.killed_player_id ? p.role : p.role) as VanaCampRole,
    is_alive: p.id === resolution.killed_player_id ? false : p.is_alive,
  }))
  const winner = checkWinCondition(snapshots.filter((s) => s.role !== null))

  if (winner) {
    const { data: finished } = await service
      .from('vanacamp_sessions')
      .update({
        status: 'finished',
        winner_side: winner,
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('status', fromStatus)
      .select('id')
    if (!finished || finished.length === 0) return
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: dayNumber,
      event_type: 'win',
      payload: { side: winner },
    })
    return
  }

  // Avança para day_announce
  if (!(await setPhase(sessionId, 'day_announce', { from: fromStatus }))) return
  await service.from('vanacamp_events').insert({
    session_id: sessionId,
    day_number: dayNumber,
    event_type: 'phase_change',
    payload: { from: 'night', to: 'day_announce' },
  })
}

// ────────────────────────────────────────────────────────────────────
// CONTROLO DE TIMER (host)
// ────────────────────────────────────────────────────────────────────

export async function pausePhase(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (session.phase_paused_at) return { error: 'Já está em pausa.' }
    const service = createServiceClient()
    await service
      .from('vanacamp_sessions')
      .update({ phase_paused_at: new Date().toISOString() })
      .eq('id', sessionId)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

export async function resumePhase(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (!session.phase_paused_at || !session.phase_ends_at) return { error: 'Não está em pausa.' }
    const pausedAt = new Date(session.phase_paused_at).getTime()
    const endsAt = new Date(session.phase_ends_at).getTime()
    const offset = Date.now() - pausedAt
    const newEnds = new Date(endsAt + offset).toISOString()
    const service = createServiceClient()
    await service
      .from('vanacamp_sessions')
      .update({ phase_ends_at: newEnds, phase_paused_at: null })
      .eq('id', sessionId)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

export async function extendPhase(sessionId: string, seconds: number): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (!session.phase_ends_at) return { error: 'Sem timer ativo.' }
    // Referência: se estiver em pausa, o "agora" efetivo é o momento da pausa
    // (o relógio está congelado). Senão, é agora mesmo.
    const ref = session.phase_paused_at ? new Date(session.phase_paused_at).getTime() : Date.now()
    // Se o timer já expirou, soma a partir da referência (não do fim no passado),
    // para que +30s passe mesmo a haver 30s no relógio.
    const base = Math.max(new Date(session.phase_ends_at).getTime(), ref)
    const newEnds = new Date(base + seconds * 1000).toISOString()
    const service = createServiceClient()
    await service.from('vanacamp_sessions').update({ phase_ends_at: newEnds }).eq('id', sessionId)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

// ────────────────────────────────────────────────────────────────────
// AÇÕES NOTURNAS DOS JOGADORES (com suporte de impersonação)
// ────────────────────────────────────────────────────────────────────

/**
 * Resolve o player_id a usar: se `actAsPlayerId` for fornecido E o user for host de
 * sessão de teste E o alvo for bot dessa sessão, usa esse id; senão usa o user.
 */
async function resolveActorPlayerId(
  sessionId: string,
  userId: string,
  actAsPlayerId?: string,
): Promise<{ player_id: string; role: VanaCampRole | null; is_alive: boolean } | { error: string }> {
  const service = createServiceClient()

  if (actAsPlayerId) {
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('host_id, is_test_session')
      .eq('id', sessionId)
      .single()
    if (!session) return { error: 'Sessão não encontrada.' }
    if (session.host_id !== userId) return { error: 'Apenas o host pode impersonar.' }
    if (!session.is_test_session) return { error: 'Impersonação só em sessões de teste.' }
    const { data: bot } = await service
      .from('vanacamp_players')
      .select('id, role, is_alive, is_bot, session_id')
      .eq('id', actAsPlayerId)
      .single()
    if (!bot || bot.session_id !== sessionId) return { error: 'Bot inválido.' }
    if (!bot.is_bot) return { error: 'Esse jogador não é bot.' }
    return { player_id: bot.id, role: bot.role as VanaCampRole | null, is_alive: bot.is_alive }
  }

  const { data: me } = await service
    .from('vanacamp_players')
    .select('id, role, is_alive')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!me) return { error: 'Não estás nesta sessão.' }
  return { player_id: me.id, role: me.role as VanaCampRole | null, is_alive: me.is_alive }
}

/**
 * Submete (ou substitui) a ação noturna do actor.
 * Validações:
 *   - Fase correta para o papel
 *   - Actor vivo
 *   - Alvo vivo e da mesma sessão
 *   - Guardian não pode proteger o mesmo da noite anterior
 */
export async function submitNightAction(
  sessionId: string,
  targetPlayerId: string,
  actAsPlayerId?: string,
): Promise<{ error?: string; result?: 'fiel' | 'infiltrado' | null }> {
  try {
    const { user } = await requireUser()
    const actor = await resolveActorPlayerId(sessionId, user.id, actAsPlayerId)
    if ('error' in actor) return { error: actor.error }
    if (!actor.is_alive) return { error: 'Já estás em casa.' }

    const service = createServiceClient()
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('status, day_number')
      .eq('id', sessionId)
      .single()
    if (!session) return { error: 'Sessão não encontrada.' }

    // Determina fase esperada para este papel
    let phase: 'infiltrators' | 'seer' | 'guardian'
    if (actor.role === 'infiltrator') phase = 'infiltrators'
    else if (actor.role === 'seer') phase = 'seer'
    else if (actor.role === 'guardian') phase = 'guardian'
    else return { error: 'O teu papel não age à noite.' }

    const expectedStatus = `night_${phase}`
    if (session.status !== expectedStatus) {
      return { error: 'Não é a fase certa para agir.' }
    }

    // Alvo válido
    const { data: target } = await service
      .from('vanacamp_players')
      .select('id, role, is_alive, session_id, display_name')
      .eq('id', targetPlayerId)
      .single()
    if (!target || target.session_id !== sessionId) return { error: 'Alvo inválido.' }
    if (!target.is_alive) return { error: 'Essa pessoa já foi para casa.' }

    // Guardian: não pode repetir alvo da noite anterior
    if (phase === 'guardian' && session.day_number > 1) {
      const { data: prev } = await service
        .from('vanacamp_night_actions')
        .select('target_player_id')
        .eq('session_id', sessionId)
        .eq('day_number', session.day_number - 1)
        .eq('phase', 'guardian')
        .eq('actor_player_id', actor.player_id)
        .maybeSingle()
      if (prev && prev.target_player_id === targetPlayerId) {
        return { error: 'Não podes proteger a mesma pessoa duas noites seguidas.' }
      }
    }

    // Seer: uma profecia por noite — bloqueia se já tiver agido
    if (phase === 'seer') {
      const { data: existing } = await service
        .from('vanacamp_night_actions')
        .select('id, target_player_id, result')
        .eq('session_id', sessionId)
        .eq('day_number', session.day_number)
        .eq('phase', 'seer')
        .eq('actor_player_id', actor.player_id)
        .maybeSingle()
      if (existing) {
        return { error: 'Já fizeste a tua profecia esta noite.' }
      }
    }

    // Seer: calcula resultado
    const result =
      phase === 'seer'
        ? target.role === 'infiltrator' ? 'infiltrado' : 'fiel'
        : null

    // Upsert (substitui a ação anterior — para infiltrators/guardian que podem mudar)
    const { error: upsertError } = await service
      .from('vanacamp_night_actions')
      .upsert(
        {
          session_id: sessionId,
          day_number: session.day_number,
          phase,
          actor_player_id: actor.player_id,
          target_player_id: targetPlayerId,
          result,
        },
        { onConflict: 'session_id,day_number,phase,actor_player_id' },
      )

    if (upsertError) {
      console.error('[vana-camp] submitNightAction upsert error:', upsertError, {
        session_id: sessionId,
        day_number: session.day_number,
        phase,
        actor_player_id: actor.player_id,
        target_player_id: targetPlayerId,
        actAsPlayerId,
      })
      return { error: `BD recusou a ação: ${upsertError.message}` }
    }

    return { result }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro.' }
  }
}

/**
 * Devolve a ação atual do jogador (para reconexão / mostrar UI).
 */
export async function getMyNightContext(
  sessionId: string,
  actAsPlayerId?: string,
): Promise<{
  my_player_id?: string
  my_role?: VanaCampRole | null
  is_alive?: boolean
  current_target_id?: string | null
  current_result?: 'fiel' | 'infiltrado' | null
  alive_players?: { id: string; display_name: string }[]
  guardian_last_target_id?: string | null
  /** Apenas no canal dos infiltrados: ver votos dos colegas. */
  infiltrator_votes?: { actor_id: string; target_id: string }[]
  error?: string
}> {
  try {
    const { user } = await requireUser()
    const actor = await resolveActorPlayerId(sessionId, user.id, actAsPlayerId)
    if ('error' in actor) return { error: actor.error }

    const service = createServiceClient()
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('status, day_number')
      .eq('id', sessionId)
      .single()
    if (!session) return { error: 'Sessão não encontrada.' }

    const { data: alive } = await service
      .from('vanacamp_players')
      .select('id, display_name')
      .eq('session_id', sessionId)
      .eq('is_alive', true)
      .order('display_name', { ascending: true })

    let phase: 'infiltrators' | 'seer' | 'guardian' | null = null
    if (actor.role === 'infiltrator') phase = 'infiltrators'
    else if (actor.role === 'seer') phase = 'seer'
    else if (actor.role === 'guardian') phase = 'guardian'

    let current_target_id: string | null = null
    let current_result: 'fiel' | 'infiltrado' | null = null
    let guardian_last_target_id: string | null = null
    let infiltrator_votes: { actor_id: string; target_id: string }[] | undefined

    if (phase) {
      const { data: action } = await service
        .from('vanacamp_night_actions')
        .select('target_player_id, result')
        .eq('session_id', sessionId)
        .eq('day_number', session.day_number)
        .eq('phase', phase)
        .eq('actor_player_id', actor.player_id)
        .maybeSingle()
      if (action) {
        current_target_id = action.target_player_id
        current_result = action.result as 'fiel' | 'infiltrado' | null
      }

      if (phase === 'guardian' && session.day_number > 1) {
        const { data: prev } = await service
          .from('vanacamp_night_actions')
          .select('target_player_id')
          .eq('session_id', sessionId)
          .eq('day_number', session.day_number - 1)
          .eq('phase', 'guardian')
          .eq('actor_player_id', actor.player_id)
          .maybeSingle()
        if (prev) guardian_last_target_id = prev.target_player_id
      }

      if (phase === 'infiltrators') {
        const { data: votes } = await service
          .from('vanacamp_night_actions')
          .select('actor_player_id, target_player_id')
          .eq('session_id', sessionId)
          .eq('day_number', session.day_number)
          .eq('phase', 'infiltrators')
        infiltrator_votes = (votes ?? []).map((v) => ({
          actor_id: v.actor_player_id,
          target_id: v.target_player_id,
        }))
      }
    }

    return {
      my_player_id: actor.player_id,
      my_role: actor.role,
      is_alive: actor.is_alive,
      current_target_id,
      current_result,
      alive_players: alive ?? [],
      guardian_last_target_id,
      infiltrator_votes,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro.' }
  }
}

/**
 * Devolve o estado de "todos prontos" para o painel do Narrador.
 */
export async function getNightProgress(sessionId: string): Promise<{
  expected?: number
  submitted?: number
  pending_names?: string[]
  eyes_closed_names?: string[]
  error?: string
}> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    const service = createServiceClient()
    let role: VanaCampRole | null = null
    if (session.status === 'night_infiltrators') role = 'infiltrator'
    else if (session.status === 'night_seer') role = 'seer'
    else if (session.status === 'night_guardian') role = 'guardian'
    else return { expected: 0, submitted: 0, pending_names: [], eyes_closed_names: [] }

    const { data: actors } = await service
      .from('vanacamp_players')
      .select('id, display_name')
      .eq('session_id', sessionId)
      .eq('role', role)
      .eq('is_alive', true)

    const { data: subs } = await service
      .from('vanacamp_night_actions')
      .select('actor_player_id')
      .eq('session_id', sessionId)
      .eq('day_number', session.day_number)
      .eq('phase', role === 'infiltrator' ? 'infiltrators' : role)

    const subbed = new Set((subs ?? []).map((s) => s.actor_player_id))
    const pending = (actors ?? []).filter((a) => !subbed.has(a.id)).map((a) => a.display_name)

    // Quem sinalizou "olhos fechados" nesta fase/dia (estado mais recente por jogador).
    const { data: eyeEvents } = await service
      .from('vanacamp_events')
      .select('payload, created_at')
      .eq('session_id', sessionId)
      .eq('event_type', 'eyes_closed')
      .eq('day_number', session.day_number)
      .order('created_at', { ascending: true })
    const eyeState = new Map<string, boolean>()
    for (const e of eyeEvents ?? []) {
      const p = e.payload as { player_id?: string; closed?: boolean; phase?: string }
      if (p.phase !== session.status || !p.player_id) continue
      eyeState.set(p.player_id, !!p.closed)
    }
    const closedIds = new Set([...eyeState.entries()].filter(([, c]) => c).map(([id]) => id))
    const eyes_closed_names = (actors ?? []).filter((a) => closedIds.has(a.id)).map((a) => a.display_name)

    return {
      expected: (actors ?? []).length,
      submitted: subbed.size,
      pending_names: pending,
      eyes_closed_names,
    }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/**
 * Sinaliza que o jogador fechou (ou reabriu) os olhos durante a sua fase noturna.
 * Regista um evento `eyes_closed` que o painel do Narrador lê em tempo real.
 */
export async function signalEyesState(
  sessionId: string,
  closed: boolean,
  actAsPlayerId?: string,
): Promise<{ error?: string }> {
  try {
    const { user } = await requireUser()
    const actor = await resolveActorPlayerId(sessionId, user.id, actAsPlayerId)
    if ('error' in actor) return { error: actor.error }

    const service = createServiceClient()
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('status, day_number')
      .eq('id', sessionId)
      .single()
    if (!session) return { error: 'Sessão não encontrada.' }

    const { data: me } = await service
      .from('vanacamp_players')
      .select('display_name')
      .eq('id', actor.player_id)
      .single()

    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: session.day_number,
      event_type: 'eyes_closed',
      payload: {
        player_id: actor.player_id,
        player_name: me?.display_name ?? null,
        closed,
        phase: session.status,
      },
    })
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

// ────────────────────────────────────────────────────────────────────
// CHAT (infiltrados / dead / lobby / day)
// ────────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════
// FASE 5 — O DIA (discussão → votação → resultado)
// ════════════════════════════════════════════════════════════════════

/**
 * Avança de day_announce → day_discussion (host clica "Começar discussão").
 */
export async function startDayDiscussion(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (session.status !== 'day_announce') {
      return { error: 'Só podes começar a discussão depois do anúncio.' }
    }
    const service = createServiceClient()
    if (!(await setPhase(sessionId, 'day_discussion', { from: 'day_announce' }))) {
      return { error: PHASE_ALREADY_CHANGED }
    }
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: session.day_number,
      event_type: 'phase_change',
      payload: { from: 'day_announce', to: 'day_discussion' },
    })
    revalidatePath(`/jogos/vana-camp/${sessionId}`)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/**
 * Avança de day_discussion → day_vote (host clica "Ir à votação").
 */
export async function startDayVote(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (session.status !== 'day_discussion') {
      return { error: 'Só podes começar a votação depois da discussão.' }
    }
    const service = createServiceClient()
    if (!(await setPhase(sessionId, 'day_vote', { from: 'day_discussion' }))) {
      return { error: PHASE_ALREADY_CHANGED }
    }
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: session.day_number,
      event_type: 'phase_change',
      payload: { from: 'day_discussion', to: 'day_vote' },
    })
    // Vibra todos os vivos para chamarem atenção à votação
    const { data: alive } = await service
      .from('vanacamp_players')
      .select('id')
      .eq('session_id', sessionId)
      .eq('is_alive', true)
    const ids = (alive ?? []).map((p) => p.id)
    if (ids.length > 0) {
      await service.from('vanacamp_events').insert({
        session_id: sessionId,
        day_number: session.day_number,
        event_type: 'vibrate',
        payload: { target_player_ids: ids, pattern: 'alert' },
      })
    }
    revalidatePath(`/jogos/vana-camp/${sessionId}`)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/**
 * Submete (ou substitui) o voto de expulsão diária do actor.
 */
export async function submitDayVote(
  sessionId: string,
  targetPlayerId: string,
  actAsPlayerId?: string,
): Promise<{ error?: string }> {
  try {
    const { user } = await requireUser()
    const actor = await resolveActorPlayerId(sessionId, user.id, actAsPlayerId)
    if ('error' in actor) return { error: actor.error }
    if (!actor.is_alive) return { error: 'Já estás em casa — não podes votar.' }

    const service = createServiceClient()
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('status, day_number')
      .eq('id', sessionId)
      .single()
    if (!session) return { error: 'Sessão não encontrada.' }
    if (session.status !== 'day_vote') {
      return { error: 'Não é hora de votar.' }
    }

    const { data: target } = await service
      .from('vanacamp_players')
      .select('id, is_alive, session_id')
      .eq('id', targetPlayerId)
      .single()
    if (!target || target.session_id !== sessionId) return { error: 'Alvo inválido.' }
    if (!target.is_alive) return { error: 'Essa pessoa já foi para casa.' }
    if (target.id === actor.player_id) return { error: 'Não podes votar em ti.' }

    const { error } = await service
      .from('vanacamp_votes')
      .upsert(
        {
          session_id: sessionId,
          day_number: session.day_number,
          vote_type: 'day_expulsion',
          voter_player_id: actor.player_id,
          target_player_id: targetPlayerId,
        },
        { onConflict: 'session_id,day_number,vote_type,voter_player_id' },
      )
    if (error) return { error: error.message }
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/**
 * Devolve contexto da votação para um jogador (vivos, voto atual).
 */
export async function getMyDayVoteContext(
  sessionId: string,
  actAsPlayerId?: string,
): Promise<{
  my_player_id?: string
  is_alive?: boolean
  is_mayor?: boolean
  current_target_id?: string | null
  alive_players?: { id: string; display_name: string; is_mayor: boolean }[]
  /** Votos públicos (todos veem em quem cada um votou). */
  votes?: { voter_id: string; target_id: string }[]
  error?: string
}> {
  try {
    const { user } = await requireUser()
    const actor = await resolveActorPlayerId(sessionId, user.id, actAsPlayerId)
    if ('error' in actor) return { error: actor.error }

    const service = createServiceClient()
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('day_number')
      .eq('id', sessionId)
      .single()
    if (!session) return { error: 'Sessão não encontrada.' }

    const { data: me } = await service
      .from('vanacamp_players')
      .select('is_mayor')
      .eq('id', actor.player_id)
      .single()

    const { data: alive } = await service
      .from('vanacamp_players')
      .select('id, display_name, is_mayor')
      .eq('session_id', sessionId)
      .eq('is_alive', true)
      .order('display_name', { ascending: true })

    const { data: myVote } = await service
      .from('vanacamp_votes')
      .select('target_player_id')
      .eq('session_id', sessionId)
      .eq('day_number', session.day_number)
      .eq('vote_type', 'day_expulsion')
      .eq('voter_player_id', actor.player_id)
      .maybeSingle()

    const { data: allVotes } = await service
      .from('vanacamp_votes')
      .select('voter_player_id, target_player_id')
      .eq('session_id', sessionId)
      .eq('day_number', session.day_number)
      .eq('vote_type', 'day_expulsion')

    return {
      my_player_id: actor.player_id,
      is_alive: actor.is_alive,
      is_mayor: me?.is_mayor ?? false,
      current_target_id: myVote?.target_player_id ?? null,
      alive_players: alive ?? [],
      votes: (allVotes ?? []).map((v) => ({
        voter_id: v.voter_player_id,
        target_id: v.target_player_id,
      })),
    }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/**
 * Progresso da votação para o painel do Narrador.
 */
export async function getDayVoteProgress(sessionId: string): Promise<{
  expected?: number
  submitted?: number
  pending_names?: string[]
  tally?: Record<string, { count: number; name: string }>
  error?: string
}> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    const service = createServiceClient()

    const { data: alive } = await service
      .from('vanacamp_players')
      .select('id, display_name')
      .eq('session_id', sessionId)
      .eq('is_alive', true)

    const { data: votes } = await service
      .from('vanacamp_votes')
      .select('voter_player_id, target_player_id')
      .eq('session_id', sessionId)
      .eq('day_number', session.day_number)
      .eq('vote_type', 'day_expulsion')

    const nameById = new Map((alive ?? []).map((p) => [p.id, p.display_name]))
    const voted = new Set((votes ?? []).map((v) => v.voter_player_id))
    const pending = (alive ?? []).filter((p) => !voted.has(p.id)).map((p) => p.display_name)

    const tally: Record<string, { count: number; name: string }> = {}
    for (const v of votes ?? []) {
      const name = nameById.get(v.target_player_id) ?? '?'
      if (!tally[v.target_player_id]) tally[v.target_player_id] = { count: 0, name }
      tally[v.target_player_id].count += 1
    }

    return {
      expected: (alive ?? []).length,
      submitted: voted.size,
      pending_names: pending,
      tally,
    }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/**
 * Progresso da eleição do Diretor para o ecrã de projeção (corre como host).
 * O host não é jogador, por isso não pode usar getMyMayorVoteContext — esta
 * função é host-only e não exige uma linha em vanacamp_players.
 */
export async function getMayorElectionProgress(sessionId: string): Promise<{
  players?: { id: string; display_name: string }[]
  votes?: { voter_id: string; target_id: string }[]
  expected?: number
  error?: string
}> {
  try {
    await requireHostOfSession(sessionId)
    const service = createServiceClient()

    const { data: alive } = await service
      .from('vanacamp_players')
      .select('id, display_name')
      .eq('session_id', sessionId)
      .eq('is_alive', true)
      .order('display_name', { ascending: true })

    const { data: votes } = await service
      .from('vanacamp_votes')
      .select('voter_player_id, target_player_id')
      .eq('session_id', sessionId)
      .eq('day_number', 0)
      .eq('vote_type', 'mayor_election')

    return {
      players: alive ?? [],
      votes: (votes ?? []).map((v) => ({
        voter_id: v.voter_player_id,
        target_id: v.target_player_id,
      })),
      expected: (alive ?? []).length,
    }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/**
 * Resolve a votação: aplica desempate do Mayor, elimina, verifica vitória,
 * avança para day_result (ou finished).
 */
export async function resolveDayVote(sessionId: string): Promise<{ error?: string }> {
  try {
    const { session } = await requireHostOfSession(sessionId)
    if (session.status !== 'day_vote') return { error: 'Não estás na fase de votação.' }
    const service = createServiceClient()

    const { data: votes } = await service
      .from('vanacamp_votes')
      .select('*')
      .eq('session_id', sessionId)
      .eq('day_number', session.day_number)
      .eq('vote_type', 'day_expulsion')

    // Mayor vivo, se existir
    const { data: mayor } = await service
      .from('vanacamp_players')
      .select('id')
      .eq('session_id', sessionId)
      .eq('is_mayor', true)
      .eq('is_alive', true)
      .maybeSingle()

    const result = tallyVotes((votes ?? []) as never, mayor?.id ?? null)

    const { data: allPlayers } = await service
      .from('vanacamp_players')
      .select('id, role, is_alive, display_name')
      .eq('session_id', sessionId)

    let eliminated: { id: string; role: VanaCampRole | null; name: string } | null = null
    if (result.winner_id) {
      const target = (allPlayers ?? []).find((p) => p.id === result.winner_id)
      if (target) {
        await service
          .from('vanacamp_players')
          .update({
            is_alive: false,
            eliminated_on_day: session.day_number,
            eliminated_by: 'vote',
          })
          .eq('id', target.id)
        eliminated = {
          id: target.id,
          role: target.role as VanaCampRole | null,
          name: target.display_name,
        }
      }
    }

    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: session.day_number,
      event_type: 'vote_tally',
      payload: {
        counts: result.counts,
        winner_id: result.winner_id,
        mayor_tiebreak_used: result.mayor_tiebreak_used,
        eliminated,
      },
    })

    // Verifica vitória
    const snapshots: PlayerSnapshot[] = (allPlayers ?? [])
      .filter((p) => p.role)
      .map((p) => ({
        id: p.id,
        role: p.role as VanaCampRole,
        is_alive: p.id === eliminated?.id ? false : p.is_alive,
      }))
    const winner = checkWinCondition(snapshots)

    if (winner) {
      const { data: finished } = await service
        .from('vanacamp_sessions')
        .update({
          status: 'finished',
          winner_side: winner,
          ended_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('status', 'day_vote')
        .select('id')
      if (!finished || finished.length === 0) return { error: PHASE_ALREADY_CHANGED }
      await service.from('vanacamp_events').insert({
        session_id: sessionId,
        day_number: session.day_number,
        event_type: 'win',
        payload: { side: winner },
      })
      revalidatePath(`/jogos/vana-camp/${sessionId}`)
      return {}
    }

    if (!(await setPhase(sessionId, 'day_result', { from: 'day_vote' }))) {
      return { error: PHASE_ALREADY_CHANGED }
    }
    await service.from('vanacamp_events').insert({
      session_id: sessionId,
      day_number: session.day_number,
      event_type: 'phase_change',
      payload: { from: 'day_vote', to: 'day_result' },
    })

    revalidatePath(`/jogos/vana-camp/${sessionId}`)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

/** Garante que o utilizador é o Narrador ou um jogador desta sessão. */
async function requireSessionMember(sessionId: string) {
  const { user } = await requireUser()
  const service = createServiceClient()
  const { data: session } = await service
    .from('vanacamp_sessions')
    .select('host_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) throw new Error('Sessão não encontrada.')
  if (session.host_id === user.id) return
  const { data: me } = await service
    .from('vanacamp_players')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!me) throw new Error('Não estás nesta sessão.')
}

/**
 * Devolve o resultado da votação (para o ecrã de day_result).
 */
export async function getDayResult(sessionId: string, dayNumber: number): Promise<{
  eliminated?: { id: string; role: VanaCampRole | null; name: string } | null
  mayor_tiebreak_used?: boolean
  counts?: Record<string, number>
  error?: string
}> {
  try {
    await requireSessionMember(sessionId)
    const service = createServiceClient()
    const { data: event } = await service
      .from('vanacamp_events')
      .select('payload')
      .eq('session_id', sessionId)
      .eq('day_number', dayNumber)
      .eq('event_type', 'vote_tally')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!event) return { eliminated: null, counts: {} }
    const payload = event.payload as {
      eliminated: { id: string; role: VanaCampRole | null; name: string } | null
      counts: Record<string, number>
      mayor_tiebreak_used: boolean
    }
    return {
      eliminated: payload.eliminated,
      mayor_tiebreak_used: payload.mayor_tiebreak_used,
      counts: payload.counts,
    }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

// ════════════════════════════════════════════════════════════════════
// PRÉMIOS XP / GOLD
// ════════════════════════════════════════════════════════════════════

const REWARDS = {
  winning_side: { xp: 30, gold: 15 },
  survived: { xp: 20, gold: 10 },
  seer_correct: { xp: 10, gold: 5 },
  guardian_save: { xp: 15, gold: 5 },
  mayor_tiebreak: { xp: 10, gold: 5 },
}

export interface VanaCampPlayerReward {
  player_id: string
  user_id: string | null
  display_name: string
  is_bot: boolean
  xp: number
  gold: number
  reasons: string[]
}

interface SessionRewardSummary {
  rewards: VanaCampPlayerReward[]
  already_awarded: boolean
  winner_side: VanaCampSide | null
}

async function computeRewards(sessionId: string): Promise<SessionRewardSummary> {
  const service = createServiceClient()

  const { data: session } = await service
    .from('vanacamp_sessions')
    .select('winner_side, rewards_awarded')
    .eq('id', sessionId)
    .single()
  if (!session) throw new Error('Sessão não encontrada.')

  const { data: players } = await service
    .from('vanacamp_players')
    .select('id, user_id, display_name, role, is_alive, is_mayor, is_bot')
    .eq('session_id', sessionId)

  const { data: nightActions } = await service
    .from('vanacamp_night_actions')
    .select('*')
    .eq('session_id', sessionId)

  const { data: events } = await service
    .from('vanacamp_events')
    .select('*')
    .eq('session_id', sessionId)
    .in('event_type', ['save', 'vote_tally'])

  const winnerSide = session.winner_side as VanaCampSide | null

  const rewards: VanaCampPlayerReward[] = (players ?? []).map((p) => {
    const reward: VanaCampPlayerReward = {
      player_id: p.id,
      user_id: p.user_id,
      display_name: p.display_name,
      is_bot: p.is_bot,
      xp: 0,
      gold: 0,
      reasons: [],
    }
    if (!p.role) return reward

    const playerSide: VanaCampSide = p.role === 'infiltrator' ? 'infiltrators' : 'desbravadores'
    if (winnerSide && playerSide === winnerSide) {
      reward.xp += REWARDS.winning_side.xp
      reward.gold += REWARDS.winning_side.gold
      reward.reasons.push(`Lado vencedor (+${REWARDS.winning_side.xp} XP, +${REWARDS.winning_side.gold} gold)`)
    }
    if (p.is_alive) {
      reward.xp += REWARDS.survived.xp
      reward.gold += REWARDS.survived.gold
      reward.reasons.push(`Sobreviveu (+${REWARDS.survived.xp} XP, +${REWARDS.survived.gold} gold)`)
    }
    if (p.role === 'seer') {
      const correctIds = (nightActions ?? []).filter(
        (a) => a.phase === 'seer' && a.actor_player_id === p.id && a.result === 'infiltrado',
      ).length
      if (correctIds > 0) {
        const xp = correctIds * REWARDS.seer_correct.xp
        const gold = correctIds * REWARDS.seer_correct.gold
        reward.xp += xp; reward.gold += gold
        reward.reasons.push(`Identificou ${correctIds} infiltrado(s) (+${xp} XP, +${gold} gold)`)
      }
    }
    if (p.role === 'guardian') {
      const guardianActions = (nightActions ?? []).filter(
        (a) => a.phase === 'guardian' && a.actor_player_id === p.id,
      )
      // Só conta para o Conselheiro que protegeu mesmo o alvo dessa noite
      // (pode haver mais de um Conselheiro numa distribuição personalizada).
      const saves = guardianActions.filter((ga) => {
        const hadSave = (events ?? []).some((e) => e.event_type === 'save' && e.day_number === ga.day_number)
        if (!hadSave) return false
        const night = resolveNight(
          (nightActions ?? []).filter((a) => a.day_number === ga.day_number) as never,
        )
        return night.saved && night.sabotage_target_id === ga.target_player_id
      }).length
      if (saves > 0) {
        const xp = saves * REWARDS.guardian_save.xp
        const gold = saves * REWARDS.guardian_save.gold
        reward.xp += xp; reward.gold += gold
        reward.reasons.push(`Salvou ${saves} desbravador(es) (+${xp} XP, +${gold} gold)`)
      }
    }
    if (p.is_mayor) {
      // Por dia (um apuramento repetido não conta duas vezes).
      const tiebreaks = new Set(
        (events ?? [])
          .filter(
            (e) => e.event_type === 'vote_tally' && (e.payload as { mayor_tiebreak_used?: boolean })?.mayor_tiebreak_used,
          )
          .map((e) => e.day_number),
      ).size
      if (tiebreaks > 0) {
        const xp = tiebreaks * REWARDS.mayor_tiebreak.xp
        const gold = tiebreaks * REWARDS.mayor_tiebreak.gold
        reward.xp += xp; reward.gold += gold
        reward.reasons.push(`Desempate do Diretor ${tiebreaks}× (+${xp} XP, +${gold} gold)`)
      }
    }
    return reward
  })

  return { rewards, already_awarded: !!session.rewards_awarded, winner_side: winnerSide }
}

/** True se o utilizador é coordenador/dirigente (admin do clube). */
async function userIsClubAdmin(userId: string): Promise<boolean> {
  const service = createServiceClient()
  const { data } = await service.from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role === 'coordenador' || data?.role === 'dirigente'
}

export async function previewRewards(sessionId: string): Promise<SessionRewardSummary & { error?: string }> {
  try {
    const { user } = await requireUser()
    const service = createServiceClient()
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('host_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session) return { error: 'Sessão não encontrada.', rewards: [], already_awarded: false, winner_side: null }
    const allowed = session.host_id === user.id || (await userIsClubAdmin(user.id))
    if (!allowed) return { error: 'Sem permissão.', rewards: [], already_awarded: false, winner_side: null }
    return await computeRewards(sessionId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro.', rewards: [], already_awarded: false, winner_side: null }
  }
}

/**
 * Dados para o cartão de vitória partilhável (logo + equipa vencedora).
 * Devolve os jogadores do lado que ganhou, com avatar e quem foi Diretor.
 */
export async function getVictoryCardData(sessionId: string): Promise<{
  winner_side?: VanaCampSide | null
  winners?: { id: string; display_name: string; avatar_url: string | null; is_mayor: boolean }[]
  error?: string
}> {
  try {
    const { user } = await requireUser()
    const service = createServiceClient()
    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('host_id, winner_side, status')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session) return { error: 'Sessão não encontrada.' }
    const allowed = session.host_id === user.id || (await userIsClubAdmin(user.id))
    if (!allowed) return { error: 'Sem permissão.' }
    if (session.status !== 'finished' || !session.winner_side) return { winner_side: null, winners: [] }

    const winSide = session.winner_side as VanaCampSide
    const { data: players } = await service
      .from('vanacamp_players')
      .select('id, user_id, display_name, role, is_mayor')
      .eq('session_id', sessionId)

    const winners = (players ?? []).filter((p) => {
      if (!p.role) return false
      return winSide === 'infiltrators' ? p.role === 'infiltrator' : p.role !== 'infiltrator'
    })

    // Avatares dos perfis (bots não têm user_id → sem avatar)
    const userIds = winners.map((w) => w.user_id).filter((x): x is string => !!x)
    let avatarByUser = new Map<string, string | null>()
    if (userIds.length > 0) {
      const { data: profiles } = await service
        .from('profiles')
        .select('id, avatar_url')
        .in('id', userIds)
      avatarByUser = new Map((profiles ?? []).map((p) => [p.id, p.avatar_url ?? null]))
    }

    const result = winners
      .map((w) => ({
        id: w.id,
        display_name: w.display_name,
        avatar_url: w.user_id ? (avatarByUser.get(w.user_id) ?? null) : null,
        is_mayor: w.is_mayor,
      }))
      .sort((a, b) => (b.is_mayor ? 1 : 0) - (a.is_mayor ? 1 : 0) || a.display_name.localeCompare(b.display_name))

    return { winner_side: winSide, winners: result }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

export async function awardRewards(sessionId: string): Promise<{
  ok?: boolean
  error?: string
  awarded?: number
  skipped_bots?: number
}> {
  try {
    const { user } = await requireUser()
    const service = createServiceClient()

    const { data: session } = await service
      .from('vanacamp_sessions')
      .select('host_id, rewards_awarded, status')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session) return { error: 'Sessão não encontrada.' }
    const allowed = session.host_id === user.id || (await userIsClubAdmin(user.id))
    if (!allowed) return { error: 'Apenas o Narrador ou um administrador podem atribuir prémios.' }
    if (session.status !== 'finished') return { error: 'O jogo ainda não terminou.' }
    if (session.rewards_awarded) return { error: 'Os prémios já foram atribuídos a esta sessão.' }

    const summary = await computeRewards(sessionId)

    // Tranca primeiro: só o pedido que muda rewards_awarded de false para true
    // dá os pontos (dois toques seguidos não os dão a dobrar).
    const { data: claimed } = await service
      .from('vanacamp_sessions')
      .update({ rewards_awarded: true })
      .eq('id', sessionId)
      .eq('rewards_awarded', false)
      .select('id')
    if (!claimed || claimed.length === 0) {
      return { error: 'Os prémios já foram atribuídos a esta sessão.' }
    }

    let awarded = 0
    let skipped = 0

    for (const r of summary.rewards) {
      if (r.is_bot || !r.user_id) { skipped++; continue }
      if (r.xp === 0 && r.gold === 0) continue
      const description = `VanaCamp — ${r.reasons.join(' · ')}`
      const { error } = await service.from('points_log').insert({
        target_user_id: r.user_id,
        awarded_by_user_id: user.id,
        amount_xp: r.xp,
        amount_gold: r.gold,
        description,
      })
      if (error) {
        console.error('[vana-camp] award error', error, r)
        continue
      }
      awarded++
    }

    revalidatePath(`/jogos/vana-camp/${sessionId}`)
    return { ok: true, awarded, skipped_bots: skipped }
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}

// ────────────────────────────────────────────────────────────────────
// CHAT (infiltrados / dead / lobby / day)
// ────────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  sessionId: string,
  channel: 'lobby' | 'infiltrators' | 'day' | 'dead',
  content: string,
  actAsPlayerId?: string,
): Promise<{ error?: string }> {
  try {
    if (!['lobby', 'infiltrators', 'day', 'dead'].includes(channel)) return { error: 'Canal inválido.' }
    const trimmed = String(content ?? '').trim().slice(0, 500)
    if (!trimmed) return { error: 'Mensagem vazia.' }

    const { user } = await requireUser()
    const actor = await resolveActorPlayerId(sessionId, user.id, actAsPlayerId)
    if ('error' in actor) return { error: actor.error }

    // Verificações por canal
    if (channel === 'infiltrators' && (actor.role !== 'infiltrator' || !actor.is_alive)) {
      return { error: 'Canal restrito a infiltrados vivos.' }
    }
    if (channel === 'day' && !actor.is_alive) {
      return { error: 'Já estás em casa — não podes falar na assembleia.' }
    }
    if (channel === 'dead' && actor.is_alive) {
      return { error: 'Canal restrito a quem já foi para casa.' }
    }

    const service = createServiceClient()
    const { error } = await service.from('vanacamp_messages').insert({
      session_id: sessionId,
      channel,
      sender_player_id: actor.player_id,
      content: trimmed,
    })
    if (error) return { error: error.message }
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Erro.' } }
}
