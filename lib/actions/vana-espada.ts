'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { gameUnavailableError } from '@/utils/game-access'
import { isAdminRole } from '@/utils/permissions'
import { generatePin } from '@/utils/pin'
import { getBook, isValidChapter } from '@/utils/bible-books'
import {
  DEFAULT_LOCATE_SECONDS,
  calcEspadaRewards,
  isValidVerse,
  pickRounds,
  scoreLocate,
} from '@/utils/vana-espada'
import type { EspadaDifficulty, EspadaGuess, LocateBreakdown } from '@/types/vana-espada'

// ── Guardas ────────────────────────────────────────────────────────

/** Utilizador autenticado, ou null. */
async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, helper_role, avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  return { user, profile }
}

/** Anfitrião = dirigente/coordenador (cargo efetivo, ajudantes incluídos). */
async function requireHost() {
  const me = await currentUser()
  if (!me) throw new Error('Não autorizado')
  if (!isAdminRole(me.profile)) throw new Error('Sem permissões')
  return me
}

/** Anfitrião DESTA sessão (ou coordenação). Usado nas ações que forçam transições. */
async function requireSessionHost(sessionId: string) {
  const me = await requireHost()
  const service = createServiceClient()
  const { data: session } = await service
    .from('vanaespada_sessions')
    .select('id, host_id, status, current_round, total_rounds')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) throw new Error('Sessão não encontrada')
  const isCoord = (me.profile?.helper_role || me.profile?.role) === 'coordenador'
  if (session.host_id !== me.user.id && !isCoord) throw new Error('Sem permissões')
  return { me, session, service }
}

// ── Criar sessão ───────────────────────────────────────────────────

export interface QuickSessionOptions {
  rounds: number
  difficulty: EspadaDifficulty | 'any'
  timeSeconds: number
}

/**
 * Sessão rápida do Modo A: sorteia N versículos com excerto e copia-os para
 * `vanaespada_session_rounds`. A partir daqui, editar o banco não afeta a sessão.
 */
export async function createQuickSession(
  options: QuickSessionOptions
): Promise<{ sessionId: string } | { error: string }> {
  const me = await requireHost()

  const unavailable = await gameUnavailableError('vana-espada')
  if (unavailable) return { error: unavailable }

  const rounds = clampInt(options.rounds, 1, 30, 10)
  const timeSeconds = clampInt(options.timeSeconds, 10, 180, DEFAULT_LOCATE_SECONDS)
  const difficulty = options.difficulty

  const service = createServiceClient()

  // O Modo A exige excerto: sem texto não há nada para mostrar no projetor.
  const { data: pool } = await service
    .from('vanaespada_verses')
    .select('id, book_id, chapter, verse_start, verse_end, excerpt, translation, difficulty')
    .eq('active', true)
    .not('excerpt', 'is', null)

  const usable = (pool ?? []).filter((v) => (v.excerpt ?? '').trim().length > 0)
  const eligible = difficulty === 'any' ? usable : usable.filter((v) => v.difficulty === difficulty)

  if (eligible.length === 0) {
    return { error: 'Não há versículos com excerto neste nível. Adiciona-os em Gestão → VanaEspada.' }
  }
  if (eligible.length < rounds) {
    return {
      error: `Só há ${eligible.length} versículo${eligible.length === 1 ? '' : 's'} com excerto neste nível — escolhe menos rondas ou adiciona mais versículos.`,
    }
  }

  // Evita repetir os versículos das últimas 3 sessões deste anfitrião.
  const { data: recentSessions } = await service
    .from('vanaespada_sessions')
    .select('id')
    .eq('host_id', me.user.id)
    .order('created_at', { ascending: false })
    .limit(3)

  let excludeVerseIds: string[] = []
  if (recentSessions?.length) {
    const { data: recentRounds } = await service
      .from('vanaespada_session_rounds')
      .select('verse_id')
      .in('session_id', recentSessions.map((s) => s.id))
    excludeVerseIds = (recentRounds ?? []).map((r) => r.verse_id).filter(Boolean) as string[]
  }

  const picked = pickRounds(
    eligible.map((v) => ({ ...v, difficulty: v.difficulty as EspadaDifficulty })),
    { count: rounds, difficulty, excludeVerseIds }
  )

  const pin = await reservePin(service)
  if (!pin) return { error: 'Não foi possível gerar um PIN livre. Tenta outra vez.' }

  const { data: session, error } = await service
    .from('vanaespada_sessions')
    .insert({
      host_id: me.user.id,
      pin,
      status: 'lobby',
      current_round: -1,
      total_rounds: picked.length,
      settings: { physical_bible_only: true },
    })
    .select('id')
    .single()

  if (error || !session) return { error: 'Não foi possível criar a sessão.' }

  const { error: roundsError } = await service.from('vanaespada_session_rounds').insert(
    picked.map((v, index) => ({
      session_id: session.id,
      round_index: index,
      kind: 'locate',
      verse_id: v.id,
      book_id: v.book_id,
      chapter: v.chapter,
      verse_start: v.verse_start,
      verse_end: v.verse_end,
      excerpt: v.excerpt,
      translation: v.translation,
      time_seconds: timeSeconds,
    }))
  )

  if (roundsError) {
    await service.from('vanaespada_sessions').delete().eq('id', session.id)
    return { error: 'Não foi possível preparar as rondas.' }
  }

  return { sessionId: session.id }
}

/** PIN livre entre as sessões que ainda não terminaram (o índice único garante o resto). */
async function reservePin(service: ReturnType<typeof createServiceClient>): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const pin = generatePin()
    const { data } = await service
      .from('vanaespada_sessions')
      .select('id')
      .eq('pin', pin)
      .neq('status', 'finished')
      .maybeSingle()
    if (!data) return pin
  }
  return null
}

// ── Entrar ─────────────────────────────────────────────────────────

export async function joinSession(
  pin: string,
  guestName: string | null,
  userId: string | null,
  clientAvatarUrl?: string | null
): Promise<{ playerId: string; sessionId: string } | { error: string }> {
  const unavailable = await gameUnavailableError('vana-espada')
  if (unavailable) return { error: unavailable }

  const service = createServiceClient()

  const { data: session } = await service
    .from('vanaespada_sessions')
    .select('id, status')
    .eq('pin', (pin || '').trim())
    .neq('status', 'finished')
    .maybeSingle()

  if (!session) return { error: 'PIN inválido ou sessão já terminada.' }

  const displayName = (guestName || '').trim().slice(0, 30) || 'Jogador'
  const isGuest = !userId

  let avatarUrl: string | null = clientAvatarUrl ?? null

  if (userId) {
    if (!avatarUrl) {
      const { data: profile } = await service
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .maybeSingle()
      avatarUrl = profile?.avatar_url || null
    }

    // Já estava nesta sessão (refresh, mudança de rede): volta ao mesmo jogador.
    const { data: existing } = await service
      .from('vanaespada_players')
      .select('id, avatar_url')
      .eq('session_id', session.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      if (!existing.avatar_url && avatarUrl) {
        await service.from('vanaespada_players').update({ avatar_url: avatarUrl }).eq('id', existing.id)
      }
      return { playerId: existing.id, sessionId: session.id }
    }
  }

  const { data: player, error } = await service
    .from('vanaespada_players')
    .insert({
      session_id: session.id,
      user_id: userId,
      is_guest: isGuest,
      display_name: displayName,
      avatar_url: avatarUrl,
    })
    .select('id')
    .single()

  if (error || !player) return { error: 'Não foi possível entrar na sessão.' }
  return { playerId: player.id, sessionId: session.id }
}

// ── Máquina de estados ─────────────────────────────────────────────

/** lobby → round_ready da ronda 0. */
export async function startGame(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const { session, service } = await requireSessionHost(sessionId)
  if (session.total_rounds < 1) return { ok: false, error: 'Esta sessão não tem rondas.' }

  const { data: players } = await service
    .from('vanaespada_players')
    .select('id')
    .eq('session_id', sessionId)
    .limit(1)
  if (!players?.length) return { ok: false, error: 'Ainda não entrou ninguém.' }

  await service.rpc('vanaespada_open_round', { p_session_id: sessionId, p_round_index: 0 })
  return { ok: true }
}

/**
 * round_ready → round_active. Pode ser pedida pelo painel do anfitrião ou pelo
 * projetor: a transição condicional garante que só arranca uma vez.
 */
export async function beginRound(sessionId: string, roundIndex: number): Promise<{ ok: boolean }> {
  const service = createServiceClient()
  const { data } = await service.rpc('vanaespada_begin_round', {
    p_session_id: sessionId,
    p_round_index: roundIndex,
    p_force: false,
  })
  return { ok: data === true }
}

/**
 * round_active → round_reveal.
 *
 * Qualquer ecrã pode pedir isto quando o cronómetro chega a zero, mas sem ser o
 * anfitrião só passa se o tempo tiver mesmo acabado (ou se já respondeu toda a
 * gente) — senão um espetador podia cortar rondas a meio.
 */
export async function closeRound(
  sessionId: string,
  roundIndex: number,
  force = false
): Promise<{ ok: boolean }> {
  if (force) await requireSessionHost(sessionId)

  const service = createServiceClient()
  const { data } = await service.rpc('vanaespada_close_round', {
    p_session_id: sessionId,
    p_round_index: roundIndex,
    p_force: force,
  })
  return { ok: data === true }
}

/** round_reveal → leaderboard. */
export async function showLeaderboard(sessionId: string): Promise<{ ok: boolean }> {
  const { service } = await requireSessionHost(sessionId)
  const { data } = await service.rpc('vanaespada_show_leaderboard', { p_session_id: sessionId })
  return { ok: data === true }
}

/** leaderboard → round_ready da ronda seguinte, ou → finished se era a última. */
export async function nextRound(sessionId: string): Promise<{ ok: boolean; finished?: boolean }> {
  const { session, service } = await requireSessionHost(sessionId)

  const next = session.current_round + 1
  if (next >= session.total_rounds) {
    await service.rpc('vanaespada_finish_session', { p_session_id: sessionId })
    return { ok: true, finished: true }
  }

  await service.rpc('vanaespada_open_round', { p_session_id: sessionId, p_round_index: next })
  return { ok: true }
}

/** Terminar já (botão do anfitrião). */
export async function finishSession(sessionId: string): Promise<{ ok: boolean }> {
  const { service } = await requireSessionHost(sessionId)
  await service.rpc('vanaespada_finish_session', { p_session_id: sessionId })
  return { ok: true }
}

// ── Responder ──────────────────────────────────────────────────────

export interface SubmitLocateResult {
  ok: boolean
  points?: number
  breakdown?: LocateBreakdown
  alreadyAnswered?: boolean
  error?: string
}

/**
 * Regra de ouro anti-batota:
 *   • o tempo é medido no SERVIDOR (now() − round.started_at);
 *   • a pontuação é calculada no servidor, o cliente nunca envia pontos;
 *   • a resposta certa nunca sai daqui antes da revelação;
 *   • UNIQUE (round_id, player_id) garante que repetir o pedido não duplica pontos.
 */
export async function submitLocate(
  sessionId: string,
  playerId: string,
  roundIndex: number,
  guess: EspadaGuess
): Promise<SubmitLocateResult> {
  const service = createServiceClient()

  const [{ data: session }, { data: round }, { data: player }] = await Promise.all([
    service
      .from('vanaespada_sessions')
      .select('id, status, current_round, phase_ends_at')
      .eq('id', sessionId)
      .maybeSingle(),
    service
      .from('vanaespada_session_rounds')
      .select('id, round_index, kind, book_id, chapter, verse_start, verse_end, time_seconds, started_at')
      .eq('session_id', sessionId)
      .eq('round_index', roundIndex)
      .maybeSingle(),
    service
      .from('vanaespada_players')
      .select('id, session_id')
      .eq('id', playerId)
      .maybeSingle(),
  ])

  if (!session || !round) return { ok: false, error: 'Ronda não encontrada.' }
  if (!player || player.session_id !== sessionId) return { ok: false, error: 'Jogador não encontrado.' }
  if (session.status !== 'round_active') return { ok: false, error: 'A ronda já não está a decorrer.' }
  if (session.current_round !== roundIndex) return { ok: false, error: 'Essa ronda já passou.' }
  if (round.kind !== 'locate') return { ok: false, error: 'Modo de ronda inesperado.' }

  // Idempotência: um clique duplo ou um retry depois de um timeout de rede devolve
  // exatamente o que ficou gravado da primeira vez.
  const { data: existing } = await service
    .from('vanaespada_answers')
    .select('points, breakdown')
    .eq('round_id', round.id)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing) {
    return {
      ok: false,
      alreadyAnswered: true,
      points: existing.points,
      breakdown: existing.breakdown as LocateBreakdown,
    }
  }

  const clean = sanitizeGuess(guess)
  if (!clean) return { ok: false, error: 'Palpite inválido.' }

  // 1,5 s de tolerância para a latência da rede.
  const endsAt = session.phase_ends_at ? new Date(session.phase_ends_at).getTime() : null
  if (endsAt && Date.now() > endsAt + 1500) {
    return { ok: false, error: 'Tempo esgotado.' }
  }

  const startedAt = round.started_at ? new Date(round.started_at).getTime() : Date.now()
  const limitMs = round.time_seconds * 1000
  const elapsedMs = Math.max(0, Math.min(Date.now() - startedAt, limitMs))

  const { points, breakdown } = scoreLocate(
    clean,
    {
      bookId: round.book_id,
      chapter: round.chapter,
      verseStart: round.verse_start,
      verseEnd: round.verse_end,
    },
    elapsedMs,
    limitMs
  )

  const isCorrect =
    clean.bookId === round.book_id &&
    clean.chapter === round.chapter &&
    clean.verse != null &&
    clean.verse >= round.verse_start &&
    clean.verse <= round.verse_end

  const { error: insertError } = await service.from('vanaespada_answers').insert({
    session_id: sessionId,
    round_id: round.id,
    player_id: playerId,
    guess_book: clean.bookId,
    guess_chapter: clean.chapter,
    guess_verse: clean.verse,
    elapsed_ms: elapsedMs,
    is_correct: isCorrect,
    points,
    breakdown,
    answered_at: new Date().toISOString(),
  })

  if (insertError) {
    // Corrida com outra submissão do mesmo jogador: trata como já respondido.
    const { data: dup } = await service
      .from('vanaespada_answers')
      .select('points, breakdown')
      .eq('round_id', round.id)
      .eq('player_id', playerId)
      .maybeSingle()
    if (dup) {
      return {
        ok: false,
        alreadyAnswered: true,
        points: dup.points,
        breakdown: dup.breakdown as LocateBreakdown,
      }
    }
    return { ok: false, error: 'Não foi possível registar a resposta.' }
  }

  // Atualiza o contador do projetor ("12/30") e fecha a ronda se já responderam todos.
  const { data: counts } = await service.rpc('vanaespada_sync_answered', {
    p_session_id: sessionId,
    p_round_index: roundIndex,
  })
  const row = Array.isArray(counts) ? counts[0] : counts
  if (row && row.players > 0 && row.answered >= row.players) {
    await service.rpc('vanaespada_close_round', {
      p_session_id: sessionId,
      p_round_index: roundIndex,
      p_force: false,
    })
  }

  return { ok: true, points, breakdown }
}

/** Valida o palpite contra a estrutura real da Bíblia. */
function sanitizeGuess(guess: EspadaGuess): EspadaGuess | null {
  const book = getBook(guess.bookId)
  if (!book) return null

  if (guess.chapter == null) return { bookId: book.id, chapter: null, verse: null }
  if (!isValidChapter(book.id, guess.chapter)) return null

  if (guess.verse == null) return { bookId: book.id, chapter: guess.chapter, verse: null }
  if (!isValidVerse(guess.verse)) return null

  return { bookId: book.id, chapter: guess.chapter, verse: guess.verse }
}

/**
 * A resposta do próprio jogador, para o telemóvel recuperar o ecrã certo depois
 * de um refresh. Durante a ronda só diz SE já respondeu — o palpite em si só sai
 * na revelação, para ninguém copiar o do vizinho.
 */
export async function getMyAnswer(
  sessionId: string,
  playerId: string,
  roundIndex: number
): Promise<{ answered: boolean; points?: number; breakdown?: LocateBreakdown }> {
  const service = createServiceClient()

  const { data: round } = await service
    .from('vanaespada_session_rounds')
    .select('id')
    .eq('session_id', sessionId)
    .eq('round_index', roundIndex)
    .maybeSingle()
  if (!round) return { answered: false }

  const { data: answer } = await service
    .from('vanaespada_answers')
    .select('points, breakdown')
    .eq('round_id', round.id)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!answer) return { answered: false }

  const { data: session } = await service
    .from('vanaespada_sessions')
    .select('status')
    .eq('id', sessionId)
    .maybeSingle()

  const revealed = ['round_reveal', 'leaderboard', 'finished'].includes(session?.status ?? '')
  if (!revealed) return { answered: true }

  return {
    answered: true,
    points: answer.points,
    breakdown: answer.breakdown as LocateBreakdown,
  }
}

// ── Gestão da sessão ───────────────────────────────────────────────

export async function kickPlayer(
  sessionId: string,
  playerId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { service } = await requireSessionHost(sessionId)
    await service.from('vanaespada_players').delete().eq('id', playerId).eq('session_id', sessionId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro' }
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { service } = await requireSessionHost(sessionId)
  await service.from('vanaespada_sessions').delete().eq('id', sessionId)
  revalidatePath('/admin/vana-espada')
}

export async function setRewardsRecipient(playerId: string, recipientId: string): Promise<void> {
  const service = createServiceClient()
  await service
    .from('vanaespada_players')
    .update({ rewards_recipient_id: recipientId, rewards_skipped: false })
    .eq('id', playerId)
    .eq('is_guest', true)
}

/** O convidado decide não dar os prémios a ninguém — fica registado para o anfitrião ver. */
export async function skipRewards(playerId: string): Promise<void> {
  const service = createServiceClient()
  await service
    .from('vanaespada_players')
    .update({ rewards_recipient_id: null, rewards_skipped: true })
    .eq('id', playerId)
    .eq('is_guest', true)
}

// ── Prémios ────────────────────────────────────────────────────────

/**
 * XP/Gold a partir dos pontos do jogo. Tranca PRIMEIRO (points_awarded_at) e só
 * depois escreve no points_log: dois cliques ao mesmo tempo não pagam duas vezes.
 */
export async function awardSessionPoints(
  sessionId: string
): Promise<{ ok: boolean; alreadyAwarded?: boolean; error?: string }> {
  const { me, service } = await requireSessionHost(sessionId)

  const { data: locked } = await service
    .from('vanaespada_sessions')
    .update({ points_awarded_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('points_awarded_at', null)
    .select('id')
    .maybeSingle()

  if (!locked) return { ok: true, alreadyAwarded: true }

  const { data: players } = await service
    .from('vanaespada_players')
    .select('id, user_id, is_guest, display_name, total_points, rewards_recipient_id')
    .eq('session_id', sessionId)

  if (!players?.length) return { ok: true }

  const topPoints = Math.max(0, ...players.map((p) => Number(p.total_points) || 0))

  for (const player of players) {
    const totalPoints = Number(player.total_points) || 0
    if (totalPoints <= 0) continue

    const targetUserId = player.is_guest ? player.rewards_recipient_id : player.user_id
    if (!targetUserId) continue

    const { gold, xp } = calcEspadaRewards(totalPoints, topPoints)
    if (gold <= 0 && xp <= 0) continue

    await service.from('points_log').insert({
      target_user_id: targetUserId,
      awarded_by_user_id: me.user.id,
      amount_xp: xp,
      amount_gold: gold,
      description: `VanaEspada — ${totalPoints} pts${player.is_guest ? ` (doado por ${player.display_name})` : ''}`,
    })
  }

  return { ok: true }
}

// ── Admin: banco de versículos ─────────────────────────────────────

export interface VerseInput {
  id?: string
  bookId: number
  chapter: number
  verseStart: number
  verseEnd: number
  excerpt: string
  translation: string
  difficulty: EspadaDifficulty
  tags: string[]
}

export async function upsertVerse(input: VerseInput): Promise<{ ok: boolean; error?: string }> {
  const me = await requireHost()
  const supabase = await createClient()

  const book = getBook(input.bookId)
  if (!book) return { ok: false, error: 'Livro inválido.' }
  if (!isValidChapter(book.id, input.chapter)) {
    return { ok: false, error: `${book.name} só tem ${book.chapters} capítulo${book.chapters === 1 ? '' : 's'}.` }
  }
  if (!isValidVerse(input.verseStart) || !isValidVerse(input.verseEnd)) {
    return { ok: false, error: 'Versículo inválido.' }
  }
  if (input.verseEnd < input.verseStart) {
    return { ok: false, error: 'O versículo final não pode ser anterior ao inicial.' }
  }

  const row = {
    book_id: book.id,
    chapter: input.chapter,
    verse_start: input.verseStart,
    verse_end: input.verseEnd,
    excerpt: input.excerpt.trim() || null,
    translation: input.translation.trim() || null,
    difficulty: input.difficulty,
    tags: input.tags.map((t) => t.trim()).filter(Boolean),
  }

  // RLS trata das permissões: só dirigente/coordenador escreve nesta tabela.
  const { error } = input.id
    ? await supabase.from('vanaespada_verses').update(row).eq('id', input.id)
    : await supabase.from('vanaespada_verses').insert({ ...row, created_by: me.user.id })

  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/vana-espada')
  return { ok: true }
}

export async function setVerseActive(verseId: string, active: boolean): Promise<void> {
  await requireHost()
  const supabase = await createClient()
  await supabase.from('vanaespada_verses').update({ active }).eq('id', verseId)
  revalidatePath('/admin/vana-espada')
}

export async function deleteVerse(verseId: string): Promise<void> {
  await requireHost()
  const supabase = await createClient()
  await supabase.from('vanaespada_verses').delete().eq('id', verseId)
  revalidatePath('/admin/vana-espada')
}

// ── Utilitários ────────────────────────────────────────────────────

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
