'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { isAdminRole } from '@/utils/permissions'
import { gameUnavailableError } from '@/utils/game-access'
import {
  lisbonDateString,
  stationOfDay,
  dailyTileAt,
  dailySpecialOf,
  applyTileEffect,
  tabuasSteps,
  deterministicOrder,
  optionPermutation,
  bonusProposedIndex,
  dailyRewards,
  DIFFICULTY_ORDER,
} from '@/utils/vana-trilha'
import {
  VANATRILHA_DAILY_LENGTH,
  VANATRILHA_DAILY_LIVES,
  VANATRILHA_STATIONS,
  getStation,
  type VanaTrilhaAnswerResult,
  type VanaTrilhaBonusPublic,
  type VanaTrilhaCategory,
  type VanaTrilhaDailyRun,
  type VanaTrilhaDifficulty,
  type VanaTrilhaHistoryEntry,
  type VanaTrilhaQuestionAdmin,
  type VanaTrilhaQuestionInput,
  type VanaTrilhaQuestionPublic,
  type VanaTrilhaRewards,
  type VanaTrilhaRunStatus,
  type VanaTrilhaStation,
  type VanaTrilhaStep,
  type VanaTrilhaTodayStats,
} from '@/types/vana-trilha'

// ────────────────────────────────────────────────────────────────────
// Tipos internos (linhas da BD — nunca saem do servidor tal como estão)
// ────────────────────────────────────────────────────────────────────

interface QuestionRow {
  id: string
  station: number
  category: VanaTrilhaCategory
  difficulty: VanaTrilhaDifficulty
  prompt: string
  options: string[]
  correct_index: number
  reference: string | null
  explanation: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface AnswerLogEntry {
  turn: number
  kind: 'question' | 'bonus'
  question_id: string
  chosen_index: number     // pergunta: índice ORIGINAL; bónus: 0 = Verdadeiro, 1 = Falso
  correct: boolean
  protected: boolean
  life_lost: boolean
  tile_triggered: boolean
  at: string
}

interface RunRow {
  id: string
  user_id: string
  run_date: string
  station: number
  question_ids: string[]
  reserve_ids: string[]
  current_question_id: string | null
  bonus_question_id: string | null
  bonus_pending: boolean
  current_index: number
  position: number
  lives: number
  correct_count: number
  mistakes: number
  turn: number
  immune_next_error: boolean
  bonus_gold: number
  answers: AnswerLogEntry[]
  status: VanaTrilhaRunStatus
  rewards_awarded: boolean
  started_at: string
  finished_at: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const QUESTION_COLUMNS =
  'id, station, category, difficulty, prompt, options, correct_index, reference, explanation, is_active, created_at, updated_at'

// ────────────────────────────────────────────────────────────────────
// Guardas
// ────────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Precisas de iniciar sessão para jogar.')
  return { supabase, user }
}

/** Dirigente/coordenador (inclui ajudantes — o mesmo critério de get_my_role() nas RLS). */
async function requireHost() {
  const { supabase, user } = await requireUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, helper_role')
    .eq('id', user.id)
    .maybeSingle()
  if (!isAdminRole(profile)) {
    throw new Error('Apenas dirigentes e coordenadores podem gerir o VanaTrilha.')
  }
  return { supabase, user }
}

function errorMessage(e: unknown, fallback = 'Ocorreu um erro inesperado.'): string {
  return e instanceof Error && e.message ? e.message : fallback
}

// ────────────────────────────────────────────────────────────────────
// Conversões para o cliente (sem respostas certas)
// ────────────────────────────────────────────────────────────────────

function toPublicRun(row: RunRow): VanaTrilhaDailyRun {
  const history: VanaTrilhaHistoryEntry[] = (row.answers ?? []).map((a) => ({
    kind: a.kind,
    correct: a.correct,
    ...(a.protected ? { protected: true } : {}),
  }))
  return {
    id: row.id,
    user_id: row.user_id,
    run_date: row.run_date,
    station: row.station,
    current_index: row.current_index,
    position: row.position,
    lives: row.lives,
    correct_count: row.correct_count,
    mistakes: row.mistakes,
    turn: row.turn,
    bonus_gold: row.bonus_gold,
    immune_next_error: row.immune_next_error,
    status: row.status,
    rewards_awarded: row.rewards_awarded,
    started_at: row.started_at,
    finished_at: row.finished_at,
    history,
  }
}

function toPublicQuestion(q: QuestionRow, runDate: string): VanaTrilhaQuestionPublic {
  const perm = optionPermutation(q.id, runDate, q.options.length)
  return {
    id: q.id,
    station: q.station,
    category: q.category,
    difficulty: q.difficulty,
    prompt: q.prompt,
    options: perm.map((orig) => q.options[orig]),
  }
}

function toPublicBonus(q: QuestionRow, runDate: string): VanaTrilhaBonusPublic {
  const proposed = bonusProposedIndex(q.id, runDate, q.correct_index)
  return {
    id: q.id,
    category: q.category,
    prompt: q.prompt,
    proposed_answer: q.options[proposed],
  }
}

async function fetchQuestions(ids: string[]): Promise<Map<string, QuestionRow>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, QuestionRow>()
  if (unique.length === 0) return map
  const service = createServiceClient()
  const { data, error } = await service.from('vanatrilha_questions').select(QUESTION_COLUMNS).in('id', unique)
  if (error) throw new Error(error.message)
  for (const q of (data ?? []) as QuestionRow[]) map.set(q.id, q)
  return map
}

/** O passo que o jogador tem à frente agora (pergunta normal ou bónus). */
async function currentStep(row: RunRow): Promise<VanaTrilhaStep | null> {
  if (row.status !== 'playing') return null
  const id = row.bonus_pending ? row.bonus_question_id : row.current_question_id
  if (!id) return null
  const q = (await fetchQuestions([id])).get(id)
  if (!q) return null
  return row.bonus_pending
    ? { kind: 'bonus', bonus: toPublicBonus(q, row.run_date) }
    : { kind: 'question', question: toPublicQuestion(q, row.run_date) }
}

async function fetchTodayRun(userId: string, runDate: string): Promise<RunRow | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('vanatrilha_daily_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('run_date', runDate)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as RunRow | null) ?? null
}

function rewardsFor(row: RunRow): VanaTrilhaRewards | null {
  if (row.status !== 'completed') return null
  return dailyRewards(row.status, row.mistakes, row.bonus_gold)
}

// ────────────────────────────────────────────────────────────────────
// Modo Diário
// ────────────────────────────────────────────────────────────────────

export interface VanaTrilhaDailyState {
  run: VanaTrilhaDailyRun | null
  station: VanaTrilhaStation
  current_step: VanaTrilhaStep | null
  already_played_today: boolean
  rewards: VanaTrilhaRewards | null
  error?: string
}

/**
 * Estado do desafio de hoje para o utilizador autenticado.
 * Se ainda não existir corrida, NÃO cria — devolve o convite para começar.
 */
export async function getDailyState(): Promise<VanaTrilhaDailyState> {
  const runDate = lisbonDateString()
  const station = getStation(stationOfDay(runDate))
  try {
    const { user } = await requireUser()
    const row = await fetchTodayRun(user.id, runDate)
    if (!row) {
      return { run: null, station, current_step: null, already_played_today: false, rewards: null }
    }

    // Etapa completa mas o prémio não ficou registado (ex.: ligação caiu): tenta de novo.
    if (row.status === 'completed' && !row.rewards_awarded) {
      const claim = await claimDailyRewards(row.id)
      if (claim.ok) row.rewards_awarded = true
    }

    return {
      run: toPublicRun(row),
      station: getStation(row.station),
      current_step: await currentStep(row),
      already_played_today: row.status !== 'playing',
      rewards: rewardsFor(row),
    }
  } catch (e) {
    return { run: null, station, current_step: null, already_played_today: false, rewards: null, error: errorMessage(e) }
  }
}

/**
 * Cria a corrida de hoje (idempotente: se já existir, devolve a existente).
 * As 8 perguntas vêm do RPC vanatrilha_daily_questions (iguais para todos).
 */
export async function startDailyRun(): Promise<{
  run?: VanaTrilhaDailyRun
  current_step?: VanaTrilhaStep | null
  error?: string
}> {
  try {
    const { user } = await requireUser()
    const unavailable = await gameUnavailableError('vana-trilha')
    if (unavailable) return { error: unavailable }

    const runDate = lisbonDateString()
    const station = stationOfDay(runDate)

    const existing = await fetchTodayRun(user.id, runDate)
    if (existing) return { run: toPublicRun(existing), current_step: await currentStep(existing) }

    const service = createServiceClient()

    const [{ data: picked, error: rpcError }, { data: pool, error: poolError }] = await Promise.all([
      service.rpc('vanatrilha_daily_questions', { p_date: runDate }),
      service.from('vanatrilha_questions').select('id, station, difficulty').eq('is_active', true),
    ])
    if (rpcError) throw new Error(rpcError.message)
    if (poolError) throw new Error(poolError.message)

    type Lite = { id: string; station: number; difficulty: VanaTrilhaDifficulty }
    const all = (pool ?? []) as Lite[]
    const main: Lite[] = ((picked ?? []) as QuestionRow[]).map((q) => ({
      id: q.id,
      station: q.station,
      difficulty: q.difficulty,
    }))

    const used = new Set(main.map((q) => q.id))
    const stationRest = deterministicOrder(all.filter((q) => q.station === station && !used.has(q.id)), runDate)
    const otherStations = deterministicOrder(all.filter((q) => q.station !== station), runDate)

    // Faltam perguntas numa dificuldade? Completa com outras da mesma estação
    // (e, em último caso, de outras estações). Nunca arranca com menos de 8.
    const fillers = [...stationRest, ...otherStations]
    while (main.length < VANATRILHA_DAILY_LENGTH && fillers.length > 0) {
      const next = fillers.shift()!
      if (used.has(next.id)) continue
      main.push(next)
      used.add(next.id)
    }
    if (main.length < VANATRILHA_DAILY_LENGTH) {
      return { error: 'Ainda não há perguntas suficientes para a etapa de hoje. Avisa um dirigente.' }
    }
    main.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])

    // Reservas: substituem a pergunta quando se erra (mesma estação primeiro).
    // A pergunta bónus das Tábuas da Lei é a última reserva da estação.
    const stationReserves = stationRest.filter((q) => !used.has(q.id))
    const otherReserves = otherStations.filter((q) => !used.has(q.id))
    const special = dailySpecialOf(station)
    const bonus =
      special?.tile === 'tabuas'
        ? stationReserves[stationReserves.length - 1] ?? otherReserves[otherReserves.length - 1] ?? null
        : null
    const reserves = [...stationReserves, ...otherReserves].filter((q) => q.id !== bonus?.id)

    const insert = {
      user_id: user.id,
      run_date: runDate,
      station,
      question_ids: main.map((q) => q.id),
      reserve_ids: reserves.slice(0, 12).map((q) => q.id),
      current_question_id: main[0].id,
      bonus_question_id: bonus?.id ?? null,
      lives: VANATRILHA_DAILY_LIVES,
    }

    const { data: created, error: insertError } = await service
      .from('vanatrilha_daily_runs')
      .insert(insert)
      .select('*')
      .single()

    if (insertError) {
      // Outro dispositivo criou a corrida ao mesmo tempo: devolve essa.
      if (insertError.code === '23505') {
        const again = await fetchTodayRun(user.id, runDate)
        if (again) return { run: toPublicRun(again), current_step: await currentStep(again) }
      }
      throw new Error(insertError.message)
    }

    const row = created as RunRow
    return { run: toPublicRun(row), current_step: await currentStep(row) }
  } catch (e) {
    return { error: errorMessage(e, 'Não foi possível começar a etapa.') }
  }
}

type AnswerResponse = VanaTrilhaAnswerResult
export type AnswerFailure = { error: string; run?: VanaTrilhaDailyRun; next_step?: VanaTrilhaStep | null }

/**
 * Submete a resposta ao passo atual.
 *   runId        — corrida de hoje
 *   questionIndex — o `turn` que o cliente tem (n.º de respostas já dadas).
 *                   Impede saltar, repetir ou aplicar duas vezes a mesma resposta.
 *   chosenIndex  — pergunta normal: posição 0..3 tal como foi mostrada;
 *                   pergunta bónus: 0 = Verdadeiro, 1 = Falso.
 * Tudo é validado e calculado no servidor.
 */
export async function answerDailyQuestion(
  runId: string,
  questionIndex: number,
  chosenIndex: number,
): Promise<AnswerResponse | AnswerFailure> {
  try {
    const { supabase, user } = await requireUser()
    if (typeof runId !== 'string' || !UUID_RE.test(runId) || !Number.isInteger(questionIndex) || !Number.isInteger(chosenIndex)) {
      return { error: 'Resposta inválida.' }
    }

    const service = createServiceClient()
    const { data: found, error: fetchError } = await service
      .from('vanatrilha_daily_runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle()
    if (fetchError) throw new Error(fetchError.message)
    const run = found as RunRow | null
    if (!run || run.user_id !== user.id) return { error: 'Etapa não encontrada.' }

    // Pedido repetido (ex.: duplo toque ou nova tentativa de rede): devolve o
    // resultado já registado, sem alterar nada.
    if (questionIndex < run.turn) return await replayAnswer(run, questionIndex)
    if (questionIndex > run.turn) {
      return { error: 'Esta pergunta ainda não está disponível.', run: toPublicRun(run), next_step: await currentStep(run) }
    }
    if (run.status !== 'playing') {
      return { error: 'A etapa de hoje já terminou.', run: toPublicRun(run), next_step: null }
    }

    const next: RunRow = { ...run, answers: [...(run.answers ?? [])] }
    const now = new Date().toISOString()
    let result: Omit<VanaTrilhaAnswerResult, 'run' | 'next_step' | 'rewards'>

    if (run.bonus_pending) {
      // ── Tábuas da Lei: Verdadeiro/Falso ─────────────────────────────
      if (chosenIndex !== 0 && chosenIndex !== 1) return { error: 'Resposta inválida.' }
      const q = run.bonus_question_id ? (await fetchQuestions([run.bonus_question_id])).get(run.bonus_question_id) : null
      if (!q) return { error: 'Pergunta bónus não encontrada.' }

      const proposed = bonusProposedIndex(q.id, run.run_date, q.correct_index)
      const truthIndex = proposed === q.correct_index ? 0 : 1
      const correct = chosenIndex === truthIndex

      next.bonus_pending = false
      let tileTriggered = false
      if (correct) {
        next.position = Math.min(VANATRILHA_DAILY_LENGTH, run.position + tabuasSteps())
        next.current_index = next.position
        tileTriggered = applyLanding(next)
      }
      finishIfArrived(next, now)

      next.answers.push({
        turn: run.turn,
        kind: 'bonus',
        question_id: q.id,
        chosen_index: chosenIndex,
        correct,
        protected: false,
        life_lost: false,
        tile_triggered: tileTriggered,
        at: now,
      })

      result = {
        kind: 'bonus',
        correct,
        correct_index: truthIndex,
        correct_answer: q.options[q.correct_index],
        explanation: q.explanation,
        reference: q.reference,
        life_lost: false,
        protected_by_elim: false,
        tile: dailyTileAt(next.station, next.position),
        tile_triggered: tileTriggered,
      }
    } else {
      // ── Pergunta normal ──────────────────────────────────────────────
      if (chosenIndex < 0 || chosenIndex > 3) return { error: 'Resposta inválida.' }
      const q = run.current_question_id ? (await fetchQuestions([run.current_question_id])).get(run.current_question_id) : null
      if (!q) return { error: 'Pergunta não encontrada.' }

      const perm = optionPermutation(q.id, run.run_date, q.options.length)
      const originalChosen = perm[chosenIndex]
      const correct = originalChosen === q.correct_index
      const displayedCorrect = perm.indexOf(q.correct_index)

      // A proteção da Fonte de Elim vale só para esta ronda.
      const wasImmune = run.immune_next_error
      next.immune_next_error = false

      let lifeLost = false
      let protectedByElim = false
      let tileTriggered = false

      if (correct) {
        next.correct_count = run.correct_count + 1
        next.position = Math.min(VANATRILHA_DAILY_LENGTH, run.position + 1)
        next.current_index = next.position
        tileTriggered = applyLanding(next)
        finishIfArrived(next, now)
      } else {
        next.mistakes = run.mistakes + 1
        if (wasImmune) {
          protectedByElim = true
        } else {
          next.lives = Math.max(0, run.lives - 1)
          lifeLost = true
        }

        if (next.lives <= 0) {
          next.status = 'failed'
          next.finished_at = now
          next.current_question_id = null
          next.bonus_pending = false
        } else {
          // Troca por outra pergunta da mesma dificuldade (o peão fica na mesma casa).
          next.current_question_id = await pickReplacement(next, q)
        }
      }

      next.answers.push({
        turn: run.turn,
        kind: 'question',
        question_id: q.id,
        chosen_index: originalChosen,
        correct,
        protected: protectedByElim,
        life_lost: lifeLost,
        tile_triggered: tileTriggered,
        at: now,
      })

      result = {
        kind: 'question',
        correct,
        correct_index: displayedCorrect,
        correct_answer: q.options[q.correct_index],
        explanation: q.explanation,
        reference: q.reference,
        life_lost: lifeLost,
        protected_by_elim: protectedByElim,
        tile: dailyTileAt(next.station, next.position),
        tile_triggered: tileTriggered,
      }
    }

    next.turn = run.turn + 1

    // Trinco otimista: só grava se ninguém mexeu na corrida entretanto
    // (dois dispositivos, duplo toque). Se falhar, o cliente ressincroniza.
    const { data: updated, error: updateError } = await service
      .from('vanatrilha_daily_runs')
      .update({
        position: next.position,
        current_index: next.current_index,
        lives: next.lives,
        correct_count: next.correct_count,
        mistakes: next.mistakes,
        turn: next.turn,
        immune_next_error: next.immune_next_error,
        bonus_gold: next.bonus_gold,
        bonus_pending: next.bonus_pending,
        current_question_id: next.current_question_id,
        reserve_ids: next.reserve_ids,
        answers: next.answers,
        status: next.status,
        finished_at: next.finished_at,
      })
      .eq('id', run.id)
      .eq('turn', run.turn)
      .eq('status', 'playing')
      .select('*')
      .maybeSingle()

    if (updateError) throw new Error(updateError.message)
    if (!updated) {
      const fresh = await fetchTodayRun(user.id, run.run_date)
      if (fresh && questionIndex < fresh.turn) return await replayAnswer(fresh, questionIndex)
      return {
        error: 'A etapa foi atualizada noutro dispositivo.',
        run: fresh ? toPublicRun(fresh) : undefined,
        next_step: fresh ? await currentStep(fresh) : null,
      }
    }

    const saved = updated as RunRow

    // Etapa completa → prémios (idempotente; corre com a sessão do jogador).
    let rewards: VanaTrilhaRewards | null = null
    if (saved.status === 'completed') {
      const { data: award } = await supabase.rpc('award_vanatrilha_daily_rewards', { p_run_id: saved.id })
      const awardResult = award as { ok?: boolean; reason?: string } | null
      if (awardResult?.ok || awardResult?.reason === 'already_awarded') saved.rewards_awarded = true
      rewards = rewardsFor(saved)
      revalidatePath('/jogos')
    }

    return {
      ...result,
      run: toPublicRun(saved),
      next_step: await currentStep(saved),
      rewards,
    }
  } catch (e) {
    return { error: errorMessage(e, 'Não foi possível registar a resposta.') }
  }
}

/** Aplica o efeito da casa onde o peão acabou de parar. Devolve true se era especial. */
function applyLanding(row: RunRow): boolean {
  if (row.position >= VANATRILHA_DAILY_LENGTH) return false
  const tile = dailyTileAt(row.station, row.position)
  if (tile === 'normal') return false
  const effect = applyTileEffect(tile)
  row.bonus_gold = (row.bonus_gold ?? 0) + effect.bonus_gold
  if (effect.immune_next_error) row.immune_next_error = true
  if (effect.bonus_question && row.bonus_question_id) row.bonus_pending = true
  return true
}

/** Chegou à casa 8 → etapa completa. Senão, prepara a pergunta da casa seguinte. */
function finishIfArrived(row: RunRow, now: string) {
  if (row.position >= VANATRILHA_DAILY_LENGTH) {
    row.status = 'completed'
    row.finished_at = now
    row.current_question_id = null
    row.bonus_pending = false
    row.immune_next_error = false
    return
  }
  row.current_question_id = row.question_ids[row.current_index] ?? row.current_question_id
}

/** Primeira reserva com a mesma dificuldade; senão, a primeira que houver. */
async function pickReplacement(row: RunRow, missed: QuestionRow): Promise<string> {
  const reserves = row.reserve_ids ?? []
  if (reserves.length === 0) return missed.id
  const map = await fetchQuestions(reserves)
  const alive = reserves.filter((id) => map.has(id) && map.get(id)!.is_active)
  const same = alive.find((id) => map.get(id)!.difficulty === missed.difficulty)
  const chosen = same ?? alive[0] ?? reserves[0]
  row.reserve_ids = reserves.filter((id) => id !== chosen)
  return chosen
}

/** Reconstrói o resultado de uma resposta já registada (pedido repetido). */
async function replayAnswer(run: RunRow, turn: number): Promise<AnswerResponse | AnswerFailure> {
  const entry = (run.answers ?? []).find((a) => a.turn === turn)
  if (!entry) return { error: 'Esta pergunta já foi respondida.', run: toPublicRun(run), next_step: await currentStep(run) }

  const q = (await fetchQuestions([entry.question_id])).get(entry.question_id)
  if (!q) return { error: 'Pergunta não encontrada.', run: toPublicRun(run), next_step: await currentStep(run) }

  let correctIndex: number
  if (entry.kind === 'bonus') {
    correctIndex = bonusProposedIndex(q.id, run.run_date, q.correct_index) === q.correct_index ? 0 : 1
  } else {
    correctIndex = optionPermutation(q.id, run.run_date, q.options.length).indexOf(q.correct_index)
  }

  return {
    kind: entry.kind,
    correct: entry.correct,
    correct_index: correctIndex,
    correct_answer: q.options[q.correct_index],
    explanation: q.explanation,
    reference: q.reference,
    life_lost: entry.life_lost,
    protected_by_elim: entry.protected,
    tile: dailyTileAt(run.station, run.position),
    tile_triggered: false,
    run: toPublicRun(run),
    next_step: await currentStep(run),
    rewards: rewardsFor(run),
  }
}

/** Chama o RPC award_vanatrilha_daily_rewards. Idempotente. */
export async function claimDailyRewards(runId: string): Promise<{
  ok?: boolean
  xp?: number
  gold?: number
  perfect?: boolean
  bonus_gold?: number
  error?: string
}> {
  try {
    const { supabase } = await requireUser()
    if (typeof runId !== 'string' || !UUID_RE.test(runId)) return { error: 'Etapa não encontrada.' }
    const { data, error } = await supabase.rpc('award_vanatrilha_daily_rewards', { p_run_id: runId })
    if (error) return { error: error.message }
    const res = data as { ok: boolean; reason?: string; xp?: number; gold?: number; perfect?: boolean; bonus_gold?: number }
    if (res.ok) {
      revalidatePath('/jogos')
      return { ok: true, xp: res.xp, gold: res.gold, perfect: res.perfect, bonus_gold: res.bonus_gold }
    }
    const reasons: Record<string, string> = {
      not_found: 'Etapa não encontrada.',
      forbidden: 'Esta etapa não é tua.',
      not_completed: 'A etapa ainda não está completa.',
      already_awarded: 'Os prémios desta etapa já foram entregues.',
    }
    return { ok: false, error: reasons[res.reason ?? ''] ?? 'Não foi possível entregar os prémios.' }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

/** Estações já completadas + se a insígnia "Peregrino da Promessa" está desbloqueada. */
export async function getStationProgress(): Promise<{
  stations: number[]
  badge_unlocked: boolean
  error?: string
}> {
  try {
    const { supabase, user } = await requireUser()
    const { data, error } = await supabase
      .from('vanatrilha_station_progress')
      .select('station')
      .eq('user_id', user.id)
    if (error) return { stations: [], badge_unlocked: false, error: error.message }
    const stations = [...new Set((data ?? []).map((r) => r.station as number))].sort((a, b) => a - b)
    return { stations, badge_unlocked: stations.length >= VANATRILHA_STATIONS.length }
  } catch (e) {
    return { stations: [], badge_unlocked: false, error: errorMessage(e) }
  }
}

// ────────────────────────────────────────────────────────────────────
// Gestão do banco de perguntas (dirigentes/coordenadores)
// ────────────────────────────────────────────────────────────────────

const CATEGORIES: VanaTrilhaCategory[] = ['personagens', 'lugares', 'numeros', 'milagres', 'versiculos']
const DIFFICULTIES: VanaTrilhaDifficulty[] = ['facil', 'media', 'dificil']

function validateQuestionInput(input: VanaTrilhaQuestionInput): { value?: VanaTrilhaQuestionInput; error?: string } {
  const station = Number(input.station)
  if (!Number.isInteger(station) || station < 1 || station > 7) return { error: 'Escolhe uma estação válida.' }
  if (!CATEGORIES.includes(input.category)) return { error: 'Escolhe uma categoria válida.' }
  if (!DIFFICULTIES.includes(input.difficulty)) return { error: 'Escolhe uma dificuldade válida.' }

  const prompt = (input.prompt ?? '').trim()
  if (prompt.length < 5) return { error: 'O enunciado é demasiado curto.' }
  if (prompt.length > 300) return { error: 'O enunciado é demasiado longo (máx. 300 caracteres).' }

  const options = (input.options ?? []).map((o) => (o ?? '').trim())
  if (options.length !== 4 || options.some((o) => o.length === 0)) return { error: 'Preenche as 4 opções.' }
  if (options.some((o) => o.length > 120)) return { error: 'Cada opção pode ter no máximo 120 caracteres.' }
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return { error: 'As 4 opções têm de ser diferentes.' }

  const correct = Number(input.correct_index)
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return { error: 'Indica qual é a opção correta.' }

  const explanation = (input.explanation ?? '').trim()
  if (explanation.length < 10) return { error: 'A explicação é obrigatória (é metade do valor do jogo!).' }
  if (explanation.length > 500) return { error: 'A explicação é demasiado longa (máx. 500 caracteres).' }

  const reference = (input.reference ?? '').trim() || null

  return {
    value: {
      station,
      category: input.category,
      difficulty: input.difficulty,
      prompt,
      options,
      correct_index: correct,
      reference,
      explanation,
      is_active: input.is_active ?? true,
    },
  }
}

export async function listQuestions(filter?: {
  station?: number
  category?: string
  difficulty?: string
  search?: string
  active?: 'all' | 'active' | 'inactive'
}): Promise<{ questions: VanaTrilhaQuestionAdmin[]; error?: string }> {
  try {
    const { supabase } = await requireHost()
    let query = supabase.from('vanatrilha_questions').select(QUESTION_COLUMNS)
    if (filter?.station) query = query.eq('station', filter.station)
    if (filter?.category && CATEGORIES.includes(filter.category as VanaTrilhaCategory)) query = query.eq('category', filter.category)
    if (filter?.difficulty && DIFFICULTIES.includes(filter.difficulty as VanaTrilhaDifficulty)) query = query.eq('difficulty', filter.difficulty)
    if (filter?.active === 'active') query = query.eq('is_active', true)
    if (filter?.active === 'inactive') query = query.eq('is_active', false)
    const search = filter?.search?.trim().replace(/[%_,()]/g, ' ')
    if (search) query = query.ilike('prompt', `%${search}%`)

    const { data, error } = await query
      .order('station', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) return { questions: [], error: error.message }

    const rows = (data ?? []) as QuestionRow[]
    rows.sort((a, b) => a.station - b.station || DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
    return { questions: rows }
  } catch (e) {
    return { questions: [], error: errorMessage(e) }
  }
}

export async function createQuestion(input: VanaTrilhaQuestionInput): Promise<{ question?: VanaTrilhaQuestionAdmin; error?: string }> {
  try {
    const { supabase, user } = await requireHost()
    const { value, error: validation } = validateQuestionInput(input)
    if (!value) return { error: validation }

    const { data, error } = await supabase
      .from('vanatrilha_questions')
      .insert({ ...value, created_by: user.id })
      .select(QUESTION_COLUMNS)
      .single()
    if (error) {
      if (error.code === '23505') return { error: 'Já existe uma pergunta igual nesta estação.' }
      return { error: error.message }
    }
    revalidatePath('/admin/vana-trilha')
    return { question: data as QuestionRow }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

export async function updateQuestion(
  id: string,
  patch: VanaTrilhaQuestionInput,
): Promise<{ question?: VanaTrilhaQuestionAdmin; error?: string }> {
  try {
    const { supabase } = await requireHost()
    if (!UUID_RE.test(id)) return { error: 'Pergunta não encontrada.' }
    const { value, error: validation } = validateQuestionInput(patch)
    if (!value) return { error: validation }

    const { data, error } = await supabase
      .from('vanatrilha_questions')
      .update(value)
      .eq('id', id)
      .select(QUESTION_COLUMNS)
      .maybeSingle()
    if (error) {
      if (error.code === '23505') return { error: 'Já existe uma pergunta igual nesta estação.' }
      return { error: error.message }
    }
    if (!data) return { error: 'Pergunta não encontrada.' }
    revalidatePath('/admin/vana-trilha')
    return { question: data as QuestionRow }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

export async function toggleQuestionActive(id: string, active: boolean): Promise<{ ok?: boolean; error?: string }> {
  try {
    const { supabase } = await requireHost()
    if (!UUID_RE.test(id)) return { error: 'Pergunta não encontrada.' }
    const { data, error } = await supabase
      .from('vanatrilha_questions')
      .update({ is_active: !!active })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: 'Pergunta não encontrada.' }
    revalidatePath('/admin/vana-trilha')
    return { ok: true }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

/** Resumo da etapa de hoje para o painel de gestão. */
export async function getTodayStats(): Promise<{ stats?: VanaTrilhaTodayStats; error?: string }> {
  try {
    await requireHost()
    const runDate = lisbonDateString()
    const service = createServiceClient()
    const { data, error } = await service
      .from('vanatrilha_daily_runs')
      .select('status, mistakes')
      .eq('run_date', runDate)
    if (error) return { error: error.message }
    const rows = (data ?? []) as { status: VanaTrilhaRunStatus; mistakes: number }[]
    return {
      stats: {
        run_date: runDate,
        station: stationOfDay(runDate),
        total: rows.length,
        playing: rows.filter((r) => r.status === 'playing').length,
        completed: rows.filter((r) => r.status === 'completed').length,
        failed: rows.filter((r) => r.status === 'failed').length,
        perfect: rows.filter((r) => r.status === 'completed' && r.mistakes === 0).length,
      },
    }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}
