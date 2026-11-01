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

// ── Modo Famílias ──────────────────────────────────────────
// Como no Family Feud: as pessoas são divididas em "famílias" com um máximo de pessoas.
// Quem é da mesma família a sério (contas familiares) ou foi marcado "juntar" fica sempre
// junto; o resto preenche os lugares. Depois sorteia-se que famílias jogam.

/** Nomes das famílias (bíblicas) com emoji e cor para o projetor. */
export const FAMILY_PRESETS: { name: string; emoji: string; color: string }[] = [
  { name: 'Família de Noé', emoji: '🕊️', color: '#0891b2' },
  { name: 'Família de Abraão', emoji: '⭐', color: '#f59e0b' },
  { name: 'Família de Jacó', emoji: '🪜', color: '#7c3aed' },
  { name: 'Família de José', emoji: '🌈', color: '#db2777' },
  { name: 'Família de Moisés', emoji: '🔥', color: '#dc2626' },
  { name: 'Família de Davi', emoji: '👑', color: '#ca8a04' },
  { name: 'Família de Daniel', emoji: '🦁', color: '#ea580c' },
  { name: 'Família de Rute', emoji: '🌾', color: '#65a30d' },
  { name: 'Família de Ester', emoji: '💎', color: '#2563eb' },
  { name: 'Família de Josué', emoji: '🎺', color: '#15803d' },
  { name: 'Família de Samuel', emoji: '🪔', color: '#a16207' },
  { name: 'Família de Elias', emoji: '☁️', color: '#475569' },
]

export const MIN_FAMILY_SIZE = 2
export const MAX_FAMILY_SIZE = 12

/** Quantas famílias para um máximo de `maxSize` pessoas cada (nunca menos de 2). */
export function familiesCount(people: number, maxSize: number): number {
  return Math.max(MIN_TEAMS, Math.min(FAMILY_PRESETS.length, Math.ceil(people / Math.max(1, maxSize))))
}

/**
 * Junta em blocos quem tem de ficar junto (só quem está em `people`). Os grupos podem
 * sobrepor-se (ex.: família da conta + um par "juntar" à mão): ficam todos num só bloco.
 * Quem não está em nenhum grupo fica num bloco sozinho.
 */
export function togetherBlocks(people: string[], groups: string[][]): string[][] {
  const present = new Set(people)
  const parent = new Map(people.map((id) => [id, id]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  for (const g of groups) {
    const ids = g.filter((id) => present.has(id))
    for (let i = 1; i < ids.length; i++) parent.set(find(ids[i]), find(ids[0]))
  }
  const blocks = new Map<string, string[]>()
  for (const id of people) {
    const r = find(id)
    blocks.set(r, [...(blocks.get(r) ?? []), id])
  }
  return [...blocks.values()]
}

export type FamiliesResult = {
  groups: string[][]
  /** Famílias a sério maiores do que o máximo, que tiveram de ser separadas. */
  split: string[][]
}

/**
 * Forma as famílias: os blocos (quem fica junto) entram primeiro, dos maiores para os mais
 * pequenos, onde ainda cabem; depois cada pessoa sozinha vai para a família mais pequena
 * (com o mesmo equilíbrio do formTeams). Várias tentativas ao acaso, fica a melhor.
 */
export function formFamilies(
  people: TeamPerson[],
  maxSize: number,
  together: string[][],
  opts: BalanceOptions,
  avoidPairs: [string, string][] = [],
  { attempts = 120, rnd = Math.random }: { attempts?: number; rnd?: () => number } = {},
): FamiliesResult {
  const size = Math.max(1, maxSize)
  const k = Math.min(familiesCount(people.length, size), Math.max(1, people.length))
  const cap = Math.ceil(people.length / k)
  const avoid = new Set(avoidPairs.map(([a, b]) => pairKey(a, b)))
  const byId = new Map(people.map((p) => [p.id, p]))

  const split: string[][] = []
  const blocks: string[][] = []
  for (const b of togetherBlocks(
    people.map((p) => p.id),
    together,
  )) {
    if (b.length <= size) blocks.push(b)
    else {
      split.push(b)
      for (let i = 0; i < b.length; i += size) blocks.push(b.slice(i, i + size))
    }
  }
  const multi = blocks.filter((b) => b.length > 1)
  const singles = blocks.filter((b) => b.length === 1).map((b) => byId.get(b[0])!)

  let best: string[][] = []
  let bestScore = Infinity
  for (let attempt = 0; attempt < attempts; attempt++) {
    const fams: string[][] = Array.from({ length: k }, () => [])
    const stats: Stats[] = Array.from({ length: k }, emptyStats)
    const put = (i: number, p: TeamPerson) => {
      fams[i].push(p.id)
      add(stats[i], p)
    }

    // 1) Famílias a sério / "juntar": as maiores primeiro, onde ainda caibam inteiras
    // (de preferência sem passar o tamanho igual para todos; senão, sem passar o máximo)
    const order = shuffle(multi, rnd).sort((a, b) => b.length - a.length)
    const all = stats.map((_, i) => i)
    for (const b of order) {
      const even = all.filter((i) => stats[i].size + b.length <= cap)
      const fits = even.length ? even : all.filter((i) => stats[i].size + b.length <= size)
      const pool = fits.length ? fits : all
      const min = Math.min(...pool.map((i) => stats[i].size))
      const pick = shuffle(
        pool.filter((i) => stats[i].size === min),
        rnd,
      )[0]
      b.forEach((id) => put(pick, byId.get(id)!))
    }

    // 2) Quem está sozinho preenche as mais pequenas (como no formTeams)
    let rest = shuffle(singles, rnd)
    if (opts.age) {
      const key = new Map(rest.map((p) => [p.id, (p.age ?? 12) + (rnd() - 0.5) * 3]))
      rest = rest.sort((a, b) => key.get(b.id)! - key.get(a.id)!)
    }
    if (opts.leaders) rest = [...rest.filter((p) => p.leader), ...rest.filter((p) => !p.leader)]
    for (const p of rest) {
      const min = Math.min(...stats.map((s) => s.size))
      let pick = -1
      let pickCost = Infinity
      for (const i of shuffle(
        stats.map((_, i) => i).filter((i) => stats[i].size === min),
        rnd,
      )) {
        const c = placementCost(p, stats[i], fams[i], opts, avoid)
        if (c < pickCost) {
          pick = i
          pickCost = c
        }
      }
      put(pick, p)
    }

    const score = scoreTeams(fams, byId, opts, avoid) + spread(fams.map((f) => f.length)) * 200
    if (score < bestScore) {
      best = fams
      bestScore = score
    }
  }
  return { groups: best, split }
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

/** Famílias sorteadas para jogar. O `id` muda a cada sorteio (o projetor volta a animar). */
export type TeamsMatch = { id: string; teamIds: string[] }

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
  /** 'families' = Modo Famílias (o projetor diz "Famílias"). */
  mode?: 'teams' | 'families'
  /** Famílias que vão jogar (Modo Famílias). */
  match?: TeamsMatch | null
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
