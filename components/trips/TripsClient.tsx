'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarDays,
  Car,
  Check,
  ChevronLeft,
  Copy,
  EyeOff,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Tent,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Wand2,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SECTION_LABELS, helperLabel } from '@/utils/permissions'
import { shortDisplayName } from '@/utils/display-name'
import type { Gender } from '@/utils/name-gender'
import {
  DIRECTION_LABELS,
  EMPTY_PLAN,
  TENT_KIND_LABELS,
  autoFillCars,
  autoFillTents,
  genderInfo,
  isLeader,
  newTripId,
  normalizePlan,
  tentIssues,
  toLocalInput,
  type TentKind,
  type TripCar,
  type TripDirection,
  type TripEvent,
  type TripMember,
  type TripPlanData,
  type TripPublished,
  type TripTent,
} from '@/utils/trips'
import { SECTION_DOT } from '@/app/admin/components/member-constants'
import { GenderBadge } from './GenderBadge'

type Tab = 'tents' | TripDirection
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

const LAST_EVENT_KEY = 'trips:last-event'
const SAVE_DELAY_MS = 900

function eventLabel(e: TripEvent) {
  const date = new Date(e.start_at).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })
  const sec = e.target_section ? SECTION_LABELS[e.target_section] || e.target_section : 'Geral'
  return `${date} · ${e.title} · ${sec}`
}

/** Evento a pré-escolher: o próximo (ou a decorrer há menos de 1 dia). */
function nextEvent(events: TripEvent[]): TripEvent | null {
  const from = Date.now() - 86400000
  return events.find((e) => new Date(e.end_at || e.start_at).getTime() >= from) ?? events[events.length - 1] ?? null
}

function stripNames(p: TripPublished | null): TripPlanData | null {
  if (!p) return null
  return normalizePlan(p)
}

/** Compara ignorando a ordem das chaves (o jsonb da BD não a guarda). */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b))
}

export function TripsClient({
  userId,
  members,
  events,
  canConfirmGender,
}: {
  userId: string
  members: TripMember[]
  events: TripEvent[]
  canConfirmGender: boolean
}) {
  const [supabase] = useState(() => createClient())

  // Sexo confirmado nesta sessão (antes de a página voltar a carregar).
  const [genderOverride, setGenderOverride] = useState<Record<string, Gender>>({})
  const memberList = useMemo(
    () => members.map((m) => (genderOverride[m.id] ? { ...m, gender: genderOverride[m.id] } : m)),
    [members, genderOverride],
  )
  const memberById = useMemo(() => new Map(memberList.map((m) => [m.id, m])), [memberList])

  const [eventId, setEventId] = useState<string | null>(null)
  const event = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId])

  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<TripPlanData>(EMPTY_PLAN)
  const [presentIds, setPresentIds] = useState<string[]>([])
  // "Vou / Não vou" que cada um disse no Painel (eventos que pedem confirmação)
  const [rsvpAnswers, setRsvpAnswers] = useState<Record<string, boolean>>({})
  const [published, setPublished] = useState<TripPublished | null>(null)
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const rowUpdatedAtRef = useRef<string | null>(null) // null = ainda não existe linha
  // Versão das edições vs. a última gravada (há alterações por gravar se editVersion > savedVersion).
  const editVersionRef = useRef(0)
  const savedVersionRef = useRef(0)
  const isDirty = () => editVersionRef.current > savedVersionRef.current
  // As gravações vão uma de cada vez (cada uma precisa do updated_at da anterior).
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const currentEventRef = useRef<string | null>(null)

  const [tab, setTab] = useState<Tab>('tents')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [autoLeaders, setAutoLeaders] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [busy, setBusy] = useState(false)

  // ── Carregar um evento ─────────────────────────────────────
  const loadEvent = useCallback(
    async (id: string) => {
      setEventId(id)
      currentEventRef.current = id
      setLoading(true)
      setSelectedId(null)
      await queueRef.current
      editVersionRef.current = 0
      savedVersionRef.current = 0
      try {
        localStorage.setItem(LAST_EVENT_KEY, id)
      } catch {
        /* sem armazenamento */
      }
      const [planRes, attRes, rsvpRes] = await Promise.all([
        supabase.from('trip_plans').select('draft, published, published_at, updated_at').eq('event_id', id).maybeSingle(),
        supabase.from('event_attendance').select('user_id').eq('event_id', id).in('status', ['presente', 'atrasado']),
        supabase.from('event_rsvps').select('user_id, going').eq('event_id', id),
      ])
      if (currentEventRef.current !== id) return // entretanto escolheu outro evento
      setLoading(false)
      if (planRes.error) {
        toast.error('Não foi possível carregar a distribuição.')
        setSaveState('error')
        return
      }
      const row = planRes.data
      rowUpdatedAtRef.current = row?.updated_at ?? null
      setPlan(row ? normalizePlan(row.draft) : EMPTY_PLAN)
      setPublished((row?.published as TripPublished | null) ?? null)
      setPublishedAt(row?.published_at ?? null)
      setSaveState(row ? 'saved' : 'idle')
      setPresentIds((attRes.data || []).map((r) => r.user_id as string))
      setRsvpAnswers(Object.fromEntries((rsvpRes.data || []).map((r) => [r.user_id as string, r.going as boolean])))
    },
    [supabase],
  )

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(LAST_EVENT_KEY)
    } catch {
      /* sem armazenamento */
    }
    const ev = (saved && events.find((e) => e.id === saved)) || nextEvent(events)
    if (ev) loadEvent(ev.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Guardar (rascunho) ─────────────────────────────────────
  /** Grava o rascunho; com `publish` também publica (ou despublica com `null`). */
  const doPersist = useCallback(
    async (evId: string, data: TripPlanData, version: number, publish?: TripPublished | null) => {
      if (currentEventRef.current !== evId) return false
      setSaveState('saving')
      const now = new Date().toISOString()
      const fields: Record<string, unknown> = { draft: data, updated_by: userId, updated_at: now }
      if (publish !== undefined) {
        fields.published = publish
        fields.published_at = publish ? now : null
      }
      let res
      if (rowUpdatedAtRef.current === null) {
        res = await supabase
          .from('trip_plans')
          .insert({ event_id: evId, ...fields })
          .select('updated_at')
          .maybeSingle()
      } else {
        // Só grava se ninguém mudou entretanto (senão perdia-se o trabalho da outra pessoa).
        res = await supabase
          .from('trip_plans')
          .update(fields)
          .eq('event_id', evId)
          .eq('updated_at', rowUpdatedAtRef.current)
          .select('updated_at')
          .maybeSingle()
      }
      if (currentEventRef.current !== evId) return false
      if (res.error?.code === '23505' || (!res.error && !res.data)) {
        setSaveState('conflict')
        return false
      }
      if (res.error) {
        console.warn('trip_plans:', res.error.message)
        setSaveState('error')
        return false
      }
      rowUpdatedAtRef.current = res.data!.updated_at
      savedVersionRef.current = Math.max(savedVersionRef.current, version)
      setSaveState(isDirty() ? 'saving' : 'saved')
      if (publish !== undefined) {
        setPublished(publish)
        setPublishedAt(publish ? now : null)
      }
      return true
    },
    [supabase, userId],
  )

  const persist = useCallback(
    (data: TripPlanData, publish?: TripPublished | null): Promise<boolean> => {
      const evId = currentEventRef.current
      if (!evId) return Promise.resolve(false)
      const version = editVersionRef.current
      const run = queueRef.current.then(() => doPersist(evId, data, version, publish))
      queueRef.current = run.catch(() => false)
      return run
    },
    [doPersist],
  )

  useEffect(() => {
    if (!isDirty() || saveState === 'conflict') return
    const t = setTimeout(() => persist(plan), SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [plan, persist, saveState])

  // Aviso ao sair com alterações por gravar
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const edit = (fn: (p: TripPlanData) => TripPlanData) => {
    if (saveState === 'conflict') {
      toast.error('Outra pessoa alterou esta distribuição — recarrega antes de continuar.')
      return
    }
    editVersionRef.current += 1
    setPlan((p) => fn(p))
  }

  // ── Pessoas ────────────────────────────────────────────────
  const assignedIds = useMemo(() => {
    const s = new Set<string>()
    plan.tents.forEach((t) => t.members.forEach((m) => s.add(m.id)))
    plan.cars.forEach((c) => {
      c.passengers.forEach((id) => s.add(id))
      if (c.driverId) s.add(c.driverId)
    })
    return s
  }, [plan])

  // Quem vai: quem disse "Vou" no Painel e quem já tem presença marcada
  const goingIds = useMemo(
    () => [...Object.entries(rsvpAnswers).filter(([, g]) => g).map(([id]) => id), ...presentIds],
    [rsvpAnswers, presentIds],
  )
  const presentSet = useMemo(() => new Set(goingIds), [goingIds])
  const people = useMemo(() => {
    const ids = new Set([...goingIds, ...plan.extraIds, ...assignedIds])
    return memberList.filter((m) => ids.has(m.id)).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt'))
  }, [memberList, goingIds, plan.extraIds, assignedIds])

  const tentOf = useMemo(() => {
    const map = new Map<string, TripTent>()
    plan.tents.forEach((t) => t.members.forEach((m) => map.set(m.id, t)))
    return map
  }, [plan.tents])

  const carOf = useCallback(
    (dir: TripDirection) => {
      const map = new Map<string, TripCar>()
      plan.cars
        .filter((c) => c.direction === dir)
        .forEach((c) => {
          c.passengers.forEach((id) => map.set(id, c))
          if (c.driverId) map.set(c.driverId, c)
        })
      return map
    },
    [plan.cars],
  )

  const unassigned = useMemo(() => {
    if (tab === 'tents') return people.filter((p) => !tentOf.has(p.id))
    const cars = carOf(tab)
    return people.filter((p) => !cars.has(p.id))
  }, [tab, people, tentOf, carOf])

  const unconfirmed = people.filter((p) => !genderInfo(p).confirmed)

  const selected = selectedId ? memberById.get(selectedId) ?? null : null

  /** Tira uma pessoa do sítio atual no separador aberto (tenda, ou carro dessa direção). */
  const detach = (p: TripPlanData, id: string, where: Tab): TripPlanData =>
    where === 'tents'
      ? { ...p, tents: p.tents.map((t) => ({ ...t, members: t.members.filter((m) => m.id !== id) })) }
      : {
          ...p,
          cars: p.cars.map((c) =>
            c.direction === where
              ? { ...c, passengers: c.passengers.filter((x) => x !== id), driverId: c.driverId === id ? null : c.driverId ?? null }
              : c,
          ),
        }

  const moveToTent = (tentId: string) => {
    if (!selectedId) return
    const id = selectedId
    edit((p) => {
      const base = detach(p, id, 'tents')
      return { ...base, tents: base.tents.map((t) => (t.id === tentId ? { ...t, members: [...t.members, { id, responsible: false }] } : t)) }
    })
    setSelectedId(null)
  }

  const moveToCar = (carId: string) => {
    if (!selectedId || tab === 'tents') return
    const id = selectedId
    const dir = tab
    edit((p) => {
      const base = detach(p, id, dir)
      return { ...base, cars: base.cars.map((c) => (c.id === carId ? { ...c, passengers: [...c.passengers, id] } : c)) }
    })
    setSelectedId(null)
  }

  /** A pessoa escolhida passa a conduzir este carro (quem conduzia antes volta a "Sem carro"). */
  const makeDriver = (carId: string) => {
    if (!selectedId || tab === 'tents') return
    const id = selectedId
    const dir = tab
    edit((p) => {
      const base = detach(p, id, dir)
      return { ...base, cars: base.cars.map((c) => (c.id === carId ? { ...c, driverId: id } : c)) }
    })
    setSelectedId(null)
  }

  const clearDriver = (carId: string) =>
    edit((p) => ({ ...p, cars: p.cars.map((c) => (c.id === carId ? { ...c, driverId: null } : c)) }))

  const unassignSelected = () => {
    if (!selectedId) return
    const id = selectedId
    edit((p) => detach(p, id, tab))
    setSelectedId(null)
  }

  const removeFromList = (id: string) => {
    edit((p) => ({
      ...p,
      extraIds: p.extraIds.filter((x) => x !== id),
      tents: p.tents.map((t) => ({ ...t, members: t.members.filter((m) => m.id !== id) })),
      cars: p.cars.map((c) => ({
        ...c,
        passengers: c.passengers.filter((x) => x !== id),
        driverId: c.driverId === id ? null : c.driverId ?? null,
      })),
    }))
    setSelectedId(null)
  }

  const addExtra = (id: string) => {
    edit((p) => ({ ...p, extraIds: [...p.extraIds, id] }))
    setAddSearch('')
  }

  const addCandidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    if (!q) return []
    const inList = new Set(people.map((p) => p.id))
    return memberList
      .filter((m) => !inList.has(m.id))
      .filter((m) => (m.full_name || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q))
      .slice(0, 8)
  }, [addSearch, people, memberList])

  // ── Sexo (coordenação) ─────────────────────────────────────
  const setGender = async (ids: string[], g: Gender | null) => {
    if (ids.length === 0 || !g) return
    const prev = { ...genderOverride }
    setGenderOverride((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, g])) }))
    const { error } = await supabase.from('profiles').update({ gender: g }).in('id', ids)
    if (error) {
      setGenderOverride(prev)
      toast.error('Não foi possível guardar o sexo.')
    }
  }

  const confirmAllGuesses = async () => {
    const m = unconfirmed.filter((p) => genderInfo(p).gender === 'm').map((p) => p.id)
    const f = unconfirmed.filter((p) => genderInfo(p).gender === 'f').map((p) => p.id)
    setBusy(true)
    await Promise.all([setGender(m, 'm'), setGender(f, 'f')])
    setBusy(false)
    toast.success(`${m.length + f.length} confirmados`)
  }

  // ── Tendas ─────────────────────────────────────────────────
  const addTent = (kind: TentKind) => {
    edit((p) => {
      const n = p.tents.length + 1
      return { ...p, tents: [...p.tents, { id: newTripId(), name: `Tenda ${n}`, kind, capacity: 4, members: [] }] }
    })
  }
  const updateTent = (id: string, patch: Partial<TripTent>) =>
    edit((p) => ({ ...p, tents: p.tents.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  const removeTent = (id: string) => edit((p) => ({ ...p, tents: p.tents.filter((t) => t.id !== id) }))
  const toggleResponsible = (tentId: string, memberId: string) =>
    edit((p) => ({
      ...p,
      tents: p.tents.map((t) =>
        t.id === tentId
          ? { ...t, members: t.members.map((m) => (m.id === memberId ? { ...m, responsible: !m.responsible } : m)) }
          : t,
      ),
    }))

  const autoTents = () => {
    const who = unassigned.filter((p) => autoLeaders || !isLeader(p))
    if (!plan.tents.some((t) => t.kind !== 'misto')) {
      toast.error('Cria primeiro tendas de rapazes e/ou raparigas.')
      return
    }
    const res = autoFillTents(plan.tents, who)
    edit((p) => ({ ...p, tents: res.tents }))
    const placed = who.length - res.unplaced.length
    if (res.unplaced.length > 0) {
      const m = res.unplaced.filter((p) => genderInfo(p).gender === 'm').length
      const f = res.unplaced.length - m
      toast.warning(
        `${placed} distribuídos. Sem lugar: ${[m && `${m} rapaz${m === 1 ? '' : 'es'}`, f && `${f} rapariga${f === 1 ? '' : 's'}`]
          .filter(Boolean)
          .join(' e ')} — faltam tendas ou lugares.`,
      )
    } else toast.success(`${placed} distribuídos pelas tendas`)
  }

  // ── Carros ─────────────────────────────────────────────────
  const addCar = (dir: TripDirection) =>
    edit((p) => ({
      ...p,
      cars: [
        ...p.cars,
        {
          id: newTripId(),
          direction: dir,
          driver: '',
          seats: 4,
          meetingPoint: '',
          departAt: toLocalInput(dir === 'ida' ? event?.start_at ?? null : event?.end_at ?? null),
          passengers: [],
        },
      ],
    }))
  const updateCar = (id: string, patch: Partial<TripCar>) =>
    edit((p) => ({ ...p, cars: p.cars.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  const removeCar = (id: string) => edit((p) => ({ ...p, cars: p.cars.filter((c) => c.id !== id) }))

  const copyIdaToVolta = () =>
    edit((p) => ({
      ...p,
      cars: [
        ...p.cars,
        ...p.cars
          .filter((c) => c.direction === 'ida')
          .map((c) => ({
            ...c,
            id: newTripId(),
            direction: 'volta' as const,
            departAt: toLocalInput(event?.end_at ?? null),
            passengers: [...c.passengers],
          })),
      ],
    }))

  const autoCars = (dir: TripDirection) => {
    if (!plan.cars.some((c) => c.direction === dir)) {
      toast.error('Acrescenta primeiro os carros.')
      return
    }
    const res = autoFillCars(plan.cars, dir, unassigned)
    edit((p) => ({ ...p, cars: res.cars }))
    if (res.unplaced.length > 0) toast.warning(`${res.unplaced.length} ficaram sem lugar — faltam carros ou lugares.`)
    else toast.success(`${unassigned.length} distribuídos pelos carros`)
  }

  const clearTab = () => {
    if (!confirm(tab === 'tents' ? 'Tirar toda a gente das tendas?' : `Tirar toda a gente dos carros da ${DIRECTION_LABELS[tab].toLowerCase()}?`))
      return
    edit((p) =>
      tab === 'tents'
        ? { ...p, tents: p.tents.map((t) => ({ ...t, members: [] })) }
        : { ...p, cars: p.cars.map((c) => (c.direction === tab ? { ...c, passengers: [] } : c)) },
    )
  }

  // ── Publicar ───────────────────────────────────────────────
  const hasChangesToPublish = !!published && !sameJson(stripNames(published), plan)

  const publish = async () => {
    const ids = new Set<string>()
    plan.tents.forEach((t) => t.members.forEach((m) => ids.add(m.id)))
    plan.cars.forEach((c) => {
      c.passengers.forEach((id) => ids.add(id))
      if (c.driverId) ids.add(c.driverId)
    })
    if (ids.size === 0) {
      toast.error('Ainda não há ninguém distribuído.')
      return
    }
    const names = Object.fromEntries([...ids].map((id) => [id, shortDisplayName(memberById.get(id)?.full_name, 'Membro')]))
    setBusy(true)
    const ok = await persist(plan, { ...plan, names })
    setBusy(false)
    if (ok) toast.success('Publicado — cada participante já vê a sua tenda e boleia no Painel.')
  }

  const unpublish = async () => {
    if (!confirm('Esconder a distribuição dos membros?')) return
    setBusy(true)
    const ok = await persist(plan, null)
    setBusy(false)
    if (ok) toast.success('A distribuição deixou de estar visível para os membros.')
  }

  // ── Render ─────────────────────────────────────────────────
  const tentCount = plan.tents.length
  const carsOf = (dir: TripDirection) => plan.cars.filter((c) => c.direction === dir)
  const unassignedM = unassigned.filter((p) => genderInfo(p).gender === 'm').length

  const personChip = (p: TripMember, opts: { tent?: TripTent; responsible?: boolean } = {}) => {
    const g = genderInfo(p)
    const isSel = selectedId === p.id
    const leader = isLeader(p)
    const saidNo = rsvpAnswers[p.id] === false && !presentIds.includes(p.id)
    const noPresence = !presentSet.has(p.id) && !saidNo
    return (
      <div
        key={p.id}
        className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-left ring-1 ring-inset transition-colors ${
          isSel ? 'bg-blue-900 text-white ring-blue-900' : 'bg-white text-gray-900 ring-gray-200 hover:ring-blue-300'
        }`}
      >
        <button type="button" onClick={() => setSelectedId(isSel ? null : p.id)} className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${p.section ? SECTION_DOT[p.section] || 'bg-gray-300' : 'bg-gray-300'}`} />
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{shortDisplayName(p.full_name, 'Membro')}</span>
          {leader && (
            <span
              className={`flex-shrink-0 rounded px-1 text-[10px] font-bold ${isSel ? 'bg-white/20' : 'bg-violet-100 text-violet-700'}`}
              title={p.helper_role ? helperLabel(p) ?? '' : p.role === 'coordenador' ? 'Coordenação' : 'Dirigente'}
            >
              {p.helper_role ? 'Ajud.' : p.role === 'coordenador' ? 'Coord.' : 'Dir.'}
            </span>
          )}
          {noPresence && (
            <span
              className={`flex-shrink-0 rounded px-1 text-[10px] font-bold ${isSel ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}
              title="Acrescentado à mão (não disse que ia)"
            >
              extra
            </span>
          )}
          {saidNo && (
            <span
              className={`flex-shrink-0 rounded px-1 text-[10px] font-bold ${isSel ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}
              title="Disse no Painel que não ia"
            >
              disse que não
            </span>
          )}
        </button>
        {opts.tent && (
          <button
            type="button"
            onClick={() => toggleResponsible(opts.tent!.id, p.id)}
            className={`flex-shrink-0 rounded-md p-0.5 ${opts.responsible ? 'text-amber-500' : isSel ? 'text-white/40' : 'text-gray-300 hover:text-amber-400'}`}
            title={opts.responsible ? 'Responsável da tenda (carrega para tirar)' : 'Marcar como responsável da tenda'}
          >
            <Star className="h-4 w-4" fill={opts.responsible ? 'currentColor' : 'none'} />
          </button>
        )}
        <GenderBadge
          gender={g.gender}
          confirmed={g.confirmed}
          canEdit={canConfirmGender}
          onSet={(ng) => setGender([p.id], ng)}
        />
      </div>
    )
  }

  const saveLabel =
    saveState === 'saving'
      ? 'A guardar…'
      : saveState === 'saved'
        ? 'Guardado'
        : saveState === 'error'
          ? 'Erro ao guardar'
          : saveState === 'conflict'
            ? 'Alterado por outra pessoa'
            : 'Ainda sem nada guardado'

  return (
    <>
      <main className={`mx-auto max-w-5xl space-y-5 px-4 pt-6 ${selected ? 'pb-40' : 'pb-16'}`}>
        <div className="flex items-center gap-3">
          <Link href="/admin?tab=tools" className="text-slate-500 hover:text-slate-700" title="Voltar às Ferramentas">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Tent className="h-6 w-6 text-emerald-700" /> Tendas e boleias
          </h1>
        </div>

        {/* Evento + publicação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5 text-emerald-700" /> Evento
            </CardTitle>
            <CardDescription>
              As pessoas são quem disse &quot;Vou&quot; no Painel (e quem já tem presença marcada). O rascunho grava-se sozinho e os membros só veem depois de
              publicares.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">Não há eventos próximos que possas organizar.</p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={eventId ?? ''}
                  disabled={loading}
                  onChange={(e) => {
                    if (isDirty() && !confirm('Há alterações por guardar. Mudar de evento na mesma?')) return
                    if (e.target.value) loadEvent(e.target.value)
                  }}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {eventLabel(e)}
                    </option>
                  ))}
                </select>
                {eventId && (
                  <button
                    type="button"
                    onClick={() => loadEvent(eventId)}
                    disabled={loading}
                    title="Voltar a carregar (respostas, presenças e distribuição)"
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            )}

            {event && !loading && (
              <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex items-center gap-1.5 font-bold text-gray-800">
                    {saveState === 'saving' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    ) : saveState === 'saved' ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : saveState === 'error' || saveState === 'conflict' ? (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    ) : null}
                    {saveLabel}
                  </p>
                  <p className="text-xs text-gray-500">
                    {published
                      ? `Publicado ${publishedAt ? new Date(publishedAt).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}${
                          hasChangesToPublish ? ' · há alterações por publicar' : ' · os membros veem esta versão'
                        }`
                      : 'Ainda não publicado — os membros não veem nada.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {published && (
                    <button
                      type="button"
                      onClick={unpublish}
                      disabled={busy || saveState === 'conflict'}
                      className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <EyeOff className="h-4 w-4" /> Esconder
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={publish}
                    disabled={busy || saveState === 'conflict' || (!!published && !hasChangesToPublish)}
                    className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" /> {published ? 'Publicar alterações' : 'Publicar'}
                  </button>
                </div>
              </div>
            )}

            {saveState === 'conflict' && eventId && (
              <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-inset ring-red-200 sm:flex-row sm:items-center">
                <p className="flex-1">
                  Outra pessoa alterou esta distribuição enquanto a tinhas aberta. Recarrega para veres a versão dela (as tuas últimas
                  alterações perdem-se).
                </p>
                <button
                  type="button"
                  onClick={() => loadEvent(eventId)}
                  className="h-9 flex-shrink-0 rounded-lg bg-red-700 px-3 font-bold text-white hover:bg-red-600"
                >
                  Recarregar
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {event && !loading && (
          <>
            {/* Sexo por confirmar */}
            {unconfirmed.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200 sm:flex-row sm:items-center">
                <p className="flex-1">
                  <b>{unconfirmed.length}</b> {unconfirmed.length === 1 ? 'pessoa ainda não indicou' : 'pessoas ainda não indicaram'} o
                  sexo no perfil, por isso vale o palpite pelo nome (<span className="font-black">♂?</span>/
                  <span className="font-black">♀?</span>).{' '}
                  {canConfirmGender
                    ? 'Carrega no símbolo para o definires por elas.'
                    : 'Podem indicá-lo no perfil; a coordenação também o pode definir.'}
                </p>
                {canConfirmGender && (
                  <button
                    type="button"
                    onClick={confirmAllGuesses}
                    disabled={busy}
                    className="h-9 flex-shrink-0 rounded-lg bg-amber-500 px-3 font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    Os palpites estão certos, confirmar todos
                  </button>
                )}
              </div>
            )}

            {/* Separadores */}
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-gray-100 p-1">
              {(
                [
                  ['tents', Tent, 'Tendas', tentCount],
                  ['ida', Car, 'Ida', carsOf('ida').length],
                  ['volta', Car, 'Volta', carsOf('volta').length],
                ] as const
              ).map(([id, Icon, label, n]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTab(id)
                    setSelectedId(null)
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-bold transition-colors ${
                    tab === id ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${id === 'volta' ? '-scale-x-100' : ''}`} /> {label}
                  <span className="rounded-full bg-gray-200/80 px-1.5 text-[10px] text-gray-600">{n}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[20rem_1fr]">
              {/* Sem lugar */}
              <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-5 w-5 text-emerald-700" />
                      {tab === 'tents' ? 'Sem tenda' : 'Sem carro'}
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700">{unassigned.length}</span>
                    </CardTitle>
                    <CardDescription>
                      {people.length} no total
                      {tab === 'tents' && unassigned.length > 0 && ` · ${unassignedM} ♂ · ${unassigned.length - unassignedM} ♀`}. Toca numa
                      pessoa e depois no sítio para onde vai.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {people.length === 0 ? (
                      <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
                        {event.rsvp_enabled
                          ? 'Ainda ninguém disse que vai. Espera pelas respostas ou acrescenta pessoas em baixo.'
                          : 'Este evento não pede confirmação de presença. Liga-a em Gestão → Eventos → Editar, ou acrescenta pessoas em baixo.'}
                      </p>
                    ) : unassigned.length === 0 ? (
                      <p className="rounded-xl bg-emerald-50 px-3 py-4 text-center text-sm font-bold text-emerald-700">
                        Toda a gente tem {tab === 'tents' ? 'tenda' : 'lugar'} 🎉
                      </p>
                    ) : (
                      <div className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">{unassigned.map((p) => personChip(p))}</div>
                    )}

                    <div className="space-y-2 border-t border-gray-100 pt-3">
                      {tab === 'tents' ? (
                        <>
                          <button
                            type="button"
                            onClick={autoTents}
                            disabled={unassigned.length === 0}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                          >
                            <Wand2 className="h-4 w-4" /> Preencher automaticamente
                          </button>
                          <label className="flex items-center justify-between gap-2 text-xs text-gray-600">
                            <span>Incluir dirigentes e ajudantes no automático</span>
                            <Switch checked={autoLeaders} onCheckedChange={setAutoLeaders} />
                          </label>
                          <p className="text-[11px] text-gray-400">
                            Separa por sexo e junta a mesma secção. As tendas mistas ficam para preencheres à mão.
                          </p>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => autoCars(tab)}
                          disabled={unassigned.length === 0}
                          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                        >
                          <Wand2 className="h-4 w-4" /> Preencher automaticamente
                        </button>
                      )}
                    </div>

                    {/* Acrescentar à mão */}
                    <div className="space-y-2 border-t border-gray-100 pt-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Acrescentar alguém</p>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          value={addSearch}
                          onChange={(e) => setAddSearch(e.target.value)}
                          placeholder="Procurar membro que não disse que ia…"
                          className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm"
                        />
                      </div>
                      {addCandidates.length > 0 && (
                        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                          {addCandidates.map((m) => (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => addExtra(m.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                              >
                                <UserPlus className="h-4 w-4 text-emerald-700" />
                                <span className="min-w-0 flex-1 truncate font-bold">{m.full_name}</span>
                                <span className="text-[11px] text-gray-400">{m.section ? SECTION_LABELS[m.section] : ''}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {addSearch.trim() && addCandidates.length === 0 && <p className="text-xs text-gray-400">Ninguém encontrado.</p>}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Tendas / carros */}
              <div className="space-y-4">
                {tab === 'tents' ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {(['m', 'f', 'misto'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => addTent(k)}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                        >
                          <Plus className="h-4 w-4" /> Tenda {TENT_KIND_LABELS[k].toLowerCase()}
                        </button>
                      ))}
                      {plan.tents.some((t) => t.members.length > 0) && (
                        <button
                          type="button"
                          onClick={clearTab}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-gray-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <UserMinus className="h-4 w-4" /> Esvaziar tendas
                        </button>
                      )}
                    </div>
                    {plan.tents.length === 0 && (
                      <EmptyBox icon={<Tent className="h-8 w-8" />}>Cria as tendas que vão levar (e quantas pessoas cabem em cada).</EmptyBox>
                    )}
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {plan.tents.map((t) => (
                        <TentCard
                          key={t.id}
                          tent={t}
                          byId={memberById}
                          selected={selected}
                          onDrop={() => moveToTent(t.id)}
                          onChange={(patch) => updateTent(t.id, patch)}
                          onRemove={() => {
                            if (t.members.length > 0 && !confirm(`Apagar "${t.name}"? Quem lá está volta para "Sem tenda".`)) return
                            removeTent(t.id)
                          }}
                        >
                          {t.members.map((m) => {
                            const p = memberById.get(m.id)
                            return p ? personChip(p, { tent: t, responsible: m.responsible }) : null
                          })}
                        </TentCard>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addCar(tab)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                      >
                        <Plus className="h-4 w-4" /> Carro
                      </button>
                      {tab === 'volta' && carsOf('volta').length === 0 && carsOf('ida').length > 0 && (
                        <button
                          type="button"
                          onClick={copyIdaToVolta}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
                        >
                          <Copy className="h-4 w-4" /> Copiar carros e pessoas da ida
                        </button>
                      )}
                      {carsOf(tab).some((c) => c.passengers.length > 0) && (
                        <button
                          type="button"
                          onClick={clearTab}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-gray-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <UserMinus className="h-4 w-4" /> Esvaziar carros
                        </button>
                      )}
                    </div>
                    {carsOf(tab).length === 0 && (
                      <EmptyBox icon={<Car className="h-8 w-8" />}>
                        Acrescenta os carros da {DIRECTION_LABELS[tab].toLowerCase()}: quem conduz (alguém da lista ou escrito à mão), quantos
                        lugares livres, onde e a que horas se encontram.
                      </EmptyBox>
                    )}
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {carsOf(tab).map((c) => (
                        <CarCard
                          key={c.id}
                          car={c}
                          driverPerson={c.driverId ? memberById.get(c.driverId) ?? null : null}
                          selected={selected}
                          onDrop={() => moveToCar(c.id)}
                          onMakeDriver={() => makeDriver(c.id)}
                          onClearDriver={() => clearDriver(c.id)}
                          onChange={(patch) => updateCar(c.id, patch)}
                          onRemove={() => {
                            if ((c.passengers.length > 0 || c.driverId) && !confirm('Apagar este carro? Quem lá está volta para "Sem carro".')) return
                            removeCar(c.id)
                          }}
                        >
                          {c.passengers.map((id) => {
                            const p = memberById.get(id)
                            return p ? personChip(p) : null
                          })}
                        </CarCard>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </main>

      {/* Pessoa escolhida */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm">
              <Sparkles className="mr-1 inline h-4 w-4 text-emerald-600" />
              <b>{shortDisplayName(selected.full_name, 'Membro')}</b>:{' '}
              {tab === 'tents' ? 'toca na tenda para onde vai.' : 'toca no carro para onde vai, ou em "Pôr a conduzir".'}
              {tab === 'tents' && tentOf.get(selected.id) && <span className="text-gray-500"> (está na {tentOf.get(selected.id)!.name})</span>}
            </p>
            {(tab === 'tents' ? tentOf.has(selected.id) : carOf(tab).has(selected.id)) && (
              <button
                type="button"
                onClick={unassignSelected}
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                {tab === 'tents' ? 'Tirar da tenda' : 'Tirar do carro'}
              </button>
            )}
            {!presentSet.has(selected.id) && plan.extraIds.includes(selected.id) && (
              <button
                type="button"
                onClick={() => removeFromList(selected.id)}
                className="h-10 rounded-xl border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50"
              >
                Tirar da saída
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
              title="Cancelar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function EmptyBox({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
      <span className="text-gray-300">{icon}</span>
      {children}
    </div>
  )
}

function MiniStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-7 text-center font-black tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/** Zona onde se larga a pessoa escolhida (toque). */
function DropTarget({
  selected,
  full,
  warning,
  onDrop,
  already,
}: {
  selected: TripMember | null
  full: boolean
  warning: string | null
  onDrop: () => void
  already: boolean
}) {
  if (!selected || already) return null
  return (
    <button
      type="button"
      onClick={onDrop}
      disabled={full}
      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-bold transition-colors ${
        full
          ? 'border-gray-200 text-gray-400'
          : warning
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
      }`}
    >
      {full ? 'Sem lugar' : warning ? `Pôr aqui na mesma (${warning})` : `Pôr aqui ${shortDisplayName(selected.full_name, 'Membro')}`}
    </button>
  )
}

function TentCard({
  tent,
  byId,
  selected,
  onDrop,
  onChange,
  onRemove,
  children,
}: {
  tent: TripTent
  byId: Map<string, TripMember>
  selected: TripMember | null
  onDrop: () => void
  onChange: (patch: Partial<TripTent>) => void
  onRemove: () => void
  children: React.ReactNode
}) {
  const issues = tentIssues(tent, byId)
  const selGender = selected ? genderInfo(selected).gender : null
  const mismatch = selected && tent.kind !== 'misto' && selGender !== tent.kind
  const tone =
    tent.kind === 'm' ? 'border-t-sky-400' : tent.kind === 'f' ? 'border-t-pink-400' : 'border-t-violet-400'
  return (
    <div className={`space-y-3 rounded-2xl border border-t-4 border-gray-200 bg-white p-4 shadow-sm ${tone}`}>
      <div className="flex items-center gap-2">
        <input
          value={tent.name}
          onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })}
          className="h-9 min-w-0 flex-1 rounded-lg border border-transparent px-2 font-black text-gray-900 hover:border-gray-200 focus:border-gray-300"
          aria-label="Nome da tenda"
        />
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-black ${
            issues.over > 0 ? 'bg-red-100 text-red-700' : tent.members.length === tent.capacity ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {tent.members.length}/{tent.capacity}
        </span>
        <button type="button" onClick={onRemove} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Apagar tenda">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {(['m', 'f', 'misto'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ kind: k })}
              className={`rounded-md px-2 py-1 text-xs font-bold ${tent.kind === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              {TENT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-gray-500">
          Cabem <MiniStepper value={tent.capacity} min={1} max={20} onChange={(capacity) => onChange({ capacity })} />
        </span>
      </div>
      {(issues.over > 0 || issues.wrongGender.length > 0) && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {issues.over > 0 && `${issues.over} a mais. `}
            {issues.wrongGender.length > 0 &&
              `${issues.wrongGender.map((m) => shortDisplayName(byId.get(m.id)?.full_name, 'Membro')).join(', ')} não ${
                issues.wrongGender.length === 1 ? 'é' : 'são'
              } ${tent.kind === 'm' ? 'rapaz' : 'rapariga'}${issues.wrongGender.length === 1 ? '' : 's'}.`}
          </span>
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {children}
        {tent.members.length === 0 && !selected && <p className="py-2 text-center text-xs text-gray-400">Vazia</p>}
      </div>
      <DropTarget
        selected={selected}
        full={tent.members.length >= tent.capacity}
        warning={mismatch ? `é ${tent.kind === 'm' ? 'tenda de rapazes' : 'tenda de raparigas'}` : null}
        onDrop={onDrop}
        already={!!selected && tent.members.some((m) => m.id === selected.id)}
      />
    </div>
  )
}

function CarCard({
  car,
  driverPerson,
  selected,
  onDrop,
  onMakeDriver,
  onClearDriver,
  onChange,
  onRemove,
  children,
}: {
  car: TripCar
  /** Condutor que é alguém da lista (desbravador ou líder). */
  driverPerson: TripMember | null
  selected: TripMember | null
  onDrop: () => void
  onMakeDriver: () => void
  onClearDriver: () => void
  onChange: (patch: Partial<TripCar>) => void
  onRemove: () => void
  children: React.ReactNode
}) {
  const over = car.passengers.length > car.seats
  const selectedIsDriver = !!selected && car.driverId === selected.id
  return (
    <div className="space-y-3 rounded-2xl border border-t-4 border-gray-200 border-t-emerald-500 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Car className="h-5 w-5 flex-shrink-0 text-emerald-700" />
        {driverPerson ? (
          <span className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-emerald-50 px-2 ring-1 ring-inset ring-emerald-200">
            <span className="flex-shrink-0 text-[10px] font-black uppercase tracking-wider text-emerald-700">Conduz</span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{shortDisplayName(driverPerson.full_name, 'Membro')}</span>
            <button
              type="button"
              onClick={onClearDriver}
              className="flex-shrink-0 rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
              title="Deixar de conduzir (volta para Sem carro)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <input
            value={car.driver}
            onChange={(e) => onChange({ driver: e.target.value.slice(0, 50) })}
            placeholder="Quem conduz (ex.: Pai do João)"
            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-2 text-sm font-bold text-gray-900"
            aria-label="Condutor"
          />
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-black ${
            over ? 'bg-red-100 text-red-700' : car.passengers.length === car.seats ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {car.passengers.length}/{car.seats}
        </span>
        <button type="button" onClick={onRemove} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Apagar carro">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={car.meetingPoint}
          onChange={(e) => onChange({ meetingPoint: e.target.value.slice(0, 80) })}
          placeholder="Ponto de encontro"
          className="h-9 rounded-lg border border-gray-200 px-2 text-sm"
          aria-label="Ponto de encontro"
        />
        <input
          type="datetime-local"
          value={car.departAt}
          onChange={(e) => onChange({ departAt: e.target.value })}
          className="h-9 rounded-lg border border-gray-200 px-2 text-sm"
          aria-label="Hora de partida"
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
        Lugares livres (sem o condutor) <MiniStepper value={car.seats} min={1} max={8} onChange={(seats) => onChange({ seats })} />
      </p>
      <div className="flex flex-col gap-1.5">
        {children}
        {car.passengers.length === 0 && !selected && <p className="py-2 text-center text-xs text-gray-400">Sem passageiros</p>}
      </div>
      <DropTarget
        selected={selected}
        full={car.passengers.length >= car.seats}
        warning={null}
        onDrop={onDrop}
        already={!!selected && (car.passengers.includes(selected.id) || selectedIsDriver)}
      />
      {selected && !selectedIsDriver && (
        <button
          type="button"
          onClick={onMakeDriver}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white text-sm font-bold text-emerald-800 hover:bg-emerald-50"
        >
          <Car className="h-4 w-4" />
          {driverPerson
            ? `Trocar condutor para ${shortDisplayName(selected.full_name, 'Membro')}`
            : `Pôr ${shortDisplayName(selected.full_name, 'Membro')} a conduzir`}
        </button>
      )}
    </div>
  )
}
