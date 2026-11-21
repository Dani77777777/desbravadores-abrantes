import { createServiceClient } from '@/utils/supabase/service'
import { shortDisplayName } from '@/utils/display-name'
import { isHiddenFromRanking } from '@/utils/ranking'
import { activeMultiplier, fetchGameSetting } from '@/utils/games'
import {
  familyAverage,
  familyPositionNote,
  familyStandings,
  lisbonDateString,
  normalizePrizeTime,
  openPeriod,
  paidRunsLeft,
  personalRecords,
  weeklyRanking,
  type FamilyInput,
  type FamilyStanding,
  type PersonalRecord,
  type RankingRun,
} from '@/utils/vana-arca'
import {
  DEFAULT_VANAARCA_SETTINGS,
  VANAARCA_GAME_ID,
  type VanaArcaBoards,
  type VanaArcaFamilyEntry,
  type VanaArcaSettings,
  type VanaArcaStatus,
  type VanaArcaTopEntry,
} from '@/types/vana-arca'

// VanaArca: leituras e tarefas que só o servidor faz (service role). Só importar
// em código de servidor (páginas / server actions). NÃO é 'use server': nada daqui
// pode ser chamado diretamente pelo browser.

type Service = ReturnType<typeof createServiceClient>

/**
 * Rede de segurança sem pg_cron: paga os períodos semanais que já acabaram. A
 * função SQL decide se já é hora e nunca paga duas vezes (pode correr sempre).
 */
export async function processVanaArcaPayouts(triggeredBy: string | null = null) {
  try {
    const { data, error } = await createServiceClient().rpc('vanaarca_process_weekly_payout', {
      p_triggered_by: triggeredBy,
    })
    if (error) {
      console.warn('vanaarca_process_weekly_payout:', error.message)
      return { ok: false as const, error: error.message }
    }
    const res = data as { ok?: boolean; paid_periods?: number } | null
    return { ok: true as const, paidPeriods: res?.paid_periods ?? 0 }
  } catch (error) {
    console.warn('vanaarca_process_weekly_payout:', error)
    return { ok: false as const, error: 'Falhou o processamento dos pagamentos.' }
  }
}

export async function loadVanaArcaSettings(service: Service = createServiceClient()): Promise<VanaArcaSettings> {
  const { data } = await service.from('vanaarca_settings').select('*').eq('id', 1).maybeSingle()
  const row = (data ?? {}) as Partial<VanaArcaSettings>
  return {
    ...DEFAULT_VANAARCA_SETTINGS,
    ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined)),
    prize_time: normalizePrizeTime(row.prize_time ?? DEFAULT_VANAARCA_SETTINGS.prize_time),
    top_prizes: Array.isArray(row.top_prizes) ? row.top_prizes.map(Number) : DEFAULT_VANAARCA_SETTINGS.top_prizes,
    launched_at: row.launched_at ?? new Date().toISOString(),
    schedule_changed_at: row.schedule_changed_at ?? null,
    updated_at: row.updated_at ?? null,
  } as VanaArcaSettings
}

/** Período aberto, com a mesma regra do SQL (último pagamento ou launched_at → próximo prémio). */
export async function loadOpenPeriod(service: Service, settings: VanaArcaSettings) {
  const { data } = await service
    .from('vanaarca_weekly_payouts')
    .select('period_end')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  return openPeriod({
    lastPeriodEnd: data?.period_end ? new Date(data.period_end) : null,
    launchedAt: new Date(settings.launched_at),
    scheduleChangedAt: settings.schedule_changed_at ? new Date(settings.schedule_changed_at) : null,
    weekday: settings.prize_weekday,
    time: settings.prize_time,
  })
}

async function loadPeriodRuns(service: Service, start: Date, end: Date): Promise<RankingRun[]> {
  const runs: RankingRun[] = []
  for (let page = 0; page < 50; page++) {
    const { data, error } = await service
      .from('vanaarca_runs')
      .select('user_id, score, finished_at')
      .eq('status', 'finished')
      .not('score', 'is', null)
      .gte('finished_at', start.toISOString())
      .lt('finished_at', end.toISOString())
      .order('id')
      .range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) runs.push({ userId: r.user_id, score: r.score, finishedAt: r.finished_at })
    if (!data || data.length < 1000) break
  }
  return runs
}

export interface PeriodStandings {
  period: { start: Date; end: Date }
  settings: VanaArcaSettings
  ranking: PersonalRecord[]
  families: FamilyStanding[]
  names: Map<string, string>
  familyOf: Map<string, string>
}

/**
 * Top individual + Disputa de Famílias do período aberto, calculados com as regras
 * de utils/vana-arca.ts (as mesmas de vanaarca_period_results no SQL).
 */
export async function loadPeriodStandings(service: Service = createServiceClient()): Promise<PeriodStandings> {
  const settings = await loadVanaArcaSettings(service)
  const period = await loadOpenPeriod(service, settings)

  const [runs, familiesRes, membersRes, activeRes] = await Promise.all([
    loadPeriodRuns(service, period.start, period.end),
    service.from('club_families').select('id, name'),
    service.from('club_family_members').select('family_id, user_id'),
    service.rpc('vanaarca_active_family_members', { p_end: period.end.toISOString() }),
  ])

  const records = personalRecords(runs)
  const userIds = [...records.keys()]
  const names = new Map<string, string>()
  const eligible = new Set<string>()
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await service.from('profiles').select('id, full_name, role').in('id', userIds.slice(i, i + 200))
    for (const p of data ?? []) {
      names.set(p.id, p.full_name ?? '')
      if ((p.role === 'desbravador' || p.role === 'dirigente') && !isHiddenFromRanking(p.full_name)) eligible.add(p.id)
    }
  }

  const familyOf = new Map<string, string>()
  const membersByFamily = new Map<string, string[]>()
  for (const m of membersRes.data ?? []) {
    familyOf.set(m.user_id, m.family_id)
    if (!membersByFamily.has(m.family_id)) membersByFamily.set(m.family_id, [])
    membersByFamily.get(m.family_id)!.push(m.user_id)
  }
  const families: FamilyInput[] = (familiesRes.data ?? []).map((f) => ({
    familyId: f.id,
    name: f.name,
    memberIds: membersByFamily.get(f.id) ?? [],
  }))
  const active = new Set<string>(((activeRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id))

  return {
    period,
    settings,
    ranking: weeklyRanking(records, eligible),
    families: familyStandings(families, records, active, settings.family_min_members),
    names,
    familyOf,
  }
}

const roundAverage = (f: FamilyStanding) => Math.round(familyAverage(f) * 10) / 10

/** O que os jogadores veem: nomes curtos, pontuação e posição; famílias sem membros. */
export function toPublicBoards(st: PeriodStandings, userId: string | null, topLimit = 10): VanaArcaBoards {
  const entry = (r: PersonalRecord, i: number): VanaArcaTopEntry => ({
    position: i + 1,
    name: shortDisplayName(st.names.get(r.userId)),
    score: r.score,
    is_me: r.userId === userId,
  })
  const top = st.ranking.slice(0, topLimit).map(entry)
  const myIndex = userId ? st.ranking.findIndex((r) => r.userId === userId) : -1
  const myFamily = userId ? st.familyOf.get(userId) ?? null : null
  const families: VanaArcaFamilyEntry[] = st.families.map((f, i) => ({
    position: i + 1,
    name: f.name,
    average: roundAverage(f),
    played: f.played,
    active: f.active,
    is_mine: f.familyId === myFamily,
  }))
  return {
    period: { start: st.period.start.toISOString(), end: st.period.end.toISOString() },
    prizes: st.settings.top_prizes,
    family_prize: st.settings.family_prize,
    family_min_members: st.settings.family_min_members,
    top,
    me: myIndex >= topLimit ? entry(st.ranking[myIndex], myIndex) : null,
    families,
    family_note: familyPositionNote(st.families, myFamily),
  }
}

/** Estado do jogador: vagas de hoje, recordes e multiplicador. */
export async function loadPlayerStatus(
  service: Service,
  userId: string,
  settings: VanaArcaSettings,
  period: { start: Date; end: Date },
  multiplier: number,
): Promise<VanaArcaStatus> {
  const today = lisbonDateString()
  const [{ count }, best, week] = await Promise.all([
    service.from('vanaarca_runs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('run_date', today),
    service
      .from('vanaarca_runs')
      .select('score')
      .eq('user_id', userId)
      .eq('status', 'finished')
      .not('score', 'is', null)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('vanaarca_runs')
      .select('score')
      .eq('user_id', userId)
      .eq('status', 'finished')
      .not('score', 'is', null)
      .gte('finished_at', period.start.toISOString())
      .lt('finished_at', period.end.toISOString())
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const runsToday = count ?? 0
  return {
    paid_runs_per_day: settings.paid_runs_per_day,
    runs_today: runsToday,
    paid_runs_left: paidRunsLeft(runsToday, settings),
    personal_best: best.data?.score ?? null,
    week_best: week.data?.score ?? null,
    multiplier,
  }
}

export async function currentMultiplier(): Promise<number> {
  const service = createServiceClient()
  const setting = await fetchGameSetting(service, VANAARCA_GAME_ID)
  return activeMultiplier(setting)
}
