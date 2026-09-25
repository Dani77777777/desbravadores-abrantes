'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
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
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getClubApp } from '@/utils/club-screen'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SECTION_LABELS, helperLabel } from '@/utils/permissions'
import {
  GUEST_PREFIX,
  PROJECTOR_PATH,
  PROJECTOR_WINDOW_NAME,
  isGuestId,
  isHelperFor,
  isLeaderFor,
  memberEntry,
  newId,
  pickWinners,
  raffleLocalChannelName,
  recommendEvent,
  type RaffleDraw,
  type RaffleEntry,
  type RaffleEvent,
  type RaffleLocalMessage,
  type RaffleMember,
  type RaffleScreenState,
} from '@/utils/raffle'
import { unlockRaffleSound } from '@/utils/raffle-sound'
import { EntryAvatar, RaffleStage } from './RaffleStage'

type AfterMode = 'keep' | 'uncheck' | 'repeat'
type HistoryEntry = RaffleEntry & { at: number }

type Saved = {
  v: 1
  savedAt: number
  selected: string[]
  guests: RaffleEntry[]
  eventId: string | null
  count: number
  afterMode: AfterMode
  projector: boolean
  sound: boolean
  history: HistoryEntry[]
}

/** A seleção e os "já sorteados" são temporários: ao fim de 12h recomeça do zero. */
const TEMP_MS = 12 * 60 * 60 * 1000
/** Máximo de nomes enviados ao projetor (só servem para o ecrã de espera e o rolo). */
const SCREEN_POOL_LIMIT = 150

const AFTER_MODES: { id: AfterMode; label: string; hint: string }[] = [
  { id: 'keep', label: 'Anotar e não repetir', hint: 'Quem sai fica na lista de já sorteados e não volta a sair.' },
  { id: 'uncheck', label: 'Desmarcar', hint: 'Quem sai é desmarcado da lista de pessoas.' },
  { id: 'repeat', label: 'Pode repetir', hint: 'Quem sai continua no sorteio.' },
]

function storageKey(userId: string) {
  return `raffle:v1:${userId}`
}

function loadSaved(userId: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    return s?.v === 1 ? s : null
  } catch {
    return null
  }
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr
  return pickWinners(arr, n)
}

function roleLabel(m: RaffleMember): string | null {
  if (m.role === 'coordenador') return 'Coordenação'
  if (m.role === 'dirigente') {
    return `Dirigente${m.leadership_section ? ` · ${SECTION_LABELS[m.leadership_section] || m.leadership_section}` : ''}`
  }
  return helperLabel(m)
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function eventLabel(e: RaffleEvent) {
  const sec = e.target_section ? SECTION_LABELS[e.target_section] || e.target_section : 'Geral'
  return `${formatEventDate(e.start_at)} · ${e.title} · ${sec}`
}

export function RaffleClient({
  userId,
  members,
  events,
}: {
  userId: string
  members: RaffleMember[]
  events: RaffleEvent[]
}) {
  const [supabase] = useState(() => createClient())

  const [hydrated, setHydrated] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [guests, setGuests] = useState<RaffleEntry[]>([])
  const [eventId, setEventId] = useState<string | null>(null)
  const [count, setCount] = useState(1)
  const [afterMode, setAfterMode] = useState<AfterMode>('keep')
  const [projector, setProjector] = useState(false)
  const [sound, setSound] = useState(true)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [viewFilter, setViewFilter] = useState<'all' | 'in' | 'out'>('all')
  const [guestName, setGuestName] = useState('')
  const [loadingEvent, setLoadingEvent] = useState(false)

  const [draw, setDraw] = useState<RaffleDraw | null>(null)
  const [drawDone, setDrawDone] = useState(false)

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const event = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId])
  const recommended = useMemo(() => recommendEvent(events), [events])

  // ── Evento → presenças ─────────────────────────────────────
  const applyEvent = useCallback(
    async (ev: RaffleEvent, opts: { auto?: boolean } = {}) => {
      setEventId(ev.id)
      setLoadingEvent(true)
      const { data, error } = await supabase
        .from('event_attendance')
        .select('user_id')
        .eq('event_id', ev.id)
        .in('status', ['presente', 'atrasado'])
      setLoadingEvent(false)
      if (error) {
        if (!opts.auto) toast.error('Não foi possível carregar as presenças.')
        return
      }
      const ids = (data || []).map((r) => r.user_id as string).filter((id) => memberById.has(id))
      if (ids.length === 0) {
        if (!opts.auto) toast.info('Este evento ainda não tem presenças marcadas — escolhe as pessoas à mão.')
        return
      }
      setSelected((prev) => new Set([...ids, ...[...prev].filter(isGuestId)]))
      toast.success(`${ids.length} ${ids.length === 1 ? 'pessoa presente' : 'pessoas presentes'} em "${ev.title}"`)
    },
    [supabase, memberById],
  )

  // ── Carregar do browser (temporário) ou do evento recomendado ─────
  useEffect(() => {
    const saved = loadSaved(userId)
    const fresh = saved && Date.now() - saved.savedAt < TEMP_MS
    if (saved) {
      setCount(Math.max(1, saved.count || 1))
      setAfterMode(saved.afterMode || 'keep')
      setProjector(!!saved.projector)
      setSound(saved.sound !== false)
      setHistory((saved.history || []).filter((h) => Date.now() - h.at < TEMP_MS))
    }
    if (fresh && (saved.selected.length > 0 || saved.guests.length > 0)) {
      setSelected(new Set(saved.selected.filter((id) => isGuestId(id) || memberById.has(id))))
      setGuests(saved.guests || [])
      setEventId(saved.eventId && events.some((e) => e.id === saved.eventId) ? saved.eventId : null)
    } else if (recommended) {
      applyEvent(recommended, { auto: true })
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const s: Saved = {
      v: 1,
      savedAt: Date.now(),
      selected: [...selected],
      guests,
      eventId,
      count,
      afterMode,
      projector,
      sound,
      history,
    }
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(s))
    } catch {
      /* armazenamento indisponível — segue sem guardar */
    }
  }, [hydrated, userId, selected, guests, eventId, count, afterMode, projector, sound, history])

  // ── Quem está em jogo ──────────────────────────────────────
  const historyIds = useMemo(() => new Set(history.map((h) => h.id)), [history])

  const selectedEntries = useMemo(() => {
    const list: RaffleEntry[] = []
    for (const m of members) if (selected.has(m.id)) list.push(memberEntry(m))
    for (const g of guests) if (selected.has(g.id)) list.push(g)
    return list
  }, [members, guests, selected])

  const pool = useMemo(
    () => (afterMode === 'keep' ? selectedEntries.filter((e) => !historyIds.has(e.id)) : selectedEntries),
    [selectedEntries, afterMode, historyIds],
  )
  const excludedCount = selectedEntries.length - pool.length

  const leadersSelected = useMemo(
    () => members.filter((m) => selected.has(m.id) && isLeaderFor(m, event)),
    [members, selected, event],
  )
  const helpersSelected = useMemo(
    () => members.filter((m) => selected.has(m.id) && isHelperFor(m, event)),
    [members, selected, event],
  )

  const leaderHint = !event
    ? 'todos os dirigentes e coordenadores'
    : !event.target_section
      ? 'os coordenadores (evento geral)'
      : `os dirigentes dos ${SECTION_LABELS[event.target_section] || event.target_section}`
  const helperHint = !event
    ? 'todos os ajudantes'
    : !event.target_section
      ? 'os ajudantes da coordenação'
      : `os ajudantes dos ${SECTION_LABELS[event.target_section] || event.target_section}`

  const removeIds = (ids: string[], label: string) => {
    if (ids.length === 0) return
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
    toast.success(`${label}: ${ids.length} fora do sorteio`)
  }

  // ── Lista de membros (filtros) ─────────────────────────────
  const sections = useMemo(() => {
    const s = new Set(members.map((m) => m.section).filter(Boolean) as string[])
    return Object.keys(SECTION_LABELS).filter((k) => s.has(k))
  }, [members])

  const filteredMembers = useMemo(() => {
    const q = search
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    return members.filter((m) => {
      if (sectionFilter !== 'all' && m.section !== sectionFilter) return false
      if (viewFilter === 'in' && !selected.has(m.id)) return false
      if (viewFilter === 'out' && selected.has(m.id)) return false
      if (!q) return true
      const name = (m.full_name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      return name.includes(q)
    })
  }, [members, search, sectionFilter, viewFilter, selected])

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
  }

  // ── Sincronização com o projetor ───────────────────────────
  const screenState: RaffleScreenState = useMemo(
    () => ({
      title: event?.title ?? null,
      pool: sample(pool, SCREEN_POOL_LIMIT),
      draw,
    }),
    [event, pool, draw],
  )

  const lastPushedDrawRef = useRef<string>('')
  useEffect(() => {
    if (!hydrated || !projector) return
    const push = () =>
      supabase
        .from('raffle_screens')
        .upsert({ host_id: userId, state: screenState, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.warn('raffle_screens:', error.message)
        })
    // Mudanças no sorteio vão já; mudanças na lista esperam um pouco (evita escrever a cada toque).
    const drawKey = draw ? `${draw.id}:${draw.revealAll}` : ''
    if (drawKey !== lastPushedDrawRef.current) {
      lastPushedDrawRef.current = drawKey
      push()
      return
    }
    const t = setTimeout(push, 600)
    return () => clearTimeout(t)
  }, [hydrated, projector, screenState, draw, supabase, userId])

  // Janela do projetor neste computador (BroadcastChannel — instantâneo, sem base de dados)
  const screenStateRef = useRef(screenState)
  screenStateRef.current = screenState
  const bcRef = useRef<BroadcastChannel | null>(null)
  const lastPingRef = useRef(0)
  const [localProjector, setLocalProjector] = useState(false)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(raffleLocalChannelName(userId))
    bcRef.current = bc
    const send = (m: RaffleLocalMessage) => bc.postMessage(m)
    bc.onmessage = (ev: MessageEvent<RaffleLocalMessage>) => {
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
    bcRef.current?.postMessage({ type: 'state', state: screenState } satisfies RaffleLocalMessage)
  }, [screenState])

  const openProjectorWindow = () => {
    unlockRaffleSound()
    const w = window.open(PROJECTOR_PATH, PROJECTOR_WINDOW_NAME, 'popup=yes,width=1280,height=720')
    if (!w) {
      // Na app do clube a janela não abre: a app mostra esta ferramenta no ecrã do projetor.
      if (!getClubApp()) toast.error('O browser bloqueou a janela. Permite pop-ups para este site e tenta outra vez.')
      return
    }
    w.focus()
  }

  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const projectorPath = PROJECTOR_PATH

  // ── Sortear ────────────────────────────────────────────────
  const maxCount = Math.max(1, pool.length)
  const effectiveCount = Math.min(count, maxCount)

  const startDraw = () => {
    unlockRaffleSound()
    // Tira o foco do botão para o Espaço seguinte ir para os atalhos (e não "clicar" outra vez)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    if (pool.length === 0) {
      toast.error('Não há ninguém no sorteio.')
      return
    }
    const winners = pickWinners(pool, effectiveCount)
    const others = pool.filter((p) => !winners.some((w) => w.id === p.id))
    const d: RaffleDraw = {
      id: newId(),
      pool: [...winners, ...sample(others, SCREEN_POOL_LIMIT - winners.length)],
      winners,
      revealAll: false,
    }
    setDraw(d)
    setDrawDone(false)

    const now = Date.now()
    const winnerIds = new Set(winners.map((w) => w.id))
    setHistory((prev) => [...prev.filter((h) => !winnerIds.has(h.id)), ...winners.map((w) => ({ ...w, at: now }))])
    if (afterMode === 'uncheck') setMany([...winnerIds], false)
  }

  const closeDraw = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    setDraw(null)
    setDrawDone(false)
  }

  const nextPoolCount = pool.length

  // Atalhos de teclado (para controlar no PC): Espaço/Enter sorteia, Esc fecha.
  const keysRef = useRef({ startDraw, closeDraw, draw, drawDone })
  keysRef.current = { startDraw, closeDraw, draw, drawDone }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, button, a, [contenteditable="true"]') || t.isContentEditable)) return
      const k = keysRef.current
      if (e.key === ' ' || e.key === 'Enter') {
        if (k.draw && !k.drawDone) return
        e.preventDefault()
        k.startDraw()
      } else if (e.key === 'Escape' && k.draw) {
        e.preventDefault()
        k.closeDraw()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-44 pt-6">
        <div className="flex items-center gap-3">
          <Link href="/admin?tab=tools" className="text-slate-500 hover:text-slate-700" title="Voltar às Ferramentas">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Shuffle className="h-6 w-6 text-blue-700" /> Sorteador
          </h1>
        </div>

        {/* Projetor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorPlay className="h-5 w-5 text-blue-700" /> Projetor
              {localProjector && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Janela ligada
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Abre a janela do projetor, arrasta-a para o ecrã do projetor e clica lá em &quot;ecrã inteiro&quot;. Controlas tudo a partir
              daqui (Espaço sorteia, Esc fecha).
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
                <label htmlFor="raffle-remote" className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                    <Smartphone className="h-4 w-4" /> Controlar a partir do telemóvel
                  </span>
                  <span className="block text-xs text-gray-500">
                    Para quando o projetor está noutro computador: este dispositivo controla e o outro mostra.
                  </span>
                </label>
                <Switch id="raffle-remote" checked={projector} onCheckedChange={setProjector} />
              </div>
              {projector && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-600">
                    No computador do projetor, entra com <b>a tua conta</b> e abre <b>Gestão → Ferramentas → Ecrã do projetor</b>, ou
                    este endereço:
                  </p>
                  <div className="flex gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-100 px-3 py-2.5 text-xs text-gray-700">
                      {origin}
                      {projectorPath}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(`${origin}${projectorPath}`)
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
              <CalendarDays className="h-5 w-5 text-blue-700" /> Evento
            </CardTitle>
            <CardDescription>Escolhe um evento para pôr no sorteio quem está marcado como presente ou atrasado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommended && recommended.id !== eventId && (
              <button
                type="button"
                onClick={() => applyEvent(recommended)}
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
                  if (ev) applyEvent(ev)
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
                  onClick={() => applyEvent(event)}
                  disabled={loadingEvent}
                  title="Voltar a carregar as presenças"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw className={`h-4 w-4 ${loadingEvent ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pessoas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-blue-700" /> Quem entra no sorteio
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-black text-blue-700">{selectedEntries.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Atalhos */}
            <div className="flex flex-wrap gap-2">
              <QuickButton
                disabled={!selected.has(userId)}
                onClick={() => removeIds([userId], 'Eu')}
                icon={<UserMinus className="h-4 w-4" />}
              >
                Tirar-me
              </QuickButton>
              <QuickButton
                disabled={leadersSelected.length === 0}
                onClick={() => removeIds(leadersSelected.map((m) => m.id), 'Dirigentes')}
                icon={<UserMinus className="h-4 w-4" />}
                title={`Tira ${leaderHint}`}
              >
                Tirar dirigentes{leadersSelected.length > 0 && ` (${leadersSelected.length})`}
              </QuickButton>
              <QuickButton
                disabled={helpersSelected.length === 0}
                onClick={() => removeIds(helpersSelected.map((m) => m.id), 'Ajudantes')}
                icon={<UserMinus className="h-4 w-4" />}
                title={`Tira ${helperHint}`}
              >
                Tirar ajudantes{helpersSelected.length > 0 && ` (${helpersSelected.length})`}
              </QuickButton>
            </div>
            <p className="-mt-2 text-xs text-gray-500">
              &quot;Tirar dirigentes&quot; tira {leaderHint}; &quot;Tirar ajudantes&quot; tira {helperHint}.
            </p>

            {/* Filtros */}
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
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'in', 'out'] as const).map((v) => (
                  <FilterPill key={v} active={viewFilter === v} onClick={() => setViewFilter(v)}>
                    {v === 'all' ? 'Todos' : v === 'in' ? 'No sorteio' : 'Fora'}
                  </FilterPill>
                ))}
                {sections.length > 1 && <span className="mx-1 w-px self-stretch bg-gray-200" />}
                {sections.length > 1 && (
                  <FilterPill active={sectionFilter === 'all'} onClick={() => setSectionFilter('all')}>
                    Todas as classes
                  </FilterPill>
                )}
                {sections.length > 1 &&
                  sections.map((s) => (
                    <FilterPill key={s} active={sectionFilter === s} onClick={() => setSectionFilter(s)}>
                      {SECTION_LABELS[s]}
                    </FilterPill>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-500">{filteredMembers.length} na lista</span>
              <span className="flex gap-3">
                <button
                  type="button"
                  className="font-bold text-blue-700 hover:underline"
                  onClick={() => setMany(filteredMembers.map((m) => m.id), true)}
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  className="font-bold text-gray-500 hover:underline"
                  onClick={() => setMany(filteredMembers.map((m) => m.id), false)}
                >
                  Desmarcar todos
                </button>
              </span>
            </div>

            <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
              {filteredMembers.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">Ninguém encontrado.</li>}
              {filteredMembers.map((m) => {
                const on = selected.has(m.id)
                const entry = memberEntry(m)
                const badge = roleLabel(m)
                const drawn = historyIds.has(m.id)
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${on ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
                    >
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 ${
                          on ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <EntryAvatar entry={entry} className="size-9" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-bold ${on ? 'text-gray-900' : 'text-gray-500'}`}>
                          {m.full_name || entry.name}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                          {m.section && <span>{SECTION_LABELS[m.section] || m.section}</span>}
                          {badge && <span className="rounded bg-slate-100 px-1.5 font-bold text-slate-600">{badge}</span>}
                          {m.id === userId && <span className="rounded bg-blue-100 px-1.5 font-bold text-blue-700">Eu</span>}
                          {drawn && <span className="rounded bg-amber-100 px-1.5 font-bold text-amber-700">Já saiu</span>}
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
                        className={`inline-flex items-center gap-1 rounded-full border py-1 pl-1 pr-1.5 text-sm font-bold ${
                          on ? 'border-blue-200 bg-white text-gray-900' : 'border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(g.id)}
                          className="inline-flex items-center gap-1.5"
                          title={on ? 'Tirar do sorteio' : 'Pôr no sorteio'}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                              on ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300'
                            }`}
                          >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          {g.name}
                          {historyIds.has(g.id) && <span className="text-[10px] text-amber-600">★</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGuest(g.id)}
                          className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
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

        {/* Depois de sair + já sorteados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Depois de alguém sair</CardTitle>
            <CardDescription>{AFTER_MODES.find((m) => m.id === afterMode)?.hint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
              {AFTER_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAfterMode(m.id)}
                  className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors sm:text-sm ${
                    afterMode === m.id ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {history.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Já sorteados ({history.length})</p>
                  <button
                    type="button"
                    onClick={() => setHistory([])}
                    className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[...history].reverse().map((h) => (
                    <span
                      key={h.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 py-1 pl-1 pr-1.5 text-sm font-bold text-gray-800"
                    >
                      <EntryAvatar entry={h} className="size-6" />
                      {h.name}
                      <span className="text-[10px] font-medium text-gray-400">
                        {new Date(h.at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setHistory((prev) => prev.filter((x) => x.id !== h.id))}
                        className="rounded-full p-0.5 text-gray-400 hover:bg-amber-100 hover:text-gray-700"
                        title="Voltar a poder sair"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">Fica guardado só neste dispositivo e apaga-se sozinho ao fim de 12 horas.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Barra de sortear */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex flex-shrink-0 flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Quantos</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCount((c) => Math.max(1, Math.min(c, maxCount) - 1))}
                disabled={effectiveCount <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-xl font-black text-gray-900">{effectiveCount}</span>
              <button
                type="button"
                onClick={() => setCount((c) => Math.min(maxCount, c + 1))}
                disabled={effectiveCount >= maxCount}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={startDraw}
            disabled={pool.length === 0}
            className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl bg-gradient-to-r from-blue-800 to-indigo-700 font-black text-white shadow-lg transition-transform active:scale-[0.98] disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
          >
            <span className="flex items-center gap-2 text-lg">
              <Shuffle className="h-5 w-5" /> Sortear
            </span>
            <span className="text-[11px] font-bold text-white/75">
              {pool.length} em jogo{excludedCount > 0 && ` · ${excludedCount} já saíram`}
            </span>
          </button>
        </div>
      </div>

      {draw && (
        <DrawOverlay
          draw={draw}
          title={event?.title ?? null}
          // Com a janela do projetor ligada, o som toca só lá (senão ouvia-se a dobrar)
          sound={sound && !localProjector}
          onToggleSound={() => setSound((s) => !s)}
          done={drawDone}
          onDone={() => setDrawDone(true)}
          onRevealAll={() => setDraw((d) => (d ? { ...d, revealAll: true } : d))}
          onClose={closeDraw}
          onAgain={startDraw}
          nextPoolCount={nextPoolCount}
          nextCount={Math.min(count, Math.max(1, nextPoolCount))}
          projector={projector || localProjector}
          soundOnProjector={localProjector}
        />
      )}
    </>
  )
}

function DrawOverlay({
  draw,
  title,
  sound,
  onToggleSound,
  done,
  onDone,
  onRevealAll,
  onClose,
  onAgain,
  nextPoolCount,
  nextCount,
  projector,
  soundOnProjector,
}: {
  draw: RaffleDraw
  title: string | null
  sound: boolean
  onToggleSound: () => void
  done: boolean
  onDone: () => void
  onRevealAll: () => void
  onClose: () => void
  onAgain: () => void
  nextPoolCount: number
  nextCount: number
  projector: boolean
  /** O som toca na janela do projetor — o botão de som aqui não faz nada. */
  soundOnProjector: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isFull, setIsFull] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else ref.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950 text-white"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-blue-200">
          {title ? `Sorteio · ${title}` : 'Sorteio'}
          {projector && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase">No projetor</span>}
        </p>
        {!soundOnProjector && (
          <button type="button" onClick={onToggleSound} className="rounded-lg p-2 text-blue-200 hover:bg-white/10" title="Som">
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        )}
        {typeof document !== 'undefined' && document.fullscreenEnabled && (
          <button type="button" onClick={toggleFull} className="rounded-lg p-2 text-blue-200 hover:bg-white/10" title="Ecrã inteiro">
            {isFull ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-blue-200 hover:bg-white/10" title="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <RaffleStage key={draw.id} draw={draw} variant="phone" sound={sound} onDone={onDone} />
      </div>

      <div className="flex flex-col gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 sm:flex-row sm:justify-center">
        {!done ? (
          draw.winners.length > 1 && (
            <button
              type="button"
              onClick={onRevealAll}
              className="h-12 rounded-2xl bg-white/10 px-6 font-bold text-white hover:bg-white/15"
            >
              Revelar todos já
            </button>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={onAgain}
              disabled={nextPoolCount === 0}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 font-black text-slate-900 hover:bg-amber-300 disabled:opacity-40"
            >
              <Shuffle className="h-5 w-5" /> Sortear de novo ({nextCount} de {nextPoolCount})
            </button>
            <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-white/10 px-6 font-bold text-white hover:bg-white/15">
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function QuickButton({
  children,
  icon,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-700"
    >
      {icon}
      {children}
    </button>
  )
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
