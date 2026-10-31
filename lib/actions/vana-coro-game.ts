'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveRole } from '@/utils/permissions'
import { gameUnavailableError } from '@/utils/game-access'
import { shortDisplayName } from '@/utils/display-name'
import { normalizarAlcunha } from '@/utils/vana-sentinela/game'
import {
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  applyEvent,
  playerReward,
  replayRound,
  roundMultiplier,
  type BoardEntryRef,
  type RoundEvent,
  type RoundState,
  type Team,
} from '@/utils/vana-coro/scoring'
import { MIN_BOARD_GROUPS } from '@/utils/vana-coro/board'
import type {
  VanaCoroHostRound,
  VanaCoroPlayer,
  VanaCoroPublicRound,
  VanaCoroReadyQuestion,
  VanaCoroSession,
} from '@/types/vana-coro'

// Jogo ao vivo do VanaCoro (§3, §7.3). Anfitrião = dirigente ou coordenador
// (cargo efetivo). Todas as escritas pela service role, depois de validar quem pede.
//
// O estado de cada ronda é recalculado a partir do registo de ações
// (vanacoro_round_events) com utils/vana-coro/scoring.ts e gravado de uma vez pela
// função vanacoro_save_round, que sobe board_version. Os ecrãs veem a subida por
// realtime e voltam a pedir o quadro (getPublicRound / getHostRound).

const GAME_ID = 'vana-coro'
const SESSIONS = 'vanacoro_sessions'
const PLAYERS = 'vanacoro_players'
const ROUNDS = 'vanacoro_rounds'
const EVENTS = 'vanacoro_round_events'
const ENTRIES = 'vanacoro_board_entries'
const QUESTIONS = 'vanacoro_questions'

type Service = ReturnType<typeof createServiceClient>
export type GameResult = { error?: string }

const BOT_NAMES = ['Bot Leão', 'Bot Águia', 'Bot Lobo', 'Bot Raposa', 'Bot Urso', 'Bot Falcão', 'Bot Lince', 'Bot Mocho']

// ── Guardas ───────────────────────────────────────────────────

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function requireHostRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role, helper_role').eq('id', user.id).maybeSingle()
  const role = effectiveRole(profile)
  return role === 'dirigente' || role === 'coordenador' ? { userId: user.id, service: createServiceClient() } : null
}

async function requireSessionHost(sessionId: string) {
  const userId = await currentUserId()
  if (!userId) return null
  const service = createServiceClient()
  const { data } = await service.from(SESSIONS).select('*').eq('id', sessionId).maybeSingle()
  if (!data || data.host_id !== userId) return null
  return { userId, service, session: data as VanaCoroSession }
}

const NOT_HOST = { error: 'Só o anfitrião desta sessão pode fazer isto.' }
const LATE = 'O jogo já começou e as equipas estão fechadas. Fica a ver no projetor!'

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  let out = ''
  for (const b of crypto.getRandomValues(new Uint8Array(4))) out += alphabet[b % alphabet.length]
  return out
}

function cleanTeamName(name: string, fallback: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 24) || fallback
}

// ── Sessão e lobby ────────────────────────────────────────────

export async function createCoroSession(isTest: boolean): Promise<{ id?: string; error?: string }> {
  const ctx = await requireHostRole()
  if (!ctx) return { error: 'Só dirigentes e coordenadores podem criar um jogo.' }
  const unavailable = await gameUnavailableError(GAME_ID)
  if (unavailable) return { error: unavailable }

  // Por omissão: as perguntas prontas mais antigas que ainda não foram jogadas.
  const { data: ready } = await ctx.service
    .from(QUESTIONS)
    .select('id')
    .eq('review_status', 'ready')
    .is('used_at', null)
    .order('ready_at', { ascending: true })
    .limit(DEFAULT_ROUNDS)

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await ctx.service
      .from(SESSIONS)
      .insert({
        code: generateCode(),
        host_id: ctx.userId,
        is_test_session: isTest,
        question_ids: (ready ?? []).map((q) => q.id),
      })
      .select('id')
      .single()
    if (!error && data) return { id: data.id }
    if (error?.code !== '23505') {
      console.error('VanaCoro: erro a criar sessão', error)
      return { error: 'Não foi possível criar a sessão.' }
    }
  }
  return { error: 'Não foi possível arranjar um código livre. Tenta outra vez.' }
}

/** Perguntas prontas para o anfitrião escolher (as já jogadas vêm marcadas). */
export async function listReadyQuestions(): Promise<VanaCoroReadyQuestion[]> {
  const ctx = await requireHostRole()
  if (!ctx) return []
  const { data } = await ctx.service
    .from(QUESTIONS)
    .select('id, prompt, ready_at, used_at, vanacoro_board_entries(count)')
    .eq('review_status', 'ready')
    .order('ready_at', { ascending: true })
  return (data ?? []).map((q) => ({
    id: q.id,
    prompt: q.prompt,
    ready_at: q.ready_at,
    used_at: q.used_at,
    entries: (q.vanacoro_board_entries as unknown as { count: number }[])?.[0]?.count ?? 0,
  }))
}

export async function updateLobby(
  sessionId: string,
  input: { teamAName: string; teamBName: string; questionIds: string[] },
): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  if (ctx.session.status !== 'lobby') return { error: 'O jogo já começou.' }
  const ids = [...new Set(input.questionIds)]
  if (ids.length > MAX_ROUNDS) return { error: `No máximo ${MAX_ROUNDS} rondas.` }

  const { error } = await ctx.service
    .from(SESSIONS)
    .update({
      team_a_name: cleanTeamName(input.teamAName, 'Equipa A'),
      team_b_name: cleanTeamName(input.teamBName, 'Equipa B'),
      question_ids: ids,
    })
    .eq('id', sessionId)
  return error ? { error: 'Não foi possível guardar.' } : {}
}

/** Cada equipa com jogadores fica com um capitão (por omissão, o primeiro a entrar). */
async function ensureCaptains(service: Service, sessionId: string) {
  const { data } = await service
    .from(PLAYERS)
    .select('id, team, is_captain')
    .eq('session_id', sessionId)
    .order('joined_at')
  const players = data ?? []
  for (const team of ['a', 'b'] as const) {
    const inTeam = players.filter((p) => p.team === team)
    if (inTeam.length && !inTeam.some((p) => p.is_captain)) {
      await service.from(PLAYERS).update({ is_captain: true }).eq('id', inTeam[0].id)
    }
  }
}

export async function joinCoroSession(input: {
  code: string
  team: Team
  guestName?: string
}): Promise<{ playerId?: string; sessionId?: string; error?: string }> {
  const unavailable = await gameUnavailableError(GAME_ID)
  if (unavailable) return { error: unavailable }
  if (input.team !== 'a' && input.team !== 'b') return { error: 'Escolhe uma equipa.' }

  const service = createServiceClient()
  const { data: session } = await service
    .from(SESSIONS)
    .select('id, status')
    .eq('code', input.code.trim().toUpperCase())
    .neq('status', 'finished')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!session) return { error: 'Código inválido ou o jogo já acabou.' }

  const userId = await currentUserId()
  let row: Record<string, unknown>
  if (userId) {
    const { data: profile } = await service.from('profiles').select('full_name, avatar_url').eq('id', userId).maybeSingle()
    if (!profile) return { error: 'Conta sem perfil do clube.' }
    const { data: existing } = await service
      .from(PLAYERS)
      .select('id, team')
      .eq('session_id', session.id)
      .eq('profile_id', userId)
      .maybeSingle()
    if (existing) {
      // Já estava: no lobby pode trocar de equipa; a meio do jogo fica onde estava.
      if (session.status === 'lobby' && existing.team !== input.team) {
        await service.from(PLAYERS).update({ team: input.team, is_captain: false }).eq('id', existing.id)
        await ensureCaptains(service, session.id)
      }
      return { playerId: existing.id, sessionId: session.id }
    }
    if (session.status !== 'lobby') return { error: LATE }
    row = { profile_id: userId, display_name: shortDisplayName(profile.full_name), avatar_url: profile.avatar_url }
  } else {
    // As equipas fecham quando o jogo começa: quem chega tarde já não entra.
    if (session.status !== 'lobby') return { error: LATE }
    const name = normalizarAlcunha(input.guestName)
    if (!name) return { error: 'Escreve o teu nome (2 a 20 letras).' }
    row = { guest_name: name, display_name: name }
  }

  const { data: player, error } = await service
    .from(PLAYERS)
    .insert({ ...row, session_id: session.id, team: input.team })
    .select('id')
    .single()
  if (error || !player) {
    console.error('VanaCoro: erro a entrar', error)
    return { error: 'Não foi possível entrar. Tenta outra vez.' }
  }
  await ensureCaptains(service, session.id)
  return { playerId: player.id, sessionId: session.id }
}

export async function setPlayerTeam(sessionId: string, playerId: string, team: Team): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  const { error } = await ctx.service
    .from(PLAYERS)
    .update({ team, is_captain: false })
    .eq('id', playerId)
    .eq('session_id', sessionId)
  if (error) return { error: 'Não foi possível mudar de equipa.' }
  await ensureCaptains(ctx.service, sessionId)
  return {}
}

export async function setCaptain(sessionId: string, playerId: string): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  const { data: player } = await ctx.service.from(PLAYERS).select('team').eq('id', playerId).eq('session_id', sessionId).maybeSingle()
  if (!player?.team) return { error: 'O jogador não tem equipa.' }
  await ctx.service.from(PLAYERS).update({ is_captain: false }).eq('session_id', sessionId).eq('team', player.team)
  await ctx.service.from(PLAYERS).update({ is_captain: true }).eq('id', playerId)
  return {}
}

export async function removePlayer(sessionId: string, playerId: string): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  await ctx.service.from(PLAYERS).delete().eq('id', playerId).eq('session_id', sessionId)
  await ensureCaptains(ctx.service, sessionId)
  return {}
}

/** Sessões de teste: bots alternados pelas duas equipas. */
export async function addBots(sessionId: string, count = 4): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  if (!ctx.session.is_test_session) return { error: 'Só em sessões de teste.' }
  const { data: existing } = await ctx.service.from(PLAYERS).select('display_name').eq('session_id', sessionId).eq('is_bot', true)
  const used = new Set((existing ?? []).map((p) => p.display_name))
  const names = BOT_NAMES.filter((n) => !used.has(n)).slice(0, count)
  if (!names.length) return { error: 'Já há bots que cheguem.' }
  await ctx.service.from(PLAYERS).insert(
    names.map((display_name, i) => ({
      session_id: sessionId,
      display_name,
      is_bot: true,
      team: (used.size + i) % 2 === 0 ? 'a' : 'b',
    })),
  )
  await ensureCaptains(ctx.service, sessionId)
  return {}
}

export async function deleteCoroSession(sessionId: string): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  const { error } = await ctx.service.from(SESSIONS).delete().eq('id', sessionId)
  return error ? { error: 'Não foi possível apagar.' } : {}
}

// ── Começar ───────────────────────────────────────────────────

const RESET_ROUND = {
  phase: 'intro',
  buzzed_team: null,
  control_team: null,
  strikes: 0,
  strike_seq: 0,
  round_pot: 0,
  round_winner: null,
  round_banked: 0,
  faceoff_turn: null,
  faceoff_first_team: null,
  faceoff_first_rank: null,
} as const

export async function startCoroGame(sessionId: string): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  const { session, service } = ctx
  if (session.status !== 'lobby') return { error: 'O jogo já começou.' }

  const ids = session.question_ids
  if (ids.length < MIN_ROUNDS || ids.length > MAX_ROUNDS) {
    return { error: `Escolhe entre ${MIN_ROUNDS} e ${MAX_ROUNDS} perguntas.` }
  }
  const { data: questions } = await service
    .from(QUESTIONS)
    .select('id, review_status, vanacoro_board_entries(count)')
    .in('id', ids)
  const ok = (questions ?? []).filter(
    (q) =>
      q.review_status === 'ready' &&
      ((q.vanacoro_board_entries as unknown as { count: number }[])?.[0]?.count ?? 0) >= MIN_BOARD_GROUPS,
  )
  if (ok.length !== ids.length) return { error: 'Há perguntas escolhidas que já não estão prontas. Revê a lista.' }

  await service.from(ROUNDS).delete().eq('session_id', sessionId)
  const { error: roundsError } = await service.from(ROUNDS).insert(
    ids.map((questionId, i) => ({
      session_id: sessionId,
      question_id: questionId,
      round_number: i + 1,
      multiplier: roundMultiplier(i + 1, ids.length),
    })),
  )
  if (roundsError) return { error: 'Não foi possível preparar as rondas.' }

  await ensureCaptains(service, sessionId)
  const { error } = await service
    .from(SESSIONS)
    .update({
      ...RESET_ROUND,
      status: 'playing',
      current_round: 1,
      total_rounds: ids.length,
      team_a_score: 0,
      team_b_score: 0,
      started_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('status', 'lobby')
  if (error) return { error: 'Não foi possível começar.' }
  await service.rpc('vanacoro_bump', { p_session_id: sessionId })
  return {}
}

// ── Rondas: registo de ações e recálculo ──────────────────────

interface LoadedRound {
  round: { id: string; question_id: string; round_number: number; multiplier: number }
  board: (BoardEntryRef & { label: string; emoji: string | null; respondents: number })[]
  events: { id: number; event: RoundEvent }[]
}

function toEvent(row: { kind: string; payload: Record<string, unknown> }): RoundEvent {
  const p = row.payload ?? {}
  switch (row.kind) {
    case 'buzz':
    case 'control':
      return { kind: row.kind, team: p.team as Team }
    case 'reveal':
      return { kind: 'reveal', entryId: String(p.entryId) }
    case 'steal_result':
      return { kind: 'steal_result', success: !!p.success, entryId: p.entryId ? String(p.entryId) : undefined }
    default:
      return { kind: row.kind as 'start' | 'strike' | 'finish' }
  }
}

function payloadOf(event: RoundEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...event }
  delete payload.kind
  return payload
}

async function loadRound(service: Service, sessionId: string, roundNumber: number): Promise<LoadedRound | null> {
  const { data: round } = await service
    .from(ROUNDS)
    .select('id, question_id, round_number, multiplier')
    .eq('session_id', sessionId)
    .eq('round_number', roundNumber)
    .maybeSingle()
  if (!round) return null
  const [{ data: entries }, { data: events }] = await Promise.all([
    service.from(ENTRIES).select('id, rank, label, emoji, points, respondents').eq('question_id', round.question_id).order('rank'),
    service.from(EVENTS).select('id, kind, payload').eq('round_id', round.id).eq('undone', false).order('id'),
  ])
  return {
    round,
    board: (entries ?? []) as LoadedRound['board'],
    events: (events ?? []).map((e) => ({ id: e.id as number, event: toEvent(e) })),
  }
}

function stateOf(loaded: LoadedRound): RoundState {
  return replayRound(loaded.events.map((e) => e.event), loaded.board, loaded.round.multiplier)
}

/** Recalcula a ronda atual a partir do registo e grava (tenta outra vez se entrou outra ação entretanto). */
async function recompute(service: Service, sessionId: string, roundNumber: number): Promise<GameResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadRound(service, sessionId, roundNumber)
    if (!loaded) return { error: 'Ronda não encontrada.' }
    const state = stateOf(loaded)
    const { error } = await service.rpc('vanacoro_save_round', {
      p_session_id: sessionId,
      p_round_id: loaded.round.id,
      p_last_event_id: loaded.events.at(-1)?.id ?? 0,
      p_state: {
        phase: state.phase,
        buzzed_team: state.buzzedTeam,
        control_team: state.controlTeam,
        strikes: state.strikes,
        strike_seq: state.strikeSeq,
        pot: state.pot,
        winner: state.winner,
        banked: state.banked,
        faceoff_turn: state.turn,
        faceoff_first_team: state.first?.team ?? null,
        faceoff_first_rank: state.first?.rank ?? null,
        reveals: Object.entries(state.revealed).map(([entry_id, r]) => ({ entry_id, scored: r.scored })),
      },
    })
    if (!error) return {}
    if (!error.message.includes('stale')) {
      console.error('VanaCoro: erro a gravar a ronda', error)
      return { error: 'Não foi possível gravar.' }
    }
  }
  return { error: 'Muitas ações ao mesmo tempo. Tenta outra vez.' }
}

async function appendAndRecompute(service: Service, session: VanaCoroSession, event: RoundEvent): Promise<GameResult> {
  if (session.status !== 'playing') return { error: 'O jogo não está a decorrer.' }
  const loaded = await loadRound(service, session.id, session.current_round)
  if (!loaded) return { error: 'Ronda não encontrada.' }
  const check = applyEvent(stateOf(loaded), event, loaded.board, loaded.round.multiplier)
  if (typeof check === 'string') return { error: check }

  const { error } = await service.from(EVENTS).insert({ round_id: loaded.round.id, kind: event.kind, payload: payloadOf(event) })
  if (error) return { error: 'Não foi possível gravar.' }
  return recompute(service, session.id, session.current_round)
}

/**
 * Ação do anfitrião na ronda atual: começar o duelo, revelar, ❌, controlo, roubo,
 * fechar. Um 'buzz' do anfitrião é o "responde primeiro" de quando não há telemóveis.
 */
export async function coroHostEvent(sessionId: string, event: RoundEvent): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  return appendAndRecompute(ctx.service, ctx.session, event)
}

/** "Já sei!" de um capitão no duelo. O primeiro toque ganha (transição condicional). */
export async function buzz(sessionId: string, playerId: string): Promise<{ first?: boolean; error?: string }> {
  const service = createServiceClient()
  const [{ data: session }, { data: player }] = await Promise.all([
    service.from(SESSIONS).select('*').eq('id', sessionId).maybeSingle(),
    service.from(PLAYERS).select('*').eq('id', playerId).eq('session_id', sessionId).maybeSingle(),
  ])
  if (!session || !player) return { error: 'Jogador não encontrado.' }
  const s = session as VanaCoroSession
  const p = player as VanaCoroPlayer
  if (!p.team || !p.is_captain) return { error: 'Só os capitães carregam no "Já sei!".' }

  // Quem pede: o próprio membro, um convidado com o id dele, ou o anfitrião a fazer de bot.
  const userId = await currentUserId()
  if (p.is_bot ? !(s.is_test_session && userId === s.host_id) : p.profile_id && p.profile_id !== userId) {
    return { error: 'Não autorizado.' }
  }

  const { data: won } = await service
    .from(SESSIONS)
    .update({ buzzed_team: p.team })
    .eq('id', sessionId)
    .eq('status', 'playing')
    .eq('phase', 'faceoff')
    .eq('current_round', s.current_round)
    .is('buzzed_team', null)
    .select('id')
  if (!won?.length) return { first: false }

  const loaded = await loadRound(service, sessionId, s.current_round)
  if (!loaded) return { error: 'Ronda não encontrada.' }
  await service.from(EVENTS).insert({ round_id: loaded.round.id, kind: 'buzz', payload: { team: p.team } })
  const result = await recompute(service, sessionId, s.current_round)
  return result.error ? result : { first: true }
}

export async function undoLast(sessionId: string): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  const { session, service } = ctx
  if (session.status !== 'playing') return { error: 'O jogo não está a decorrer.' }
  const loaded = await loadRound(service, sessionId, session.current_round)
  const last = loaded?.events.at(-1)
  if (!loaded || !last) return { error: 'Não há nada para desfazer nesta ronda.' }
  await service.from(EVENTS).update({ undone: true }).eq('id', last.id)
  return recompute(service, sessionId, session.current_round)
}

export async function nextRound(sessionId: string): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  const { session, service } = ctx
  if (session.status !== 'playing' || session.phase !== 'round_end') return { error: 'Fecha primeiro a ronda.' }
  if (session.current_round >= session.total_rounds) return finishCoroGame(sessionId)

  const { error } = await service
    .from(SESSIONS)
    .update({ ...RESET_ROUND, current_round: session.current_round + 1 })
    .eq('id', sessionId)
    .eq('current_round', session.current_round)
  if (error) return { error: 'Não foi possível passar à ronda seguinte.' }
  await service.rpc('vanacoro_bump', { p_session_id: sessionId })
  return {}
}

/** Fim do jogo. As perguntas jogadas ficam marcadas (exceto em sessões de teste). */
export async function finishCoroGame(sessionId: string): Promise<GameResult> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  const { session, service } = ctx
  if (session.status !== 'playing') return { error: 'O jogo não está a decorrer.' }

  const { error } = await service
    .from(SESSIONS)
    .update({ status: 'finished', phase: null, ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'playing')
  if (error) return { error: 'Não foi possível terminar.' }

  if (!session.is_test_session) {
    const { data: played } = await service.from(ROUNDS).select('question_id').eq('session_id', sessionId).not('winner_team', 'is', null)
    const ids = (played ?? []).map((r) => r.question_id)
    if (ids.length) {
      await service.from(QUESTIONS).update({ used_at: new Date().toISOString(), used_in_session_id: sessionId }).in('id', ids)
    }
  }
  await service.rpc('vanacoro_bump', { p_session_id: sessionId })
  return {}
}

// ── Prémios ───────────────────────────────────────────────────

/** XP e Gold para cada jogador (idempotente). Convidados: para quem escolheram. Bots: nunca. */
export async function awardCoroRewards(sessionId: string): Promise<{ awarded?: number; error?: string }> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx) return NOT_HOST
  const { session, service, userId } = ctx
  if (session.status !== 'finished') return { error: 'O jogo ainda não acabou.' }
  if (session.is_test_session) return { error: 'Sessão de teste: não há prémios.' }

  // Marca primeiro: dois cliques ao mesmo tempo não pagam a dobrar.
  const { data: claimed } = await service
    .from(SESSIONS)
    .update({ rewards_awarded_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('rewards_awarded_at', null)
    .select('id')
  if (!claimed?.length) return { error: 'Os prémios já foram atribuídos.' }

  const { data: players } = await service.from(PLAYERS).select('*').eq('session_id', sessionId)
  const scores = { a: session.team_a_score, b: session.team_b_score }
  const tie = scores.a === scores.b
  const rows = ((players ?? []) as VanaCoroPlayer[]).flatMap((p) => {
    if (p.is_bot || !p.team) return []
    const target = p.profile_id ?? p.rewards_recipient_id
    const reward = playerReward(p.team, scores)
    if (!target || !reward) return []
    const teamName = p.team === 'a' ? session.team_a_name : session.team_b_name
    const result = tie ? 'empate' : scores[p.team] > scores[p.team === 'a' ? 'b' : 'a'] ? 'vitória' : 'participação'
    return [{
      target_user_id: target,
      awarded_by_user_id: userId,
      amount_xp: reward.xp,
      amount_gold: reward.gold,
      description: `VanaCoro — ${result} (${teamName})${p.profile_id ? '' : ` (doado por ${p.display_name})`}`,
    }]
  })

  if (rows.length) {
    const { error } = await service.from('points_log').insert(rows)
    if (error) {
      console.error('VanaCoro: erro nos prémios', error)
      await service.from(SESSIONS).update({ rewards_awarded_at: null }).eq('id', sessionId)
      return { error: 'Não foi possível atribuir os prémios.' }
    }
  }
  return { awarded: rows.length }
}

async function guestPlayerOpen(service: Service, playerId: string) {
  const { data } = await service
    .from(PLAYERS)
    .select('id, profile_id, is_bot, vanacoro_sessions(rewards_awarded_at)')
    .eq('id', playerId)
    .maybeSingle()
  if (!data || data.profile_id || data.is_bot) return null
  const awarded = (data.vanacoro_sessions as unknown as { rewards_awarded_at: string | null } | null)?.rewards_awarded_at
  return awarded ? null : data
}

/** Convidado escolhe o desbravador que recebe os seus pontos. */
export async function setCoroRewardsRecipient(playerId: string, recipientId: string): Promise<GameResult> {
  const service = createServiceClient()
  if (!(await guestPlayerOpen(service, playerId))) return { error: 'Já não dá para escolher.' }
  const { data: recipient } = await service.from('profiles').select('id').eq('id', recipientId).eq('role', 'desbravador').maybeSingle()
  if (!recipient) return { error: 'Desbravador não encontrado.' }
  await service.from(PLAYERS).update({ rewards_recipient_id: recipientId, rewards_skipped: false }).eq('id', playerId)
  return {}
}

export async function skipCoroRewards(playerId: string): Promise<GameResult> {
  const service = createServiceClient()
  if (!(await guestPlayerOpen(service, playerId))) return { error: 'Já não dá para mudar.' }
  await service.from(PLAYERS).update({ rewards_recipient_id: null, rewards_skipped: true }).eq('id', playerId)
  return {}
}

// ── Quadro ────────────────────────────────────────────────────

async function revealedOf(service: Service, roundId: string) {
  const { data } = await service.from('vanacoro_reveals').select('board_entry_id, scored').eq('round_id', roundId)
  return new Map((data ?? []).map((r) => [r.board_entry_id as string, r.scored as boolean]))
}

/** O quadro da ronda atual como o vê toda a gente: só as respostas reveladas têm nome. */
export async function getPublicRound(sessionId: string): Promise<VanaCoroPublicRound | null> {
  const service = createServiceClient()
  const { data: session } = await service.from(SESSIONS).select('status, current_round, total_rounds').eq('id', sessionId).maybeSingle()
  if (!session || session.status !== 'playing') return null
  const loaded = await loadRound(service, sessionId, session.current_round)
  if (!loaded) return null
  const [{ data: question }, revealed] = await Promise.all([
    service.from(QUESTIONS).select('prompt').eq('id', loaded.round.question_id).maybeSingle(),
    revealedOf(service, loaded.round.id),
  ])
  return {
    roundNumber: loaded.round.round_number,
    totalRounds: session.total_rounds,
    multiplier: loaded.round.multiplier,
    prompt: question?.prompt ?? '',
    slots: loaded.board.map((e) =>
      revealed.has(e.id)
        ? { rank: e.rank, revealed: true, label: e.label, emoji: e.emoji, points: e.points, scored: revealed.get(e.id) }
        : { rank: e.rank, revealed: false },
    ),
  }
}

const EVENT_LABELS: Record<RoundEvent['kind'], string> = {
  start: 'Começar o duelo',
  buzz: '"Já sei!"',
  reveal: 'Revelar',
  strike: '❌',
  control: 'Dar o controlo',
  steal_result: 'Resultado do roubo',
  finish: 'Fechar a ronda',
}

/** O quadro completo da ronda atual, só para o anfitrião (com as respostas originais de cada grupo). */
export async function getHostRound(sessionId: string): Promise<VanaCoroHostRound | null> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx || ctx.session.status !== 'playing') return null
  const { service, session } = ctx
  const loaded = await loadRound(service, sessionId, session.current_round)
  if (!loaded) return null

  const [{ data: question }, revealed, { data: groups }] = await Promise.all([
    service.from(QUESTIONS).select('prompt').eq('id', loaded.round.question_id).maybeSingle(),
    revealedOf(service, loaded.round.id),
    service
      .from('vanacoro_groups')
      .select('label, vanacoro_answers(raw_text, hidden)')
      .eq('question_id', loaded.round.question_id)
      .eq('hidden', false),
  ])

  // O quadro é uma cópia congelada; as respostas vêm do grupo com o mesmo nome (se ainda existir).
  const textsByLabel = new Map<string, string[]>()
  for (const g of groups ?? []) {
    const answers = (g.vanacoro_answers as unknown as { raw_text: string; hidden: boolean }[]) ?? []
    textsByLabel.set(g.label.toLowerCase(), [...new Set(answers.filter((a) => !a.hidden).map((a) => a.raw_text))].slice(0, 30))
  }

  const last = loaded.events.at(-1)?.event
  const state = stateOf(loaded)
  return {
    roundId: loaded.round.id,
    roundNumber: loaded.round.round_number,
    totalRounds: session.total_rounds,
    multiplier: loaded.round.multiplier,
    prompt: question?.prompt ?? '',
    slots: loaded.board.map((e) => ({
      id: e.id,
      rank: e.rank,
      label: e.label,
      emoji: e.emoji,
      points: e.points,
      respondents: e.respondents,
      revealed: revealed.has(e.id),
      scored: revealed.get(e.id) ?? false,
      texts: textsByLabel.get(e.label.toLowerCase()) ?? [],
    })),
    canUndo: !!last,
    canPass: state.phase === 'playing' && state.strikes === 0 && state.playingReveals === 0,
    lastEvent: last
      ? last.kind === 'reveal'
        ? `Revelar «${loaded.board.find((e) => e.id === last.entryId)?.label ?? '?'}»`
        : EVENT_LABELS[last.kind]
      : null,
  }
}

/** O anfitrião a fazer de bot (só sessões de teste). */
export async function getBotForImpersonation(sessionId: string, playerId: string): Promise<VanaCoroPlayer | null> {
  const ctx = await requireSessionHost(sessionId)
  if (!ctx || !ctx.session.is_test_session) return null
  const { data } = await ctx.service.from(PLAYERS).select('*').eq('id', playerId).eq('session_id', sessionId).eq('is_bot', true).maybeSingle()
  return (data as VanaCoroPlayer) ?? null
}
