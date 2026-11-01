'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  Gamepad2,
  Heart,
  Maximize,
  Minimize,
  Minus,
  MonitorPlay,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
  Smartphone,
  Sparkles,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { listCheckinGuests } from '@/lib/actions/checkin'
import { getClubApp } from '@/utils/club-screen'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SECTION_LABELS } from '@/utils/permissions'
import {
  GUEST_PREFIX,
  isGuestId,
  isHelperFor,
  isLeaderFor,
  memberEntry,
  newId,
  pickWinners,
  recommendEvent,
  type RaffleEntry,
  type RaffleEvent,
} from '@/utils/raffle'
import {
  FAMILY_PRESETS,
  MAX_FAMILY_SIZE,
  MAX_TEAM_COUNT,
  MIN_FAMILY_SIZE,
  MIN_TEAMS,
  familiesCount,
  formFamilies,
  togetherBlocks,
  TEAMS_PROJECTOR_PATH,
  TEAMS_PROJECTOR_WINDOW_NAME,
  TEAM_PRESETS,
  conflictCount,
  formTeams,
  lastTeamsKey,
  pairKey,
  personFromMember,
  teamLabel,
  teamSummary,
  teamsForSize,
  teamsLocalChannelName,
  type BalanceOptions,
  type LastTeams,
  type Team,
  type TeamMember,
  type TeamPerson,
  type TeamsLocalMessage,
  type TeamsMatch,
  type TeamsScreenState,
} from '@/utils/teams'
import { unlockRaffleSound } from '@/utils/raffle-sound'
import { EntryAvatar } from '@/components/raffle/RaffleStage'
import { SECTION_DOT } from '@/app/admin/components/member-constants'
import { TeamsBoard } from './TeamsBoard'
import { MatchBoard } from './MatchBoard'

export type TeamsEvent = RaffleEvent & { rsvp_enabled?: boolean | null }
type Source = 'rsvp' | 'attendance'
type SizeMode = 'count' | 'size'
/** Equipas (animais) ou Famílias (como no Family Feud: famílias a sério juntas, depois sorteia-se quem joga). */
type FormMode = 'teams' | 'families'

type Saved = {
  v: 1
  savedAt: number
  selected: string[]
  guests: RaffleEntry[]
  eventId: string | null
  source: Source
  sizeMode: SizeMode
  count: number
  perTeam: number
  opts: BalanceOptions
  projector: boolean
  sound: boolean
  teams: Team[]
  revealId: string | null
  formedAt?: number | null
  mode?: FormMode
  formedMode?: FormMode
  familySize?: number
  match?: TeamsMatch | null
  played?: string[]
}

/** Seleção e equipas são temporárias (como no Sorteador): ao fim de 12h recomeça do zero. */
const TEMP_MS = 12 * 60 * 60 * 1000
const DEFAULT_OPTS: BalanceOptions = { age: true, gender: true, leaders: true }

function storageKey(userId: string) {
  return `teams:v1:${userId}`
}
function pairsKey(userId: string) {
  return `teams:pairs:${userId}`
}
function togetherKey(userId: string) {
  return `teams:together:${userId}`
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* armazenamento indisponível — segue sem guardar */
  }
}

function eventLabel(e: TeamsEvent) {
  const date = new Date(e.start_at).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })
  const sec = e.target_section ? SECTION_LABELS[e.target_section] || e.target_section : 'Geral'
  return `${date} · ${e.title} · ${sec}`
}

/** Quem disse que ia antes do evento; quem foi marcado presente depois de começar. */
function defaultSource(e: TeamsEvent, now: number): Source {
  return e.rsvp_enabled && now < new Date(e.start_at).getTime() ? 'rsvp' : 'attendance'
}

export function TeamsClient({
  userId,
  members,
  events,
  familyGroups,
}: {
  userId: string
  members: TeamMember[]
  events: TeamsEvent[]
  /** Famílias pelas contas familiares (conta principal + perfis associados). */
  familyGroups: string[][]
}) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const [hydrated, setHydrated] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [guests, setGuests] = useState<RaffleEntry[]>([])
  const [eventId, setEventId] = useState<string | null>(null)
  const [source, setSource] = useState<Source>('attendance')
  const [sizeMode, setSizeMode] = useState<SizeMode>('count')
  const [count, setCount] = useState(4)
  const [perTeam, setPerTeam] = useState(5)
  const [opts, setOpts] = useState<BalanceOptions>(DEFAULT_OPTS)
  const [projector, setProjector] = useState(false)
  const [sound, setSound] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [revealId, setRevealId] = useState<string | null>(null)
  const [formedAt, setFormedAt] = useState<number | null>(null)
  const [pairs, setPairs] = useState<[string, string][]>([])
  const [mode, setMode] = useState<FormMode>('teams')
  const [familySize, setFamilySize] = useState(5)
  /** Pares "juntar sempre" (Modo Famílias), além das contas familiares. */
  const [togetherPairs, setTogetherPairs] = useState<[string, string][]>([])
  const [match, setMatch] = useState<TeamsMatch | null>(null)
  /** Famílias que já jogaram (o sorteio escolhe primeiro entre as outras). */
  const [played, setPlayed] = useState<string[]>([])
  const [playCount, setPlayCount] = useState(2)
  const [togA, setTogA] = useState('')
  const [togB, setTogB] = useState('')
  /** Modo com que as equipas atuais foram formadas. */
  const [formedMode, setFormedMode] = useState<FormMode>('teams')

  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [guestName, setGuestName] = useState('')
  const [loadingEvent, setLoadingEvent] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')
  // Ecrã inteiro aqui: com animação (ao revelar) ou já tudo à vista ("Ver em ecrã inteiro")
  const [overlay, setOverlay] = useState<null | 'reveal' | 'static'>(null)

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const event = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId])
  const recommended = useMemo(() => recommendEvent(events) as TeamsEvent | null, [events])

  // ── Evento → pessoas (disseram que iam, ou presentes/atrasados) ─────
  const applyEvent = useCallback(
    async (ev: TeamsEvent, src: Source, opt: { auto?: boolean } = {}) => {
      setEventId(ev.id)
      setSource(src)
      setLoadingEvent(true)
      const [res, visits] = await Promise.all([
        src === 'rsvp'
          ? supabase.from('event_rsvps').select('user_id').eq('event_id', ev.id).eq('going', true)
          : supabase.from('event_attendance').select('user_id').eq('event_id', ev.id).in('status', ['presente', 'atrasado']),
        // As visitas que se registaram pelo QR só contam nas presenças
        src === 'attendance' ? listCheckinGuests(ev.id).catch(() => [] as RaffleEntry[]) : Promise.resolve([] as RaffleEntry[]),
      ])
      setLoadingEvent(false)
      if (res.error) {
        if (!opt.auto) toast.error('Não foi possível carregar as pessoas do evento.')
        return
      }
      const ids = (res.data || []).map((r) => r.user_id as string).filter((id) => memberById.has(id))
      if (ids.length === 0 && visits.length === 0) {
        if (!opt.auto)
          toast.info(
            src === 'rsvp'
              ? 'Ainda ninguém disse que vai a este evento — escolhe as pessoas à mão ou usa as presenças.'
              : 'Este evento ainda não tem presenças marcadas — escolhe as pessoas à mão.',
          )
        return
      }
      if (visits.length > 0) setGuests((prev) => [...prev.filter((g) => !visits.some((v) => v.id === g.id)), ...visits])
      setSelected((prev) => new Set([...ids, ...visits.map((v) => v.id), ...[...prev].filter(isGuestId)]))
      toast.success(
        `${ids.length} ${src === 'rsvp' ? 'disseram que iam' : 'presentes'}${visits.length ? ` + ${visits.length} ${visits.length === 1 ? 'visita' : 'visitas'}` : ''} em "${ev.title}"`,
      )
    },
    [supabase, memberById],
  )

  // ── Carregar do browser (temporário) ou do evento recomendado ─────
  useEffect(() => {
    const saved = loadJson<Saved>(storageKey(userId))
    const fresh = saved?.v === 1 && Date.now() - saved.savedAt < TEMP_MS
    const savedPairs = loadJson<[string, string][]>(pairsKey(userId))
    const savedTogether = loadJson<[string, string][]>(togetherKey(userId))
    // Lido só depois de montar (no servidor não há localStorage)
    if (Array.isArray(savedPairs)) setPairs(savedPairs)
    if (Array.isArray(savedTogether)) setTogetherPairs(savedTogether)
    if (saved?.v === 1) {
      setSizeMode(saved.sizeMode || 'count')
      setCount(saved.count || 4)
      setPerTeam(saved.perTeam || 5)
      setOpts({ ...DEFAULT_OPTS, ...saved.opts })
      setProjector(!!saved.projector)
      setSound(saved.sound !== false)
      setMode(saved.mode === 'families' ? 'families' : 'teams')
      setFamilySize(saved.familySize || 5)
    }
    if (fresh && saved && (saved.selected.length > 0 || saved.teams.length > 0)) {
      setSelected(new Set(saved.selected.filter((id) => isGuestId(id) || memberById.has(id))))
      setGuests(saved.guests || [])
      setEventId(saved.eventId && events.some((e) => e.id === saved.eventId) ? saved.eventId : null)
      setSource(saved.source || 'attendance')
      setTeams(saved.teams || [])
      setRevealId(saved.revealId ?? null)
      setFormedAt(saved.formedAt ?? null)
      setMatch(saved.match ?? null)
      setFormedMode(saved.formedMode === 'families' ? 'families' : 'teams')
      setPlayed(saved.played ?? [])
    } else if (recommended) {
      applyEvent(recommended, defaultSource(recommended, Date.now()), { auto: true })
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveJson(storageKey(userId), {
      v: 1,
      savedAt: Date.now(),
      selected: [...selected],
      guests,
      eventId,
      source,
      sizeMode,
      count,
      perTeam,
      opts,
      projector,
      sound,
      teams,
      revealId,
      formedAt,
      mode,
      formedMode,
      familySize,
      match,
      played,
    } satisfies Saved)
  }, [hydrated, userId, selected, guests, eventId, source, sizeMode, count, perTeam, opts, projector, sound, teams, revealId, formedAt, mode, formedMode, familySize, match, played])

  useEffect(() => {
    if (hydrated) saveJson(pairsKey(userId), pairs)
  }, [hydrated, userId, pairs])

  useEffect(() => {
    if (hydrated) saveJson(togetherKey(userId), togetherPairs)
  }, [hydrated, userId, togetherPairs])

  // ── Pessoas ────────────────────────────────────────────────
  const personById = useMemo(() => {
    const map = new Map<string, TeamPerson>()
    for (const m of members) map.set(m.id, personFromMember(m, memberEntry(m)))
    for (const g of guests) map.set(g.id, { ...g, gender: null, section: null, age: null, leader: false })
    return map
  }, [members, guests])

  const people = useMemo(() => [...selected].map((id) => personById.get(id)).filter(Boolean) as TeamPerson[], [selected, personById])

  const inTeams = useMemo(() => new Set(teams.flatMap((t) => t.memberIds)), [teams])
  const withoutTeam = teams.length > 0 ? people.filter((p) => !inTeams.has(p.id)) : []

  const leadersSelected = members.filter((m) => selected.has(m.id) && isLeaderFor(m, event))
  const helpersSelected = members.filter((m) => selected.has(m.id) && isHelperFor(m, event))

  const removeIds = (ids: string[], label: string) => {
    if (ids.length === 0) return
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
    toast.success(`${label}: ${ids.length} fora das equipas`)
  }

  const sections = useMemo(() => {
    const s = new Set(members.map((m) => m.section).filter(Boolean) as string[])
    return Object.keys(SECTION_LABELS).filter((k) => s.has(k))
  }, [members])

  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const filteredMembers = useMemo(() => {
    const q = norm(search.trim())
    return members.filter((m) => {
      if (sectionFilter !== 'all' && m.section !== sectionFilter) return false
      return !q || norm(m.full_name || '').includes(q)
    })
  }, [members, search, sectionFilter])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
      return next
    })

  const addGuest = () => {
    const name = guestName.trim().replace(/\s+/g, ' ')
    if (!name) return
    if (guests.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Já existe uma visita com esse nome.')
      return
    }
    const g: RaffleEntry = { id: `${GUEST_PREFIX}${newId()}`, name, avatar: null }
    setGuests((prev) => [...prev, g])
    setSelected((prev) => new Set(prev).add(g.id))
    setGuestName('')
  }
  const removeGuest = (id: string) => {
    setGuests((prev) => prev.filter((g) => g.id !== id))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setTeams((prev) => prev.map((t) => ({ ...t, memberIds: t.memberIds.filter((x) => x !== id) })))
  }

  // ── Pares "não juntar" ─────────────────────────────────────
  const avoidSet = useMemo(() => new Set(pairs.map(([a, b]) => pairKey(a, b))), [pairs])
  const addPair = () => {
    if (!pairA || !pairB || pairA === pairB) return
    if (avoidSet.has(pairKey(pairA, pairB))) {
      toast.info('Esse par já está na lista.')
      return
    }
    setPairs((p) => [...p, [pairA, pairB]])
    setPairA('')
    setPairB('')
  }
  const nameOf = (id: string) => personById.get(id)?.name ?? memberById.get(id)?.full_name ?? 'Membro'

  // ── Formar ─────────────────────────────────────────────────
  const families = mode === 'families'
  /** As equipas que estão formadas são famílias (o "Quem joga" só faz sentido aí). */
  const familiesFormed = teams.length > 0 && formedMode === 'families'
  const teamCount = families
    ? familiesCount(people.length, familySize)
    : sizeMode === 'count'
      ? Math.min(count, Math.max(MIN_TEAMS, people.length))
      : teamsForSize(people.length, perTeam)
  const sizes = people.length > 0 ? [Math.floor(people.length / teamCount), Math.ceil(people.length / teamCount)] : [0, 0]

  const form = () => {
    unlockRaffleSound()
    if (people.length < 2) {
      toast.error('Escolhe pelo menos 2 pessoas.')
      return
    }
    const result = families ? formFamilies(people, familySize, [...familyGroups, ...togetherPairs], opts, pairs) : null
    const groups = result ? result.groups : formTeams(people, teamCount, opts, pairs)
    const presets = families ? FAMILY_PRESETS : TEAM_PRESETS
    // Ao trocar entre Equipas e Famílias os nomes recomeçam (senão ficavam animais nas famílias)
    const switched = teams.length > 0 && formedMode !== mode
    setFormedMode(mode)
    setTeams((prev) =>
      groups.map((ids, i) => {
        // Mantém os nomes que tinhas mudado à mão (mesma posição)
        const keep = switched ? undefined : prev[i]
        const preset = presets[i % presets.length]
        return {
          id: keep?.id ?? newId(),
          name: keep?.name ?? preset.name,
          emoji: keep?.emoji ?? preset.emoji,
          color: keep?.color ?? preset.color,
          memberIds: ids,
        }
      }),
    )
    setRevealId(null)
    setFormedAt(Date.now())
    setMoving(null)
    setMatch(null)
    setPlayed([])
    if (result?.split.length)
      toast.warning(
        `${result.split.map((b) => b.map(nameOf).join(', ')).join(' / ')}: são mais do que ${familySize}, por isso ficaram em famílias diferentes.`,
      )
    const c = conflictCount(groups, avoidSet)
    if (c > 0) toast.warning(`Não deu para separar ${c} ${c === 1 ? 'par' : 'pares'} — vê as equipas marcadas a vermelho.`)
  }

  const moveTo = (teamId: string) => {
    if (!moving) return
    const id = moving
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        memberIds: t.id === teamId ? [...t.memberIds.filter((x) => x !== id), id] : t.memberIds.filter((x) => x !== id),
      })),
    )
    setMoving(null)
  }

  /** Quem chegou depois: cada um vai para a equipa mais pequena. */
  const placeLatecomers = () => {
    setTeams((prev) => {
      const next = prev.map((t) => ({ ...t, memberIds: [...t.memberIds] }))
      for (const p of withoutTeam) {
        const smallest = [...next].sort((a, b) => a.memberIds.length - b.memberIds.length)[0]
        smallest.memberIds.push(p.id)
      }
      return next
    })
    toast.success(`${withoutTeam.length} ${withoutTeam.length === 1 ? 'pessoa posta' : 'pessoas postas'} nas equipas mais pequenas`)
  }

  const renameTeam = (id: string, name: string) => setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name: name.slice(0, 24) } : t)))

  const clearTeams = () => {
    setTeams([])
    setRevealId(null)
    setMoving(null)
    setMatch(null)
    setPlayed([])
  }

  // ── Modo Famílias: quem fica junto e quem joga ─────────────
  const togetherSet = useMemo(() => new Set(togetherPairs.map(([a, b]) => pairKey(a, b))), [togetherPairs])
  const addTogether = () => {
    if (!togA || !togB || togA === togB) return
    if (togetherSet.has(pairKey(togA, togB))) {
      toast.info('Esse par já está na lista.')
      return
    }
    setTogetherPairs((p) => [...p, [togA, togB]])
    setTogA('')
    setTogB('')
  }
  /** Famílias a sério (contas familiares) entre quem está escolhido. */
  const accountFamilies = useMemo(() => togetherBlocks([...selected], familyGroups).filter((b) => b.length > 1), [selected, familyGroups])

  /** Sorteia as famílias que jogam, primeiro entre as que ainda não jogaram. */
  const drawPlayers = () => {
    unlockRaffleSound()
    const n = Math.min(playCount, teams.length)
    const fresh = teams.filter((t) => !played.includes(t.id))
    let picked = pickWinners(fresh, n)
    let nextPlayed = [...played, ...picked.map((t) => t.id)]
    if (picked.length < n) {
      // Já jogaram (quase) todas: as que faltavam jogam e as outras saem das que já jogaram
      const again = pickWinners(
        teams.filter((t) => played.includes(t.id)),
        n - picked.length,
      )
      picked = [...picked, ...again]
      nextPlayed = picked.map((t) => t.id)
      toast.info('Todas as famílias já jogaram: começa uma nova volta.')
    }
    setMatch({ id: newId(), teamIds: picked.map((t) => t.id) })
    setPlayed(nextPlayed)
    if (!revealId) setRevealId(newId())
    setOverlay('reveal')
  }

  // ── Estado para o projetor / cronómetro ────────────────────
  const screenState: TeamsScreenState = useMemo(
    () => ({
      title: event?.title ?? null,
      peopleCount: people.length,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji,
        color: t.color,
        members: t.memberIds.map((id) => personById.get(id)).filter(Boolean).map((p) => ({ id: p!.id, name: p!.name, avatar: p!.avatar })),
      })),
      revealId,
      formedAt: teams.length > 0 ? formedAt : null,
      mode: teams.length > 0 ? formedMode : mode,
      match: match && match.teamIds.every((id) => teams.some((t) => t.id === id)) ? match : null,
    }),
    [event, people.length, teams, personById, revealId, formedAt, mode, formedMode, match],
  )

  // Últimas equipas neste browser (para o Cronómetro)
  useEffect(() => {
    if (!hydrated || teams.length === 0) return
    saveJson(lastTeamsKey(userId), { at: Date.now(), names: teams.map(teamLabel) } satisfies LastTeams)
  }, [hydrated, userId, teams])

  // Base de dados: projetor noutro computador e o Cronómetro noutro dispositivo
  const lastRevealRef = useRef<string | null>(null)
  useEffect(() => {
    if (!hydrated || (!projector && teams.length === 0)) return
    const push = () =>
      supabase
        .from('team_screens')
        .upsert({ host_id: userId, state: screenState, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.warn('team_screens:', error.message)
        })
    if (revealId !== lastRevealRef.current) {
      lastRevealRef.current = revealId
      push()
      return
    }
    const t = setTimeout(push, 600)
    return () => clearTimeout(t)
  }, [hydrated, projector, teams.length, screenState, revealId, supabase, userId])

  // Janela do projetor neste computador (BroadcastChannel)
  const screenStateRef = useRef(screenState)
  useEffect(() => {
    screenStateRef.current = screenState
  }, [screenState])
  const bcRef = useRef<BroadcastChannel | null>(null)
  const lastPingRef = useRef(0)
  const [localProjector, setLocalProjector] = useState(false)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(teamsLocalChannelName(userId))
    bcRef.current = bc
    const send = (m: TeamsLocalMessage) => bc.postMessage(m)
    bc.onmessage = (ev: MessageEvent<TeamsLocalMessage>) => {
      const m = ev.data
      if (m.type === 'hello' || m.type === 'ping') {
        const wasOff = Date.now() - lastPingRef.current > 5000
        lastPingRef.current = Date.now()
        setLocalProjector(true)
        if (m.type === 'hello' || wasOff) send({ type: 'state', state: screenStateRef.current })
      } else if (m.type === 'bye' && m.from === 'projector') {
        lastPingRef.current = 0
        setLocalProjector(false)
      }
    }
    const check = setInterval(() => {
      if (lastPingRef.current && Date.now() - lastPingRef.current > 5000) {
        lastPingRef.current = 0
        setLocalProjector(false)
      }
    }, 2000)
    const onHide = () => send({ type: 'bye', from: 'controller' })
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(check)
      window.removeEventListener('pagehide', onHide)
      onHide()
      bc.close()
      bcRef.current = null
    }
  }, [userId])

  useEffect(() => {
    bcRef.current?.postMessage({ type: 'state', state: screenState } satisfies TeamsLocalMessage)
  }, [screenState])

  const openProjectorWindow = () => {
    unlockRaffleSound()
    const w = window.open(TEAMS_PROJECTOR_PATH, TEAMS_PROJECTOR_WINDOW_NAME, 'popup=yes,width=1280,height=720')
    if (!w) {
      // Na app do clube a janela não abre: a app mostra esta ferramenta no ecrã do projetor.
      if (!getClubApp()) toast.error('O browser bloqueou a janela. Permite pop-ups para este site e tenta outra vez.')
      return
    }
    w.focus()
  }

  const reveal = () => {
    unlockRaffleSound()
    setRevealId(newId())
    setOverlay('reveal')
  }

  const timeTeams = () => {
    saveJson(lastTeamsKey(userId), { at: Date.now(), names: teams.map(teamLabel) } satisfies LastTeams)
    router.push('/admin/ferramentas/cronometro?equipas=formadas')
  }

  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const conflicts = conflictCount(
    teams.map((t) => t.memberIds),
    avoidSet,
  )
  const movingPerson = moving ? personById.get(moving) : null

  return (
    <>
      <main className={`mx-auto max-w-4xl space-y-5 px-4 pt-6 ${movingPerson ? 'pb-40' : 'pb-44'}`}>
        <div className="flex items-center gap-3">
          <Link href="/admin?tab=tools" className="text-slate-500 hover:text-slate-700" title="Voltar às Ferramentas">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <UsersRound className="h-6 w-6 text-fuchsia-700" /> Formador de equipas
          </h1>
        </div>

        {/* Projetor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorPlay className="h-5 w-5 text-fuchsia-700" /> Projetor
              {localProjector && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Janela ligada
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Abre a janela do projetor, arrasta-a para o ecrã do projetor e clica lá em &quot;ecrã inteiro&quot;. As equipas só
              aparecem lá quando carregares em &quot;Revelar&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={openProjectorWindow}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 text-sm font-bold text-white hover:bg-blue-800 sm:w-auto"
            >
              <ExternalLink className="h-4 w-4" /> {localProjector ? 'Mostrar janela do projetor' : 'Abrir janela do projetor'}
            </button>
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="teams-remote" className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                    <Smartphone className="h-4 w-4" /> Controlar a partir do telemóvel
                  </span>
                  <span className="block text-xs text-gray-500">
                    Para quando o projetor está noutro computador: este dispositivo controla e o outro mostra.
                  </span>
                </label>
                <Switch id="teams-remote" checked={projector} onCheckedChange={setProjector} />
              </div>
              {projector && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-600">
                    No computador do projetor, entra com <b>a tua conta</b> e abre <b>Gestão → Ferramentas → Formador de equipas → Ecrã do
                    projetor</b>, ou este endereço:
                  </p>
                  <div className="flex gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-100 px-3 py-2.5 text-xs text-gray-700">
                      {origin}
                      {TEAMS_PROJECTOR_PATH}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(`${origin}${TEAMS_PROJECTOR_PATH}`)
                          .then(() => toast.success('Endereço copiado'))
                          .catch(() => toast.error('Não foi possível copiar.'))
                      }}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                      title="Copiar"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Evento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5 text-fuchsia-700" /> Evento
            </CardTitle>
            <CardDescription>Escolhe um evento para pôr nas equipas quem disse que ia ou quem foi marcado presente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommended && recommended.id !== eventId && (
              <button
                type="button"
                onClick={() => applyEvent(recommended, defaultSource(recommended, Date.now()))}
                disabled={loadingEvent}
                className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100 disabled:opacity-60"
              >
                <Sparkles className="h-5 w-5 flex-shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wider text-amber-700">Evento agora</span>
                  <span className="block truncate font-bold text-gray-900">{recommended.title}</span>
                </span>
                <span className="flex-shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-bold text-white">Usar</span>
              </button>
            )}
            <div className="flex gap-2">
              <select
                value={eventId ?? ''}
                disabled={loadingEvent}
                onChange={(e) => {
                  const ev = events.find((x) => x.id === e.target.value)
                  if (ev) applyEvent(ev, defaultSource(ev, Date.now()))
                  else setEventId(null)
                }}
                className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
              >
                <option value="">Sem evento</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {eventLabel(e)}
                  </option>
                ))}
              </select>
              {event && (
                <button
                  type="button"
                  onClick={() => applyEvent(event, source)}
                  disabled={loadingEvent}
                  title="Voltar a carregar"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw className={`h-4 w-4 ${loadingEvent ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
            {event && (
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
                {(
                  [
                    ['rsvp', 'Disseram que iam'],
                    ['attendance', 'Presentes e atrasados'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyEvent(event, id)}
                    disabled={loadingEvent || (id === 'rsvp' && !event.rsvp_enabled)}
                    title={id === 'rsvp' && !event.rsvp_enabled ? 'Este evento não pede confirmação de presença' : undefined}
                    className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors disabled:opacity-40 sm:text-sm ${
                      source === id ? 'bg-white text-fuchsia-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pessoas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-fuchsia-700" /> Quem entra nas equipas
              <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-black text-fuchsia-700">{people.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <QuickButton disabled={!selected.has(userId)} onClick={() => removeIds([userId], 'Eu')}>
                Tirar-me
              </QuickButton>
              <QuickButton disabled={leadersSelected.length === 0} onClick={() => removeIds(leadersSelected.map((m) => m.id), 'Dirigentes')}>
                Tirar dirigentes{leadersSelected.length > 0 && ` (${leadersSelected.length})`}
              </QuickButton>
              <QuickButton disabled={helpersSelected.length === 0} onClick={() => removeIds(helpersSelected.map((m) => m.id), 'Ajudantes')}>
                Tirar ajudantes{helpersSelected.length > 0 && ` (${helpersSelected.length})`}
              </QuickButton>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar pelo nome…"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm"
                />
              </div>
              {sections.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <Pill active={sectionFilter === 'all'} onClick={() => setSectionFilter('all')}>
                    Todas as classes
                  </Pill>
                  {sections.map((s) => (
                    <Pill key={s} active={sectionFilter === s} onClick={() => setSectionFilter(s)}>
                      {SECTION_LABELS[s]}
                    </Pill>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-500">{filteredMembers.length} na lista</span>
              <span className="flex gap-3">
                <button type="button" className="font-bold text-fuchsia-700 hover:underline" onClick={() => setMany(filteredMembers.map((m) => m.id), true)}>
                  Marcar todos
                </button>
                <button type="button" className="font-bold text-gray-500 hover:underline" onClick={() => setMany(filteredMembers.map((m) => m.id), false)}>
                  Desmarcar todos
                </button>
              </span>
            </div>

            <ul className="max-h-[22rem] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
              {filteredMembers.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">Ninguém encontrado.</li>}
              {filteredMembers.map((m) => {
                const on = selected.has(m.id)
                const p = personById.get(m.id)!
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${on ? 'bg-fuchsia-50/60' : 'hover:bg-gray-50'}`}
                    >
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 ${
                          on ? 'border-fuchsia-700 bg-fuchsia-700 text-white' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <EntryAvatar entry={memberEntry(m)} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-bold ${on ? 'text-gray-900' : 'text-gray-500'}`}>{m.full_name}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                          {m.section && <span>{SECTION_LABELS[m.section] || m.section}</span>}
                          {p.age !== null && <span>· {p.age} anos</span>}
                          {p.leader && <span className="rounded bg-slate-100 px-1.5 font-bold text-slate-600">Liderança</span>}
                          {m.id === userId && <span className="rounded bg-fuchsia-100 px-1.5 font-bold text-fuchsia-700">Eu</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* Visitas */}
            <div className="space-y-2 rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Visitas (sem conta)</p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  addGuest()
                }}
              >
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Nome da visita"
                  maxLength={60}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                />
                <button
                  type="submit"
                  disabled={!guestName.trim()}
                  className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl bg-blue-900 px-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  <UserPlus className="h-4 w-4" /> Adicionar
                </button>
              </form>
              {guests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {guests.map((g) => {
                    const on = selected.has(g.id)
                    return (
                      <span
                        key={g.id}
                        className={`inline-flex items-center gap-1 rounded-full border py-1 pl-2 pr-1.5 text-sm font-bold ${
                          on ? 'border-fuchsia-200 bg-white text-gray-900' : 'border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                      >
                        <button type="button" onClick={() => toggle(g.id)} title={on ? 'Tirar' : 'Pôr'}>
                          {g.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGuest(g.id)}
                          className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          title="Apagar visita"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Como formar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shuffle className="h-5 w-5 text-fuchsia-700" /> Como formar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-fuchsia-50 p-1 ring-1 ring-inset ring-fuchsia-100">
              {(
                [
                  ['teams', 'Equipas', UsersRound],
                  ['families', 'Famílias', Heart],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-black ${
                    mode === id ? 'bg-fuchsia-700 text-white shadow-sm' : 'text-fuchsia-800/70 hover:text-fuchsia-900'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            {families && (
              <p className="text-xs text-gray-500">
                Como no Family Feud: quem é da mesma família fica junto e o resto preenche os lugares. Depois sorteias que famílias jogam.
              </p>
            )}
            {families ? (
              <div className="flex flex-wrap items-center gap-4">
                <Stepper value={familySize} min={MIN_FAMILY_SIZE} max={MAX_FAMILY_SIZE} onChange={setFamilySize} suffix="no máximo por família" />
                <p className="text-sm text-gray-500">
                  {people.length > 1 ? (
                    <>
                      → <b>{teamCount}</b> famílias de <b>{sizes[0] === sizes[1] ? sizes[0] : `${sizes[0]}–${sizes[1]}`}</b> pessoas
                    </>
                  ) : (
                    'Escolhe as pessoas primeiro.'
                  )}
                </p>
              </div>
            ) : (
            <>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
              {(
                [
                  ['count', 'Nº de equipas'],
                  ['size', 'Pessoas por equipa'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSizeMode(id)}
                  className={`rounded-lg px-2 py-2 text-sm font-bold ${sizeMode === id ? 'bg-white text-fuchsia-800 shadow-sm' : 'text-gray-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {sizeMode === 'count' ? (
                <Stepper value={count} min={MIN_TEAMS} max={MAX_TEAM_COUNT} onChange={setCount} suffix="equipas" />
              ) : (
                <Stepper value={perTeam} min={2} max={20} onChange={setPerTeam} suffix="por equipa" />
              )}
              <p className="text-sm text-gray-500">
                {people.length > 1 ? (
                  <>
                    → <b>{teamCount}</b> equipas de <b>{sizes[0] === sizes[1] ? sizes[0] : `${sizes[0]}–${sizes[1]}`}</b> pessoas
                  </>
                ) : (
                  'Escolhe as pessoas primeiro.'
                )}
              </p>
            </div>
            </>
            )}

            {families && (
              <div className="space-y-2 border-t border-gray-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Ficam sempre juntos</p>
                {accountFamilies.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {accountFamilies.map((b) => (
                      <span
                        key={b.join()}
                        className="inline-flex items-center gap-1 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-bold text-fuchsia-900"
                        title="Contas familiares"
                      >
                        <Heart className="h-3 w-3" /> {b.map(nameOf).join(' + ')}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  As contas familiares já ficam juntas. Junta aqui quem não está ligado (ex.: o pai com conta própria, ou uma visita que veio
                  com eles). Fica guardado neste dispositivo.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {[
                    [togA, setTogA],
                    [togB, setTogB],
                  ].map(([value, set], i) => (
                    <select
                      key={i}
                      value={value as string}
                      onChange={(e) => (set as (v: string) => void)(e.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                    >
                      <option value="">{i === 0 ? 'Pessoa…' : 'fica com…'}</option>
                      {[...people]
                        .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {isGuestId(p.id) ? ' (visita)' : ''}
                          </option>
                        ))}
                    </select>
                  ))}
                  <button
                    type="button"
                    onClick={addTogether}
                    disabled={!togA || !togB || togA === togB}
                    className="flex h-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-900 px-3 text-sm font-bold text-white disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" /> Juntar
                  </button>
                </div>
                {togetherPairs.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {togetherPairs.map(([a, b]) => (
                      <span
                        key={pairKey(a, b)}
                        className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 py-1 pl-3 pr-1.5 text-xs font-bold text-green-800"
                      >
                        {nameOf(a)} + {nameOf(b)}
                        <button
                          type="button"
                          onClick={() => setTogetherPairs((p) => p.filter(([x, y]) => pairKey(x, y) !== pairKey(a, b)))}
                          className="ml-1 rounded-full p-0.5 text-green-500 hover:bg-green-100 hover:text-green-800"
                          title="Tirar da lista"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2.5 border-t border-gray-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Equilibrar</p>
              {(
                [
                  ['age', 'Idades e secções', 'Mistura mais novos e mais velhos em cada equipa.'],
                  ['gender', 'Rapazes e raparigas', 'Espalha-os por igual (usa o sexo do perfil; se faltar, o palpite pelo nome).'],
                  ['leaders', 'Dirigentes espalhados', 'Os dirigentes/ajudantes que entram não ficam todos na mesma equipa.'],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-gray-800">{label}</span>
                    <span className="block text-xs text-gray-500">{hint}</span>
                  </span>
                  <Switch checked={opts[key]} onCheckedChange={(v) => setOpts((o) => ({ ...o, [key]: v }))} />
                </label>
              ))}
            </div>

            <div className="space-y-2 border-t border-gray-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Não juntar</p>
              <p className="text-xs text-gray-500">Pares que nunca ficam na mesma equipa (irmãos, os que se distraem juntos…). Fica guardado neste dispositivo.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {[
                  [pairA, setPairA],
                  [pairB, setPairB],
                ].map(([value, set], i) => (
                  <select
                    key={i}
                    value={value as string}
                    onChange={(e) => (set as (v: string) => void)(e.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">{i === 0 ? 'Pessoa…' : 'não fica com…'}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                ))}
                <button
                  type="button"
                  onClick={addPair}
                  disabled={!pairA || !pairB || pairA === pairB}
                  className="flex h-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-900 px-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" /> Juntar à lista
                </button>
              </div>
              {pairs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pairs.map(([a, b]) => (
                    <span
                      key={pairKey(a, b)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 py-1 pl-3 pr-1.5 text-xs font-bold text-red-800"
                    >
                      {nameOf(a)} <X className="h-3 w-3 opacity-50" /> {nameOf(b)}
                      <button
                        type="button"
                        onClick={() => setPairs((p) => p.filter(([x, y]) => pairKey(x, y) !== pairKey(a, b)))}
                        className="ml-1 rounded-full p-0.5 text-red-400 hover:bg-red-100 hover:text-red-700"
                        title="Tirar da lista"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Equipas formadas */}
        {teams.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersRound className="h-5 w-5 text-fuchsia-700" /> {familiesFormed ? 'Famílias' : 'Equipas'}
                {revealId && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">Revelado no projetor</span>
                )}
              </CardTitle>
              <CardDescription>Toca numa pessoa e depois na equipa para a mudar. Podes mudar o nome das equipas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {conflicts > 0 && (
                <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-200">
                  <AlertTriangle className="h-4 w-4" /> {conflicts} {conflicts === 1 ? 'par que não devia estar junto está' : 'pares que não deviam estar juntos estão'} na mesma equipa.
                </p>
              )}
              {withoutTeam.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200 sm:flex-row sm:items-center">
                  <p className="flex-1">
                    <b>{withoutTeam.length}</b> sem equipa ({withoutTeam.map((p) => p.name).join(', ')}).
                  </p>
                  <button type="button" onClick={placeLatecomers} className="h-8 rounded-lg bg-amber-500 px-3 font-bold text-white hover:bg-amber-600">
                    Pôr nas equipas mais pequenas
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {teams.map((t) => {
                  const sum = teamSummary(t.memberIds, personById)
                  const teamConflicts = conflictCount([t.memberIds], avoidSet)
                  const canDrop = moving && !t.memberIds.includes(moving)
                  const playing = familiesFormed && !!screenState.match?.teamIds.includes(t.id)
                  return (
                    <div
                      key={t.id}
                      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${teamConflicts ? 'border-red-300' : 'border-gray-200'} ${
                        playing ? 'ring-2 ring-fuchsia-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ backgroundColor: t.color }}>
                        <span className="text-xl">{t.emoji}</span>
                        <input
                          value={t.name}
                          onChange={(e) => renameTeam(t.id, e.target.value)}
                          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 font-black text-white placeholder-white/60 hover:border-white/40 focus:border-white/70 focus:outline-none"
                          aria-label="Nome da equipa"
                        />
                        <span className="rounded-full bg-black/25 px-2 text-xs font-black">{t.memberIds.length}</span>
                      </div>
                      {familiesFormed && screenState.match && (
                        <p
                          className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider ${
                            playing ? 'bg-fuchsia-100 text-fuchsia-800' : 'bg-gray-50 text-gray-400'
                          }`}
                        >
                          {playing ? '🎮 Vai jogar' : played.includes(t.id) ? '✓ Já jogou' : '👀 A assistir'}
                        </p>
                      )}
                      <p className="border-b border-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-500">
                        ♂ {sum.m} · ♀ {sum.f}
                        {sum.leaders > 0 && ` · ${sum.leaders} liderança`}
                        {sum.avgAge !== null && ` · média ${sum.avgAge} anos`}
                      </p>
                      <div className="flex flex-wrap gap-1.5 p-3">
                        {t.memberIds.map((id) => {
                          const p = personById.get(id)
                          if (!p) return null
                          const isSel = moving === id
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setMoving(isSel ? null : id)}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset transition-colors ${
                                isSel ? 'bg-blue-900 text-white ring-blue-900' : 'bg-gray-50 text-gray-800 ring-gray-200 hover:ring-fuchsia-300'
                              }`}
                            >
                              {p.section && <span className={`h-1.5 w-1.5 rounded-full ${SECTION_DOT[p.section] || 'bg-gray-300'}`} />}
                              {p.name}
                              {p.leader && <span className={isSel ? 'text-white/70' : 'text-violet-600'}>★</span>}
                            </button>
                          )
                        })}
                      </div>
                      {canDrop && (
                        <button
                          type="button"
                          onClick={() => moveTo(t.id)}
                          className="mx-3 mb-3 flex h-10 w-[calc(100%-1.5rem)] items-center justify-center rounded-xl border-2 border-dashed border-fuchsia-300 bg-fuchsia-50 text-sm font-bold text-fuchsia-800 hover:bg-fuchsia-100"
                        >
                          Pôr aqui {movingPerson?.name}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {familiesFormed && (
                <div className="space-y-3 rounded-2xl bg-fuchsia-50 p-4 ring-1 ring-inset ring-fuchsia-100">
                  <p className="flex items-center gap-2 font-black text-fuchsia-950">
                    <Gamepad2 className="h-5 w-5" /> Quem joga
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Stepper value={playCount} min={2} max={Math.max(2, teams.length)} onChange={setPlayCount} suffix="famílias jogam" />
                    <button
                      type="button"
                      onClick={drawPlayers}
                      disabled={teams.length < 2}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-700 to-indigo-700 px-4 font-black text-white shadow-md disabled:opacity-40"
                    >
                      <Shuffle className="h-5 w-5" /> {screenState.match ? 'Sortear outra vez' : 'Sortear quem joga'}
                    </button>
                  </div>
                  <p className="text-xs text-fuchsia-900/70">
                    O sorteio escolhe primeiro as famílias que ainda não jogaram. No VanaCoro, carrega em &quot;Usar as famílias
                    sorteadas&quot; na sala de espera.
                  </p>
                  {(screenState.match || played.length > 0) && (
                    <div className="flex flex-wrap gap-3 text-xs font-bold">
                      {screenState.match && (
                        <button type="button" onClick={() => setMatch(null)} className="text-fuchsia-800 hover:underline">
                          Mostrar todas as famílias no projetor
                        </button>
                      )}
                      {played.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPlayed(screenState.match?.teamIds ?? [])
                            toast.success('Todas as outras famílias podem voltar a ser sorteadas.')
                          }}
                          className="text-gray-500 hover:underline"
                        >
                          Recomeçar a volta ({played.length} já {played.length === 1 ? 'jogou' : 'jogaram'})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={timeTeams}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600"
                >
                  <Timer className="h-4 w-4" /> Cronometrar estas equipas
                </button>
                <button
                  type="button"
                  onClick={() => setOverlay('static')}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  <Maximize className="h-4 w-4" /> Ver em ecrã inteiro
                </button>
                <button
                  type="button"
                  onClick={clearTeams}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-gray-500 hover:bg-red-50 hover:text-red-700"
                >
                  <UserMinus className="h-4 w-4" /> Desfazer equipas
                </button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Barra de baixo */}
      {movingPerson ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <p className="min-w-0 flex-1 text-sm">
              <b>{movingPerson.name}</b>: toca na equipa para onde vai.
            </p>
            <button type="button" onClick={() => setMoving(null)} className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100" title="Cancelar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <button
              type="button"
              onClick={form}
              disabled={people.length < 2}
              className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl font-black shadow-lg transition-transform active:scale-[0.98] disabled:bg-gray-300 disabled:shadow-none ${
                teams.length > 0 ? 'border border-gray-200 bg-white text-gray-800 shadow-none' : 'bg-gradient-to-r from-fuchsia-700 to-indigo-700 text-white'
              }`}
            >
              <span className="flex items-center gap-2 text-lg">
                <Shuffle className="h-5 w-5" /> {teams.length > 0 ? 'Formar de novo' : families ? 'Formar famílias' : 'Formar equipas'}
              </span>
              <span className={`text-[11px] font-bold ${teams.length > 0 ? 'text-gray-500' : 'text-white/75'}`}>
                {people.length} pessoas · {teamCount} {families ? 'famílias' : 'equipas'}
              </span>
            </button>
            {teams.length > 0 && (
              <button
                type="button"
                onClick={reveal}
                className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-700 to-indigo-700 text-lg font-black text-white shadow-lg active:scale-[0.98]"
              >
                <Sparkles className="h-5 w-5" /> Revelar
              </button>
            )}
          </div>
        </div>
      )}

      {overlay && teams.length > 0 && (
        <RevealOverlay
          state={screenState}
          revealId={revealId}
          animate={overlay === 'reveal'}
          // Com a janela do projetor ligada, o som toca só lá
          sound={sound && !localProjector}
          soundOnProjector={localProjector}
          onToggleSound={() => setSound((s) => !s)}
          onClose={() => {
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
            setOverlay(null)
          }}
        />
      )}
    </>
  )
}

function RevealOverlay({
  state,
  revealId,
  animate,
  sound,
  soundOnProjector,
  onToggleSound,
  onClose,
}: {
  state: TeamsScreenState
  revealId: string | null
  animate: boolean
  sound: boolean
  soundOnProjector: boolean
  onToggleSound: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isFull, setIsFull] = useState(false)
  // "Ver em ecrã inteiro" sem revelar ainda → um id próprio, sem animação
  const [staticId] = useState(() => newId())

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const id = revealId ?? staticId
  return (
    <div ref={ref} className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950 text-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-blue-200">
          {state.mode === 'families' ? 'Famílias' : 'Equipas'}
          {state.title ? ` · ${state.title}` : ''}
        </p>
        {!soundOnProjector && (
          <button type="button" onClick={onToggleSound} className="rounded-lg p-2 text-blue-200 hover:bg-white/10" title="Som">
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        )}
        {typeof document !== 'undefined' && document.fullscreenEnabled && (
          <button
            type="button"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen?.() : ref.current?.requestFullscreen?.())?.catch(() => {})}
            className="rounded-lg p-2 text-blue-200 hover:bg-white/10"
            title="Ecrã inteiro"
          >
            {isFull ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-blue-200 hover:bg-white/10" title="Fechar (Esc)">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {state.match ? (
          <MatchBoard key={state.match.id} teams={state.teams} match={state.match} instant={!animate} sound={sound} />
        ) : (
          <TeamsBoard key={id} teams={state.teams} revealId={id} instant={!animate} sound={sound} />
        )}
      </div>
    </div>
  )
}

function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  suffix: string
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 disabled:opacity-30"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-8 text-center text-xl font-black tabular-nums text-gray-900">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
      <span className="text-sm font-bold text-gray-500">{suffix}</span>
    </span>
  )
}

function QuickButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-700"
    >
      <UserMinus className="h-4 w-4" />
      {children}
    </button>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
        active ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}
