// Tendas e boleias (Ferramentas da gestão): tipos e lógica pura da distribuição.

import { detectGender, type Gender } from '@/utils/name-gender'
import { SECTION_LABELS } from '@/utils/permissions'

export type TripMember = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  section: string | null
  leadership_section: string | null
  helper_role: string | null
  helper_section: string | null
  birth_date: string | null
  /** Escolhido no onboarding; `null` = conta antiga que ainda não indicou (usa-se o palpite pelo nome). */
  gender: Gender | null
}

export type TripEvent = {
  id: string
  title: string
  start_at: string
  end_at: string | null
  target_section: string | null
  location: string | null
  rsvp_enabled?: boolean | null
}

export type TentKind = 'm' | 'f' | 'misto'
export type TripDirection = 'ida' | 'volta'

export type TripTent = {
  id: string
  name: string
  kind: TentKind
  capacity: number
  members: { id: string; responsible: boolean }[]
}

export type TripCar = {
  id: string
  direction: TripDirection
  /** Condutor escrito à mão (ex.: "Pai do João"), quando não é alguém da lista. */
  driver: string
  /** Condutor que é um membro da saída (desbravador ou líder com carro). Tem prioridade sobre `driver`. */
  driverId?: string | null
  /** Lugares para passageiros (sem contar o condutor). */
  seats: number
  meetingPoint: string
  /** 'AAAA-MM-DDTHH:MM' (hora local, como o input datetime-local) ou ''. */
  departAt: string
  passengers: string[]
}

/** Rascunho guardado em `trip_plans.draft`. */
export type TripPlanData = {
  v: 1
  tents: TripTent[]
  cars: TripCar[]
  /** Membros acrescentados à mão (além de quem disse "Vou" e das presenças do evento). */
  extraIds: string[]
}

/** Versão publicada (`trip_plans.published`): o rascunho + nomes para os membros verem. */
export type TripPublished = TripPlanData & { names: Record<string, string> }

export const EMPTY_PLAN: TripPlanData = { v: 1, tents: [], cars: [], extraIds: [] }

export const TENT_KIND_LABELS: Record<TentKind, string> = { m: 'Rapazes', f: 'Raparigas', misto: 'Mista' }
export const DIRECTION_LABELS: Record<TripDirection, string> = { ida: 'Ida', volta: 'Volta' }

export function normalizePlan(raw: unknown): TripPlanData {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<TripPlanData>
  return {
    v: 1,
    tents: Array.isArray(p.tents) ? p.tents : [],
    cars: Array.isArray(p.cars) ? p.cars : [],
    extraIds: Array.isArray(p.extraIds) ? p.extraIds : [],
  }
}

/** Sexo a usar: o confirmado, ou o palpite pelo primeiro nome. */
export function genderInfo(m: Pick<TripMember, 'gender' | 'full_name'>): { gender: Gender; confirmed: boolean } {
  if (m.gender === 'm' || m.gender === 'f') return { gender: m.gender, confirmed: true }
  return { gender: detectGender(m.full_name || ''), confirmed: false }
}

/** Dirigente, coordenador ou ajudante (entram à parte no preenchimento automático). */
export function isLeader(m: Pick<TripMember, 'role' | 'helper_role'>): boolean {
  return m.role === 'coordenador' || m.role === 'dirigente' || !!m.helper_role
}

const SECTION_ORDER = Object.keys(SECTION_LABELS)

function sectionRank(s: string | null): number {
  const i = s ? SECTION_ORDER.indexOf(s) : -1
  return i === -1 ? SECTION_ORDER.length : i
}

/** Ordem de preenchimento: por secção e, dentro dela, por idade (mais novos primeiro). */
export function fillOrder(a: TripMember, b: TripMember): number {
  const s = sectionRank(a.section) - sectionRank(b.section)
  if (s !== 0) return s
  const da = a.birth_date || ''
  const db = b.birth_date || ''
  if (da !== db) return da < db ? 1 : -1
  return (a.full_name || '').localeCompare(b.full_name || '', 'pt')
}

type Group = { id: string; capacity: number; ids: string[] }

/**
 * Distribui `people` pelos grupos com lugar livre, tentando juntar a mesma secção:
 *   1. um grupo que já tenha alguém da mesma secção;
 *   2. senão um grupo vazio (começa um novo "bloco" dessa secção);
 *   3. senão o grupo com mais lugares livres.
 * Devolve os grupos preenchidos e quem ficou sem lugar.
 */
export function fillGroups(
  groups: Group[],
  people: TripMember[],
  sectionOf: (id: string) => string | null,
): { groups: Group[]; unplaced: TripMember[] } {
  const out = groups.map((g) => ({ ...g, ids: [...g.ids] }))
  const unplaced: TripMember[] = []
  for (const p of [...people].sort(fillOrder)) {
    const free = out.filter((g) => g.ids.length < g.capacity)
    if (free.length === 0) {
      unplaced.push(p)
      continue
    }
    const sameSection = free
      .map((g) => ({ g, n: g.ids.filter((id) => sectionOf(id) === p.section).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)[0]?.g
    const empty = free.find((g) => g.ids.length === 0)
    const roomiest = [...free].sort((a, b) => b.capacity - b.ids.length - (a.capacity - a.ids.length))[0]
    ;(sameSection ?? empty ?? roomiest).ids.push(p.id)
  }
  return { groups: out, unplaced }
}

/**
 * Preenchimento automático das tendas: só tendas de Rapazes/Raparigas (as Mistas
 * ficam para o manual), cada pessoa na tenda do seu sexo.
 */
export function autoFillTents(tents: TripTent[], people: TripMember[]) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const sectionOf = (id: string) => byId.get(id)?.section ?? null
  const unplaced: TripMember[] = []
  let next = tents
  for (const g of ['m', 'f'] as const) {
    const who = people.filter((p) => genderInfo(p).gender === g)
    const groups = next
      .filter((t) => t.kind === g)
      .map((t) => ({ id: t.id, capacity: t.capacity, ids: t.members.map((m) => m.id) }))
    const res = fillGroups(groups, who, sectionOf)
    unplaced.push(...res.unplaced)
    const filled = new Map(res.groups.map((x) => [x.id, x.ids]))
    next = next.map((t) => {
      const ids = filled.get(t.id)
      if (!ids) return t
      const had = new Set(t.members.map((m) => m.id))
      return { ...t, members: [...t.members, ...ids.filter((id) => !had.has(id)).map((id) => ({ id, responsible: false }))] }
    })
  }
  return { tents: next, unplaced }
}

export function autoFillCars(cars: TripCar[], direction: TripDirection, people: TripMember[]) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const sectionOf = (id: string) => byId.get(id)?.section ?? null
  const groups = cars
    .filter((c) => c.direction === direction)
    .map((c) => ({ id: c.id, capacity: c.seats, ids: [...c.passengers] }))
  const res = fillGroups(groups, people, sectionOf)
  const filled = new Map(res.groups.map((x) => [x.id, x.ids]))
  return {
    cars: cars.map((c) => (filled.has(c.id) ? { ...c, passengers: filled.get(c.id)! } : c)),
    unplaced: res.unplaced,
  }
}

/** Problemas de uma tenda: excesso de pessoas e pessoas do outro sexo numa tenda M/F. */
export function tentIssues(tent: TripTent, byId: Map<string, TripMember>) {
  const over = Math.max(0, tent.members.length - tent.capacity)
  const wrongGender =
    tent.kind === 'misto'
      ? []
      : tent.members.filter((m) => {
          const p = byId.get(m.id)
          return p && genderInfo(p).gender !== tent.kind
        })
  return { over, wrongGender }
}

/** 'AAAA-MM-DDTHH:MM' na hora local, a partir de um ISO (para pré-preencher as boleias). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "sáb., 12/10 às 08:30" a partir do valor do datetime-local. */
export function formatDepart(value: string): string {
  if (!value) return ''
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return value
  const day = new Date(y, m - 1, d).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return time ? `${day} às ${time}` : day
}

export function newTripId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
