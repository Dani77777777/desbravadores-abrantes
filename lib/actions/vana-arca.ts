'use server'

import { randomInt } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveRole } from '@/utils/permissions'
import { gameUnavailableError } from '@/utils/game-access'
import { replayArca, ticksWithinClock, MAX_RUN_TICKS, normalizePrizeTime, validateTaps } from '@/utils/vana-arca'
import {
  currentMultiplier,
  loadOpenPeriod,
  loadPeriodStandings,
  loadPlayerStatus,
  loadVanaArcaSettings,
  processVanaArcaPayouts,
  toPublicBoards,
} from '@/lib/vana-arca-server'
import {
  VANAARCA_GAME_ID,
  type VanaArcaBoards,
  type VanaArcaFinishResponse,
  type VanaArcaPayoutResults,
  type VanaArcaPayoutRow,
  type VanaArcaSettings,
  type VanaArcaStatus,
} from '@/types/vana-arca'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Guardas ─────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Precisas de iniciar sessão para jogar.')
  return { supabase, user }
}

/** Coordenação (cargo efetivo, como as outras páginas de gestão só para coordenadores). */
async function requireCoordinator() {
  const { supabase, user } = await requireUser()
  const { data: profile } = await supabase.from('profiles').select('role, helper_role').eq('id', user.id).maybeSingle()
  if (effectiveRole(profile) !== 'coordenador') throw new Error('Só a coordenação pode gerir o VanaArca.')
  return { supabase, user }
}

function errorMessage(e: unknown, fallback = 'Ocorreu um erro inesperado.'): string {
  return e instanceof Error && e.message ? e.message : fallback
}

async function statusFor(userId: string): Promise<VanaArcaStatus> {
  const service = createServiceClient()
  const settings = await loadVanaArcaSettings(service)
  const period = await loadOpenPeriod(service, settings)
  return loadPlayerStatus(service, userId, settings, period, await currentMultiplier())
}

// ─── Jogo ────────────────────────────────────────────────────────────────────

export async function getMyStatus(): Promise<{ status?: VanaArcaStatus; error?: string }> {
  try {
    const { user } = await requireUser()
    return { status: await statusFor(user.id) }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

/**
 * Cria a partida com uma semente aleatória gerada aqui. Gasta logo uma vaga do
 * dia (mesmo que a partida seja abandonada) e abandona a anterior em curso.
 */
export async function startRun(): Promise<{
  runId?: string
  seed?: number
  dailyIndex?: number
  status?: VanaArcaStatus
  error?: string
}> {
  try {
    const { user } = await requireUser()
    const unavailable = await gameUnavailableError(VANAARCA_GAME_ID)
    if (unavailable) return { error: unavailable }

    const seed = randomInt(0, 2 ** 32)
    const service = createServiceClient()
    const { data, error } = await service.rpc('vanaarca_start_run', { p_user_id: user.id, p_seed: seed })
    if (error) return { error: 'Não foi possível começar a partida. Tenta outra vez.' }
    const row = data as { id: string; seed: number; daily_index: number }
    return { runId: row.id, seed: Number(row.seed), dailyIndex: row.daily_index, status: await statusFor(user.id) }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

interface RunRow {
  id: string
  user_id: string
  seed: number
  status: string
  started_at: string
  daily_index: number
  pares: number | null
  filas: number | null
  score: number | null
  end_reason: 'capsized' | 'full' | null
  reward_xp: number
  reward_gold: number
  rewards_awarded: boolean
}

async function familyNoteFor(userId: string): Promise<string | null> {
  try {
    return toPublicBoards(await loadPeriodStandings(), userId).family_note
  } catch {
    return null
  }
}

async function claimRewards(runId: string) {
  const { supabase } = await requireUser()
  const { data, error } = await supabase.rpc('award_vanaarca_run_rewards', { p_run_id: runId })
  if (error) return null
  return data as { ok: boolean; reason?: string; xp?: number; gold?: number; no_slot?: boolean; multiplier?: number }
}

async function finishedResponse(row: RunRow, userId: string): Promise<VanaArcaFinishResponse> {
  let xp = row.reward_xp
  let multiplier = 1
  let noSlot = false
  if (!row.rewards_awarded) {
    const award = await claimRewards(row.id)
    if (award?.ok) {
      xp = award.xp ?? 0
      multiplier = award.multiplier ?? 1
      noSlot = !!award.no_slot
    } else if (award?.reason === 'already_awarded') {
      xp = award.xp ?? 0
    }
  }
  const status = await statusFor(userId)
  if (row.rewards_awarded) noSlot = row.daily_index > status.paid_runs_per_day
  return {
    ok: true,
    result: { pares: row.pares ?? 0, filas: row.filas ?? 0, score: row.score ?? 0, end_reason: row.end_reason ?? 'full' },
    reward_xp: xp,
    reward_gold: xp,
    no_reward_slot: noSlot,
    multiplier,
    status,
    family_note: await familyNoteFor(userId),
  }
}

/**
 * Fim da partida: o servidor repete-a a partir da semente e dos toques e é o
 * resultado DELE que fica gravado. Qualquer validação que falhe deixa a partida
 * 'invalid' (sem pontos e fora dos rankings).
 */
export async function finishRun(runId: string, taps: number[], ticks: number): Promise<VanaArcaFinishResponse> {
  try {
    const { user } = await requireUser()
    if (typeof runId !== 'string' || !UUID_RE.test(runId)) return { ok: false, error: 'Partida não encontrada.' }

    const service = createServiceClient()
    const { data } = await service
      .from('vanaarca_runs')
      .select('id, user_id, seed, status, started_at, daily_index, pares, filas, score, end_reason, reward_xp, reward_gold, rewards_awarded')
      .eq('id', runId)
      .maybeSingle()
    const run = data as RunRow | null
    if (!run || run.user_id !== user.id) return { ok: false, error: 'Partida não encontrada.' }

    // Repetição do pedido (ex.: a ligação caiu depois de gravar): devolve o que ficou.
    if (run.status === 'finished') return finishedResponse(run, user.id)
    if (run.status === 'invalid') return { ok: false, invalid: true, status: await statusFor(user.id) }
    if (run.status !== 'playing') return { ok: false, error: 'Esta partida já não está a decorrer.', status: await statusFor(user.id) }

    const shapeError = validateTaps(taps, ticks)
    const replay = shapeError ? null : replayArca(Number(run.seed), taps, ticks)
    const clockOk = typeof ticks === 'number' && ticksWithinClock(ticks, Date.parse(run.started_at), Date.now())
    const finishedAt = new Date().toISOString()

    if (!replay || !replay.ok || !clockOk) {
      const reason = shapeError ?? (replay && !replay.ok ? replay.reason : 'clock')
      await service
        .from('vanaarca_runs')
        .update({
          status: 'invalid',
          finished_at: finishedAt,
          taps: shapeError ? null : taps,
          ticks: typeof ticks === 'number' && Number.isInteger(ticks) && ticks <= MAX_RUN_TICKS ? ticks : null,
          invalid_reason: reason,
        })
        .eq('id', run.id)
        .eq('status', 'playing')
      return { ok: false, invalid: true, status: await statusFor(user.id) }
    }

    const { data: saved } = await service
      .from('vanaarca_runs')
      .update({
        status: 'finished',
        finished_at: finishedAt,
        taps,
        ticks,
        pares: replay.pares,
        filas: replay.filas,
        score: replay.score,
        end_reason: replay.endReason,
        species: replay.species,
      })
      .eq('id', run.id)
      .eq('status', 'playing')
      .select('id, user_id, seed, status, started_at, daily_index, pares, filas, score, end_reason, reward_xp, reward_gold, rewards_awarded')
      .maybeSingle()

    // Outro pedido ganhou a corrida (ou a partida foi abandonada entretanto).
    if (!saved) {
      const { data: again } = await service
        .from('vanaarca_runs')
        .select('id, user_id, seed, status, started_at, daily_index, pares, filas, score, end_reason, reward_xp, reward_gold, rewards_awarded')
        .eq('id', run.id)
        .maybeSingle()
      const row = again as RunRow | null
      if (row?.status === 'finished') return finishedResponse(row, user.id)
      return { ok: false, error: 'Esta partida já não está a decorrer.', status: await statusFor(user.id) }
    }

    const response = await finishedResponse(saved as RunRow, user.id)
    revalidatePath('/jogos')
    return response
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export async function getWeeklyBoards(): Promise<{ boards?: VanaArcaBoards; error?: string }> {
  try {
    const { user } = await requireUser()
    return { boards: toPublicBoards(await loadPeriodStandings(), user.id) }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

// ─── Admin (coordenação) ─────────────────────────────────────────────────────

export interface VanaArcaAdminPreview {
  period: { start: string; end: string }
  top: { position: number; name: string; score: number; finished_at: string; prize: number }[]
  families: { position: number; name: string; average: number; played: number; active: number }[]
  family_winner: string | null
}

export async function getAdminPreview(): Promise<VanaArcaAdminPreview> {
  await requireCoordinator()
  const st = await loadPeriodStandings()
  const prizes = st.settings.top_prizes
  return {
    period: { start: st.period.start.toISOString(), end: st.period.end.toISOString() },
    top: st.ranking.slice(0, Math.max(prizes.length, 3)).map((r, i) => ({
      position: i + 1,
      name: st.names.get(r.userId) || 'Sem nome',
      score: r.score,
      finished_at: r.finishedAt,
      prize: prizes[i] ?? 0,
    })),
    families: st.families.map((f, i) => ({
      position: i + 1,
      name: f.name,
      average: Math.round((f.active ? f.total / f.active : 0) * 10) / 10,
      played: f.played,
      active: f.active,
    })),
    family_winner: st.families[0] && st.families[0].played > 0 ? st.families[0].name : null,
  }
}

export async function getPayoutHistory(): Promise<VanaArcaPayoutRow[]> {
  await requireCoordinator()
  const service = createServiceClient()
  const { data } = await service
    .from('vanaarca_weekly_payouts')
    .select('period_start, period_end, paid_at, paid_by, results')
    .order('period_end', { ascending: false })
    .limit(30)
  const rows = (data ?? []) as Omit<VanaArcaPayoutRow, 'paid_by_name'>[]
  const payers = [...new Set(rows.map((r) => r.paid_by).filter((id): id is string => !!id))]
  const names = new Map<string, string>()
  if (payers.length) {
    const { data: profiles } = await service.from('profiles').select('id, full_name').in('id', payers)
    for (const p of profiles ?? []) names.set(p.id, p.full_name ?? '')
  }
  return rows.map((r) => ({
    ...r,
    results: r.results as VanaArcaPayoutResults,
    paid_by_name: r.paid_by ? names.get(r.paid_by) ?? 'Coordenação' : null,
  }))
}

export interface VanaArcaSettingsInput {
  prize_weekday: number
  prize_time: string
  paid_runs_per_day: number
  reward_low: number
  reward_mid: number
  reward_high: number
  mid_from: number
  high_from: number
  top_prizes: number[]
  family_prize: number
  family_min_members: number
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

export async function saveVanaArcaSettings(input: VanaArcaSettingsInput): Promise<{ ok?: boolean; settings?: VanaArcaSettings; error?: string }> {
  try {
    const { user } = await requireCoordinator()
    const time = normalizePrizeTime(String(input?.prize_time ?? ''))
    const [hh, mm] = time.split(':').map(Number)
    if (!isInt(input.prize_weekday, 0, 6)) return { error: 'Escolhe o dia do prémio.' }
    if (!/^\d{2}:\d{2}$/.test(String(input.prize_time).slice(0, 5)) || hh > 23 || mm > 59) return { error: 'Hora inválida.' }
    if (!isInt(input.paid_runs_per_day, 0, 20)) return { error: 'Partidas pagas por dia: entre 0 e 20.' }
    for (const v of [input.reward_low, input.reward_mid, input.reward_high, input.family_prize]) {
      if (!isInt(v, 0, 1000)) return { error: 'Os prémios têm de ser números inteiros entre 0 e 1000.' }
    }
    if (!isInt(input.mid_from, 1, 60) || !isInt(input.high_from, 1, 60) || input.high_from <= input.mid_from) {
      return { error: 'Os limiares de pares têm de ser crescentes (entre 1 e 60).' }
    }
    if (!Array.isArray(input.top_prizes) || input.top_prizes.length !== 3 || !input.top_prizes.every((v) => isInt(v, 0, 1000))) {
      return { error: 'Os prémios do top 3 têm de ser três números entre 0 e 1000.' }
    }
    if (!isInt(input.family_min_members, 1, 20)) return { error: 'Mínimo de membros: entre 1 e 20.' }

    const service = createServiceClient()
    const current = await loadVanaArcaSettings(service)
    const scheduleChanged = current.prize_weekday !== input.prize_weekday || current.prize_time !== time
    const now = new Date().toISOString()

    const { error } = await service
      .from('vanaarca_settings')
      .update({
        prize_weekday: input.prize_weekday,
        prize_time: time,
        paid_runs_per_day: input.paid_runs_per_day,
        reward_low: input.reward_low,
        reward_mid: input.reward_mid,
        reward_high: input.reward_high,
        mid_from: input.mid_from,
        high_from: input.high_from,
        top_prizes: input.top_prizes,
        family_prize: input.family_prize,
        family_min_members: input.family_min_members,
        updated_at: now,
        updated_by: user.id,
        // O período aberto passa a acabar na próxima ocorrência depois de agora.
        ...(scheduleChanged ? { schedule_changed_at: now } : {}),
      })
      .eq('id', 1)
    if (error) return { error: 'Não foi possível gravar as definições.' }

    revalidatePath('/admin/vana-arca')
    revalidatePath('/jogos/vana-arca')
    return { ok: true, settings: await loadVanaArcaSettings(service) }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

/** "Processar pagamentos em atraso": chama a mesma função (não paga antes da hora nem duas vezes). */
export async function processPayoutsNow(): Promise<{ paidPeriods?: number; error?: string }> {
  try {
    const { user } = await requireCoordinator()
    const res = await processVanaArcaPayouts(user.id)
    if (!res.ok) return { error: res.error }
    revalidatePath('/admin/vana-arca')
    return { paidPeriods: res.paidPeriods }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}
