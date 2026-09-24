// Formador de equipas (Ferramentas da gestão): lógica pura, partilhada entre o controlo e o projetor.

import { genderInfo } from '@/utils/trips'
import type { RaffleEntry, RaffleMember } from '@/utils/raffle'
import type { Gender } from '@/utils/name-gender'

export type TeamMember = RaffleMember & { birth_date: string | null; gender: Gender | null }

/** Pessoa a distribuir (membro ou visita escrita à mão). */
export type TeamPerson = RaffleEntry & {
  gender: Gender | null
  section: string | null
  /** Idade em anos (null = desconhecida, ex.: visitas). */
  age: number | null
  leader: boolean
}

export type Team = {
  id: string
  name: string
  emoji: string
  color: string
  memberIds: string[]
}

export type BalanceOptions = { age: boolean; gender: boolean; leaders: boolean }

/** Nomes das equipas (animais) com emoji e cor para o projetor. */
export const TEAM_PRESETS: { name: string; emoji: string; color: string }[] = [
  { name: 'Leões', emoji: '🦁', color: '#f59e0b' },
  { name: 'Águias', emoji: '🦅', color: '#3b82f6' },
  { name: 'Lobos', emoji: '🐺', color: '#64748b' },
  { name: 'Ursos', emoji: '🐻', color: '#a16207' },
  { name: 'Tigres', emoji: '🐯', color: '#ea580c' },
  { name: 'Raposas', emoji: '🦊', color: '#dc2626' },
  { name: 'Corujas', emoji: '🦉', color: '#7c3aed' },
  { name: 'Golfinhos', emoji: '🐬', color: '#0891b2' },
  { name: 'Panteras', emoji: '🐆', color: '#171717' },
  { name: 'Javalis', emoji: '🐗', color: '#78350f' },
  { name: 'Tubarões', emoji: '🦈', color: '#1e40af' },
  { name: 'Búfalos', emoji: '🐃', color: '#15803d' },
]

export const MIN_TEAMS = 2
export const MAX_TEAM_COUNT = TEAM_PRESETS.length

export function ageFrom(birthDate: string | null, now = new Date()): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  let age = now.getFullYear() - b.getUTCFullYear()
  if (now.getMonth() < b.getUTCMonth() || (now.getMonth() === b.getUTCMonth() && now.getDate() < b.getUTCDate())) age--
  return age
}

/** Nome mostrado no cronómetro (emoji + nome). */
export function teamLabel(t: Pick<Team, 'name' | 'emoji'>): string {
  return `${t.emoji} ${t.name}`.trim()
}

/** Quantas equipas para "N pessoas por equipa" (arredonda; nunca menos de 2). */
export function teamsForSize(people: number, perTeam: number): number {
  return Math.max(MIN_TEAMS, Math.min(MAX_TEAM_COUNT, Math.round(people / Math.max(1, perTeam))))
}

/** Chave de um par "não juntar" (independente da ordem). */
export function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type Stats = { size: number; m: number; f: number; leaders: number; ageSum: number; ageN: number; sections: Map<string, number> }

function emptyStats(): Stats {
  return { size: 0, m: 0, f: 0, leaders: 0, ageSum: 0, ageN: 0, sections: new Map() }
}

function genderOf(p: TeamPerson): Gender | null {
  if (p.gender) return p.gender
  return null
}

/**
 * Custo de pôr `p` numa equipa (menor = melhor). Os tamanhos ficam sempre equilibrados
 * (só se escolhe entre as equipas mais pequenas); isto decide ENTRE essas.
 */
function placementCost(p: TeamPerson, s: Stats, members: string[], opts: BalanceOptions, avoid: Set<string>): number {
  let cost = 0
  for (const id of members) if (avoid.has(pairKey(p.id, id))) cost += 1000
  if (opts.leaders && p.leader) cost += s.leaders * 50
  const g = genderOf(p)
  if (opts.gender && g) cost += (g === 'm' ? s.m : s.f) * 10
  if (opts.age && p.section) cost += (s.sections.get(p.section) ?? 0) * 6
  if (opts.age && p.age !== null && s.ageN > 0) {
    // Prefere a equipa cuja média de idades está mais longe da idade desta pessoa (mistura novos e velhos)
    cost -= Math.min(10, Math.abs(s.ageSum / s.ageN - p.age)) * 0.8
  }
  return cost
}

function add(s: Stats, p: TeamPerson) {
  s.size++
  const g = genderOf(p)
  if (g === 'm') s.m++
  if (g === 'f') s.f++
  if (p.leader) s.leaders++
  if (p.age !== null) {
    s.ageSum += p.age
    s.ageN++
  }
  if (p.section) s.sections.set(p.section, (s.sections.get(p.section) ?? 0) + 1)
}

function spread(values: number[]): number {
  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
}

/** Nota de uma distribuição (menor = mais equilibrada). */
export function scoreTeams(teams: string[][], byId: Map<string, TeamPerson>, opts: BalanceOptions, avoid: Set<string>): number {
  let score = conflictCount(teams, avoid) * 10_000
  const stats = teams.map((ids) => {
    const s = emptyStats()
    ids.forEach((id) => {
      const p = byId.get(id)
      if (p) add(s, p)
    })
    return s
  })
  if (opts.leaders) score += spread(stats.map((s) => s.leaders)) * 40
  if (opts.gender) score += (spread(stats.map((s) => s.m)) + spread(stats.map((s) => s.f))) * 12
  if (opts.age) {
    const avgs = stats.filter((s) => s.ageN > 0).map((s) => s.ageSum / s.ageN)
    score += spread(avgs) * 8
    const sections = new Set(stats.flatMap((s) => [...s.sections.keys()]))
    for (const sec of sections) score += spread(stats.map((s) => s.sections.get(sec) ?? 0)) * 5
  }
  return score
}

export function conflictCount(teams: string[][], avoid: Set<string>): number {
  let n = 0
  for (const ids of teams)
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (avoid.has(pairKey(ids[i], ids[j]))) n++
  return n
}

/**
 * Forma `count` equipas equilibradas. Faz várias tentativas com ordens ao acaso e fica
 * com a mais equilibrada — assim cada "formar de novo" dá equipas diferentes.
 */
export function formTeams(
  people: TeamPerson[],
  count: number,
  opts: BalanceOptions,
  avoidPairs: [string, string][] = [],
  { attempts = 120, rnd = Math.random }: { attempts?: number; rnd?: () => number } = {},
): string[][] {
  const k = Math.max(1, Math.min(count, Math.max(1, people.length)))
  const avoid = new Set(avoidPairs.map(([a, b]) => pairKey(a, b)))
  const byId = new Map(people.map((p) => [p.id, p]))
  let best: string[][] = []
  let bestScore = Infinity

  for (let attempt = 0; attempt < attempts; attempt++) {
    let order = shuffle(people, rnd)
    // Dirigentes primeiro (para se espalharem) e, com idades, dos mais velhos para os mais novos
    // em "blocos" (cada volta enche uma pessoa por equipa → mistura idades). O ruído de ±1,5 anos
    // faz com que "formar de novo" dê equipas diferentes mesmo com idades todas distintas.
    if (opts.age) {
      const key = new Map(order.map((p) => [p.id, (p.age ?? 12) + (rnd() - 0.5) * 3]))
      order = order.sort((a, b) => key.get(b.id)! - key.get(a.id)!)
    }
    if (opts.leaders) order = [...order.filter((p) => p.leader), ...order.filter((p) => !p.leader)]

    const teams: string[][] = Array.from({ length: k }, () => [])
    const stats: Stats[] = Array.from({ length: k }, emptyStats)
    for (const p of order) {
      const min = Math.min(...stats.map((s) => s.size))
      const candidates = shuffle(
        stats.map((s, i) => i).filter((i) => stats[i].size === min),
        rnd,
      )
      let pick = candidates[0]
      let pickCost = Infinity
      for (const i of candidates) {
        const c = placementCost(p, stats[i], teams[i], opts, avoid)
        if (c < pickCost) {
          pick = i
          pickCost = c
        }
      }
      teams[pick].push(p.id)
      add(stats[pick], p)
    }

    const score = scoreTeams(teams, byId, opts, avoid)
    if (score < bestScore) {
      best = teams
      bestScore = score
    }
  }
  return best
}

/** Resumo de uma equipa para mostrar ao lado do nome. */
export function teamSummary(ids: string[], byId: Map<string, TeamPerson>) {
  let m = 0
  let f = 0
  let leaders = 0
  let ageSum = 0
  let ageN = 0
  for (const id of ids) {
    const p = byId.get(id)
    if (!p) continue
    const g = genderOf(p)
    if (g === 'm') m++
    if (g === 'f') f++
    if (p.leader) leaders++
    if (p.age !== null) {
      ageSum += p.age
      ageN++
    }
  }
  return { m, f, leaders, avgAge: ageN ? Math.round((ageSum / ageN) * 10) / 10 : null }
}

/** Pessoa a partir de um membro: sexo (indicado ou palpite pelo nome), idade e se é da liderança. */
export function personFromMember(m: TeamMember, entry: RaffleEntry): TeamPerson {
  return {
    ...entry,
    gender: genderInfo(m).gender,
    section: m.section,
    age: ageFrom(m.birth_date),
    leader: m.role === 'coordenador' || m.role === 'dirigente' || !!m.helper_role,
  }
}

// ── Projetor ────────────────────────────────────────────────

export type TeamsScreenTeam = { id: string; name: string; emoji: string; color: string; members: RaffleEntry[] }

/** Estado sincronizado com o projetor (tabela `team_screens.state`). */
export type TeamsScreenState = {
  title: string | null
  /** Pessoas em jogo antes de formar (ecrã de espera). */
  peopleCount: number
  teams: TeamsScreenTeam[]
  /** Muda a cada "Revelar no projetor" → o projetor faz a animação. null = ainda não revelado. */
  revealId: string | null
  /** Última formação (para o Cronómetro ir buscar os nomes). */
  formedAt: number | null
}

export type TeamsLocalMessage =
  | { type: 'hello' }
  | { type: 'ping' }
  | { type: 'bye'; from: 'projector' | 'controller' }
  | { type: 'state'; state: TeamsScreenState }

export function teamsLocalChannelName(userId: string) {
  return `teams-local-${userId}`
}

export const TEAMS_PATH = '/admin/ferramentas/equipas'
export const TEAMS_PROJECTOR_PATH = '/admin/ferramentas/equipas/projetor'
export const TEAMS_PROJECTOR_WINDOW_NAME = 'equipas-projetor'

/** Últimas equipas formadas neste browser (para o Cronómetro). */
export function lastTeamsKey(userId: string) {
  return `teams:last:${userId}`
}

export type LastTeams = { at: number; names: string[] }

/** Ordem da revelação: 1.º de cada equipa, depois o 2.º de cada, … */
export function revealOrder(teams: { members: unknown[] }[]): [number, number][] {
  const max = Math.max(0, ...teams.map((t) => t.members.length))
  const out: [number, number][] = []
  for (let j = 0; j < max; j++) teams.forEach((t, i) => j < t.members.length && out.push([i, j]))
  return out
}
