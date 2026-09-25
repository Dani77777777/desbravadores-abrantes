// Ranking do Ecrã do Clube: lógica pura — ordenar e comparar "antes" (ontem) com "agora".

export type RankingView = 'combined' | 'xp' | 'gold'

export const SECTIONS = ['rebentos', 'ticoes', 'exploradores', 'companheiros', 'embaixadores'] as const
export type Section = (typeof SECTIONS)[number]
/** Filtro do ecrã: o clube todo ou uma secção. */
export type RankingSection = 'todos' | Section

export const SECTION_LABELS: Record<Section, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

/** Cor de cada secção — igual à do Ranking público e do Perfil. */
export const SECTION_COLORS: Record<Section, string> = {
  rebentos: 'bg-emerald-600',
  ticoes: 'bg-red-800',
  exploradores: 'bg-yellow-500',
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500',
}

export const VIEW_LABELS: Record<RankingView, { title: string; short: string; unit: string }> = {
  combined: { title: 'Top Global', short: 'Global', unit: 'Pontos' },
  xp: { title: 'Ranking XP', short: 'XP', unit: 'XP' },
  gold: { title: 'Ranking Ouro', short: 'Ouro', unit: 'Ouro' },
}

export function isSection(value: unknown): value is Section {
  return typeof value === 'string' && (SECTIONS as readonly string[]).includes(value)
}

/** Linha devolvida pela RPC `get_leaderboard_at_date`. */
export type RankingMember = {
  id: string
  full_name: string | null
  avatar_url: string | null
  section: string | null
  is_invested: boolean
  total_xp: number
  current_gold: number
}

/** A RPC devolve bigint (pode chegar como texto); normaliza para números. */
export function toRankingMembers(raw: unknown): RankingMember[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof r.id === 'string')
    .map((r) => ({
      id: r.id as string,
      full_name: typeof r.full_name === 'string' ? r.full_name : null,
      avatar_url: typeof r.avatar_url === 'string' && r.avatar_url ? r.avatar_url : null,
      section: typeof r.section === 'string' ? r.section : null,
      is_invested: !!r.is_invested,
      total_xp: Number(r.total_xp) || 0,
      current_gold: Number(r.current_gold) || 0,
    }))
}

export function scoreOf(member: RankingMember, view: RankingView): number {
  if (view === 'xp') return member.total_xp
  if (view === 'gold') return member.current_gold
  return member.total_xp + member.current_gold
}

/** Filtra pela secção e ordena do maior para o menor (empate: ordem alfabética, para ser estável). */
export function rankMembers(members: RankingMember[], view: RankingView, section: RankingSection): RankingMember[] {
  return members
    .filter((m) => section === 'todos' || m.section === section)
    .sort((a, b) => scoreOf(b, view) - scoreOf(a, view) || (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt'))
}

export type RankedRow = {
  member: RankingMember
  /** Posição (1 = primeiro). */
  rank: number
  score: number
  /** Onde estava no "antes". null = sem comparação, ou não aparecia no ranking. */
  before: { rank: number; score: number } | null
  /** Pontos ganhos desde o "antes" (0 sem comparação). */
  gained: number
  /** Lugares subidos (positivo) ou descidos (negativo). null = sem comparação ou novo no ranking. */
  move: number | null
  /** Não aparecia no "antes". */
  isNew: boolean
}

/**
 * Ranking de `current`; se vier `before`, cada linha traz também onde estava, quanto ganhou
 * e quantos lugares subiu/desceu.
 */
export function buildRanking(
  current: RankingMember[],
  view: RankingView,
  section: RankingSection,
  before?: RankingMember[] | null,
): RankedRow[] {
  const beforeMap = new Map<string, { rank: number; score: number }>()
  if (before) {
    rankMembers(before, view, section).forEach((m, i) => beforeMap.set(m.id, { rank: i + 1, score: scoreOf(m, view) }))
  }
  return rankMembers(current, view, section).map((member, i) => {
    const rank = i + 1
    const score = scoreOf(member, view)
    const prev = before ? beforeMap.get(member.id) ?? null : null
    return {
      member,
      rank,
      score,
      before: prev,
      gained: prev ? score - prev.score : 0,
      move: prev ? prev.rank - rank : null,
      isNew: !!before && !prev,
    }
  })
}

/** Destaques depois de revelar: quem mais subiu e quem mais pontos ganhou. */
export function rankingHighlights(rows: RankedRow[]): { climber: RankedRow | null; gainers: RankedRow[] } {
  let climber: RankedRow | null = null
  for (const row of rows) {
    if (row.move !== null && row.move > 0 && (!climber || row.move > climber.move!)) climber = row
  }
  const gainers = rows
    .filter((r) => r.gained > 0)
    .sort((a, b) => b.gained - a.gained || a.rank - b.rank)
    .slice(0, 3)
  return { climber, gainers }
}

// ── Datas (sempre na hora local do computador) ─────────────────────────

/** "YYYY-MM-DD" do dia local de `d`. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function yesterdayKey(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return localDayKey(d)
}

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Fim do dia local (23:59:59.999) em ISO — o "até quando" dos pontos do "antes". */
export function endOfDayIso(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
}

/** "ontem", "anteontem" ou "18 set". */
export function dayLabel(dayKey: string, now: Date = new Date()): string {
  if (dayKey === yesterdayKey(now)) return 'ontem'
  const twoDaysAgo = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2))
  if (dayKey === twoDaysAgo) return 'anteontem'
  if (dayKey === localDayKey(now)) return 'hoje'
  const [y, m, d] = dayKey.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
