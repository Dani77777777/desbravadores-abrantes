'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Plus, Trophy, Coins, Calendar, MapPin, Trash2, ListChecks, Pencil, Share2, AlertTriangle, RotateCcw,
  Loader2, Copy, Megaphone, Search, Globe, CalendarClock, Activity, Clock, Info, CheckCircle2, Video,
} from 'lucide-react'
import { fmtRsvpDeadline, summarizeRsvps, type RsvpRow } from '@/utils/event-rsvp'
import { RsvpCountsButton, RsvpSettings, RsvpSummaryDialog } from './EventRsvpAdmin'
import { EventAttendanceManager } from './EventAttendanceManager'
import { EventShareDialog } from '@/components/events/EventShareDialog'
import { EventPlaceField } from '@/components/events/EventPlaceField'
import { googleMapsUrl, placeCoords, type Coords, type EventPlace } from '@/utils/maps'
import { isOnlineEvent, normalizeUrl, onlineLabel, onlinePlatform, type OnlinePlace } from '@/utils/online-event'
import { displayFont } from '@/components/landing/fonts'
import {
  SECTION_LABELS, attendanceByEvent, averageRate, daysUntil, fmtLong, fmtParts, fmtShort, relativeDayLabel,
  toLocalInput, type AttendanceRow,
} from './event-utils'

const D = displayFont.className

interface EventPanelProps {
  profile: any
  members: any[]
  events: any[]
  attendance?: AttendanceRow[]
  rsvps?: RsvpRow[]
}

type Filter = 'upcoming' | 'overdue' | 'history'

/** Texto automático do comunicado de um evento novo. */
function newEventAnnouncement(f: {
  title: string; startAt: string; location: string; description: string; xp: number; gold: number; rsvp: boolean; rsvpDeadline: string
  online: boolean; onlineUrl: string
}) {
  const when = f.startAt ? fmtLong(new Date(f.startAt).toISOString()) : '(data por definir)'
  const url = f.online ? normalizeUrl(f.onlineUrl) : null
  const platform = onlinePlatform(url)
  const where = f.online ? `, online${platform ? ` (${platform})` : ''}` : f.location ? `, em ${f.location}` : ''
  const parts = [`${f.title || 'Novo evento'} — ${when}${where}.`]
  if (f.description.trim()) parts.push(f.description.trim())
  if (f.online) parts.push(url ? `Link para entrar: ${url}` : 'O link para entrar vai estar no Painel.')
  if (f.xp > 0 || f.gold > 0) parts.push(`Recompensas: ${f.xp} XP e ${f.gold} Gold.`)
  if (f.rsvp) {
    parts.push(
      f.rsvpDeadline
        ? `Confirma no Painel se vais (Vou / Não vou) até ${fmtRsvpDeadline(new Date(f.rsvpDeadline).toISOString())}.`
        : 'Confirma no Painel se vais (Vou / Não vou).',
    )
  }
  return { title: `Novo Evento: ${f.title || '...'} 📅`, message: parts.join('\n\n') }
}

export function EventPanel({ profile, members, events, attendance = [], rsvps = [] }: EventPanelProps) {
  const supabase = createClient()
  const router = useRouter()
  // Mantém o resumo actualizado logo após a liderança responder por alguém.
  // O router.refresh() posterior confirma estes dados no servidor.
  const [rsvpRows, setRsvpRows] = useState<RsvpRow[]>(rsvps)
  const isDirigente = profile.role === 'dirigente'
  const defaultTarget = isDirigente ? (profile.leadership_section || profile.section) : '__all__'

  // Create event form
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [coords, setCoords] = useState<Coords | null>(null)
  const [online, setOnline] = useState(false)
  const [onlineUrl, setOnlineUrl] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [targetSection, setTargetSection] = useState<string>(defaultTarget)
  const [xpReward, setXpReward] = useState(50)
  const [goldReward, setGoldReward] = useState(10)
  const [lateDiscount, setLateDiscount] = useState(25)
  const [absentPenalty, setAbsentPenalty] = useState(0)
  const [rsvpEnabled, setRsvpEnabled] = useState(false)
  const [rsvpDeadline, setRsvpDeadline] = useState('')
  const [creating, setCreating] = useState(false)
  // Comunicado do evento novo (opcional). Enquanto não for editado à mão, acompanha o formulário.
  const [announceCreate, setAnnounceCreate] = useState(true)
  const [annEdited, setAnnEdited] = useState(false)
  const [annTitle, setAnnTitle] = useState('')
  const [annMessage, setAnnMessage] = useState('')

  // Reschedule state
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [reschedulingEvent, setReschedulingEvent] = useState<any>(null)
  const [newStartAt, setNewStartAt] = useState('')
  const [newEndAt, setNewEndAt] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [announceReschedule, setAnnounceReschedule] = useState(true)

  // Cancel state
  const [cancelEvent, setCancelEvent] = useState<any>(null)
  const [announceCancel, setAnnounceCancel] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  // Attendance Manager
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)

  // Current time (updated every minute, starts at 0 to avoid SSR hydration mismatch)
  const [now, setNow] = useState(0)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Share event state
  const [shareOpen, setShareOpen] = useState(false)
  const [sharingEvent, setSharingEvent] = useState<any>(null)

  // Edit event state
  const [editOpen, setEditOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<any>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editCoords, setEditCoords] = useState<Coords | null>(null)
  const [editOnline, setEditOnline] = useState(false)
  const [editOnlineUrl, setEditOnlineUrl] = useState('')
  const [editXpReward, setEditXpReward] = useState(50)
  const [editGoldReward, setEditGoldReward] = useState(10)
  const [editLateDiscount, setEditLateDiscount] = useState(25)
  const [editAbsentPenalty, setEditAbsentPenalty] = useState(0)
  const [editRsvpEnabled, setEditRsvpEnabled] = useState(false)
  const [editRsvpDeadline, setEditRsvpDeadline] = useState('')
  const [updating, setUpdating] = useState(false)

  // Quem vai / não vai / sem resposta
  const [rsvpEvent, setRsvpEvent] = useState<any>(null)

  // Lista
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setRsvpRows(rsvps)
  }, [rsvps])

  // Texto automático do comunicado (até ser editado à mão)
  const autoAnn = newEventAnnouncement({
    title, startAt, location, description, xp: xpReward, gold: goldReward, rsvp: rsvpEnabled, rsvpDeadline,
    online, onlineUrl,
  })
  const shownAnnTitle = annEdited ? annTitle : autoAnn.title
  const shownAnnMessage = annEdited ? annMessage : autoAnn.message

  /**
   * Campos do local para gravar: presencial (texto + ponto) ou online (link).
   * Os de "online" só vão quando contam, para funcionar antes da migração.
   */
  const placeFields = (p: { online: boolean; location: string; coords: Coords | null; url: string; before?: EventPlace & OnlinePlace }) => {
    const hadCoords = !!(p.before && placeCoords(p.before))
    if (p.online) {
      return {
        location: null,
        ...(hadCoords ? { location_lat: null, location_lng: null } : {}),
        is_online: true,
        online_url: normalizeUrl(p.url),
      }
    }
    return {
      location: p.location || null,
      // Só envia as coordenadas quando há ponto (funciona mesmo antes da migração do mapa)
      ...(p.coords || hadCoords ? { location_lat: p.coords?.lat ?? null, location_lng: p.coords?.lng ?? null } : {}),
      ...(p.before && isOnlineEvent(p.before) ? { is_online: false, online_url: null } : {}),
    }
  }

  /** Envia um comunicado para o público do evento (todos ou a classe). Devolve nº de destinatários. */
  const sendEventAnnouncement = async (section: string | null, annT: string, annM: string) => {
    const { data, error } = await supabase.rpc('send_announcement', {
      p_title: annT,
      p_message: annM,
      p_audience: section ? 'section' : 'global',
      p_section: section,
      p_member_ids: null,
    })
    if (error) throw error
    return (data as { recipients: number } | null)?.recipients ?? 0
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (endAt && new Date(endAt) <= new Date(startAt)) {
      toast.error('O fim tem de ser depois do início.')
      return
    }
    if (rsvpEnabled && rsvpDeadline && new Date(rsvpDeadline) > new Date(startAt)) {
      toast.error('O prazo para responder tem de ser antes do início do evento.')
      return
    }
    if (online && onlineUrl.trim() && !normalizeUrl(onlineUrl)) {
      toast.error('O link da reunião não é válido.')
      return
    }
    setCreating(true)
    try {
      const section = targetSection === '__all__' ? null : targetSection
      const { error } = await supabase.from('events').insert({
        title,
        description: description || null,
        ...placeFields({ online, location, coords, url: onlineUrl }),
        start_at: new_date_with_time(startAt),
        end_at: endAt ? new_date_with_time(endAt) : null,
        target_section: section,
        xp_reward: xpReward,
        gold_reward: goldReward,
        late_discount_percent: lateDiscount / 100,
        absent_penalty_percent: absentPenalty / 100,
        rsvp_enabled: rsvpEnabled,
        rsvp_deadline: rsvpEnabled && rsvpDeadline ? new_date_with_time(rsvpDeadline) : null,
        created_by: profile.id,
      })

      if (error) throw error

      if (announceCreate) {
        try {
          const n = await sendEventAnnouncement(section, shownAnnTitle.trim(), shownAnnMessage.trim())
          toast.success(`Evento criado e comunicado enviado a ${n} ${n === 1 ? 'pessoa' : 'pessoas'}!`)
        } catch (annErr: any) {
          toast.warning(`Evento criado, mas o comunicado não foi enviado: ${annErr.message || 'erro desconhecido'}`)
        }
      } else {
        toast.success('Evento criado (sem comunicado).')
      }
      setCreateOpen(false)
      resetForm()
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar evento.')
    } finally {
      setCreating(false)
    }
  }

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reschedulingEvent) return
    if (newEndAt && new Date(newEndAt) <= new Date(newStartAt)) {
      toast.error('O fim tem de ser depois do início.')
      return
    }
    setRescheduling(true)
    try {
      const { error } = await supabase.from('events').update({
        start_at: new_date_with_time(newStartAt),
        end_at: newEndAt ? new_date_with_time(newEndAt) : null,
        updated_at: new Date().toISOString()
      }).eq('id', reschedulingEvent.id)

      if (error) throw error

      if (announceReschedule) {
        try {
          await sendEventAnnouncement(
            reschedulingEvent.target_section,
            `Evento Reagendado: ${reschedulingEvent.title} 📅`,
            `O evento "${reschedulingEvent.title}" foi reagendado para ${fmtLong(new Date(newStartAt).toISOString())}. Por favor, verifica a nova data.`,
          )
          toast.success('Evento reagendado e comunicado enviado!')
        } catch (annErr: any) {
          toast.warning(`Evento reagendado, mas o comunicado não foi enviado: ${annErr.message || 'erro desconhecido'}`)
        }
      } else {
        toast.success('Evento reagendado (sem comunicado).')
      }
      setRescheduleOpen(false)
      setReschedulingEvent(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reagendar evento.')
    } finally {
      setRescheduling(false)
    }
  }

  const handleEditEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEvent) return
    if (editRsvpEnabled && editRsvpDeadline && new Date(editRsvpDeadline) > new Date(editingEvent.start_at)) {
      toast.error('O prazo para responder tem de ser antes do início do evento.')
      return
    }
    if (editOnline && editOnlineUrl.trim() && !normalizeUrl(editOnlineUrl)) {
      toast.error('O link da reunião não é válido.')
      return
    }
    setUpdating(true)
    try {
      const { error } = await supabase.from('events').update({
        title: editTitle.trim() || editingEvent.title,
        description: editDescription || null,
        ...placeFields({ online: editOnline, location: editLocation, coords: editCoords, url: editOnlineUrl, before: editingEvent }),
        xp_reward: editXpReward,
        gold_reward: editGoldReward,
        late_discount_percent: editLateDiscount / 100,
        absent_penalty_percent: editAbsentPenalty / 100,
        rsvp_enabled: editRsvpEnabled,
        rsvp_deadline: editRsvpEnabled && editRsvpDeadline ? new_date_with_time(editRsvpDeadline) : null,
        updated_at: new Date().toISOString()
      }).eq('id', editingEvent.id)

      if (error) throw error

      toast.success('Evento atualizado com sucesso!')
      setEditOpen(false)
      setEditingEvent(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar evento.')
    } finally {
      setUpdating(false)
    }
  }

  const handleCancelEvent = async () => {
    const event = cancelEvent
    if (!event) return
    setCancelling(true)
    try {
      // 1. Apagar o evento (se falhar, não se envia um comunicado de cancelamento falso)
      const { error } = await supabase.from('events').delete().eq('id', event.id)
      if (error) throw error

      // 2. Comunicado de cancelamento (opcional)
      if (announceCancel) {
        try {
          await sendEventAnnouncement(
            event.target_section,
            `Evento Cancelado: ${event.title} ❌`,
            `O evento "${event.title}" que estava marcado para ${fmtLong(event.start_at)} foi cancelado.`,
          )
          toast.success('Evento cancelado e comunicado enviado.')
        } catch (annErr: any) {
          toast.warning(`Evento cancelado, mas o comunicado não foi enviado: ${annErr.message || 'erro desconhecido'}`)
        }
      } else {
        toast.success('Evento apagado (sem comunicado).')
      }
      setCancelEvent(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cancelar evento.')
    } finally {
      setCancelling(false)
    }
  }

  const new_date_with_time = (val: string) => {
    return new Date(val).toISOString()
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setLocation('')
    setCoords(null)
    setOnline(false)
    setOnlineUrl('')
    setStartAt('')
    setEndAt('')
    setTargetSection(defaultTarget)
    setXpReward(50)
    setGoldReward(10)
    setLateDiscount(25)
    setAbsentPenalty(0)
    setRsvpEnabled(false)
    setRsvpDeadline('')
    setAnnounceCreate(true)
    setAnnEdited(false)
    setAnnTitle('')
    setAnnMessage('')
  }

  const openCreate = () => {
    resetForm()
    setCreateOpen(true)
  }

  /** Duplicar: mesmo evento, na mesma hora da semana seguinte (ou a próxima que ainda não passou). */
  const openDuplicate = (event: any) => {
    resetForm()
    const start = new Date(event.start_at)
    const duration = event.end_at ? new Date(event.end_at).getTime() - start.getTime() : null
    const ref = Date.now()
    do { start.setDate(start.getDate() + 7) } while (start.getTime() <= ref)
    setTitle(event.title)
    setDescription(event.description || '')
    setLocation(event.location || '')
    setCoords(placeCoords(event))
    setOnline(isOnlineEvent(event))
    setOnlineUrl(event.online_url || '')
    setStartAt(toLocalInput(start))
    setEndAt(duration !== null ? toLocalInput(new Date(start.getTime() + duration)) : '')
    setTargetSection(isDirigente ? defaultTarget : (event.target_section || '__all__'))
    setXpReward(event.xp_reward ?? 50)
    setGoldReward(event.gold_reward ?? 10)
    setLateDiscount(Math.round((event.late_discount_percent ?? 0.25) * 100))
    setAbsentPenalty(Math.round((event.absent_penalty_percent ?? 0) * 100))
    // Confirmação de presença: mesmo prazo relativo ao início (ex.: 2 dias antes)
    setRsvpEnabled(!!event.rsvp_enabled)
    setRsvpDeadline(
      event.rsvp_enabled && event.rsvp_deadline
        ? toLocalInput(new Date(start.getTime() - (new Date(event.start_at).getTime() - new Date(event.rsvp_deadline).getTime())))
        : '',
    )
    setCreateOpen(true)
  }

  const openEdit = (event: any) => {
    setEditingEvent(event)
    setEditTitle(event.title || '')
    setEditDescription(event.description || '')
    setEditLocation(event.location || '')
    setEditCoords(placeCoords(event))
    setEditOnline(isOnlineEvent(event))
    setEditOnlineUrl(event.online_url || '')
    setEditXpReward(event.xp_reward)
    setEditGoldReward(event.gold_reward)
    setEditLateDiscount(Math.round((event.late_discount_percent ?? 0.25) * 100))
    setEditAbsentPenalty(Math.round((event.absent_penalty_percent ?? 0) * 100))
    setEditRsvpEnabled(!!event.rsvp_enabled)
    setEditRsvpDeadline(event.rsvp_deadline ? toLocalInput(event.rsvp_deadline) : '')
    setEditOpen(true)
  }

  const openReschedule = (event: any) => {
    setReschedulingEvent(event)
    setNewStartAt(toLocalInput(event.start_at))
    setNewEndAt(event.end_at ? toLocalInput(event.end_at) : '')
    setAnnounceReschedule(true)
    setRescheduleOpen(true)
  }

  // Revert a finished event: remove awarded points and reopen for correction
  const [revertingId, setRevertingId] = useState<string | null>(null)

  const handleRevertEvent = async (event: any) => {
    if (!confirm(`Reverter o evento "${event.title}"?\n\nOs pontos (XP/Ouro) atribuídos a todos os membros serão removidos e o evento voltará ao estado "por finalizar" para corrigires a atribuição. As presenças marcadas são mantidas.`)) return
    setRevertingId(event.id)
    try {
      const { error } = await supabase.rpc('revert_event_points', { p_event_id: event.id })
      if (error) throw error
      toast.success('Evento revertido. Os pontos foram removidos — podes corrigir a atribuição.')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reverter evento.')
    } finally {
      setRevertingId(null)
    }
  }

  /** Membros a quem o evento se destina (a secção dele, ou todos). */
  const audienceOf = (e: any) => (e.target_section ? members.filter(m => m.section === e.target_section) : members)

  // ── Dados da lista ─────────────────────────────────────────────────────────
  const attendanceMap = attendanceByEvent(attendance)
  const avgAttendance = averageRate(attendanceMap.values())
  const isOverdue = (e: any) => {
    if (e.is_finished || now === 0) return false
    const end = e.end_at ? new Date(e.end_at).getTime() : new Date(e.start_at).getTime()
    return now >= end
  }
  const upcomingEvents = events.filter(e => !e.is_finished).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const overdueEvents = upcomingEvents.filter(isOverdue)
  const pastEvents = events.filter(e => e.is_finished).sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
  const thisWeek = now
    ? upcomingEvents.filter(e => { const d = daysUntil(e.start_at, now); return d >= 0 && d <= 7 })
    : []

  const q = search.trim().toLowerCase()
  const matches = (e: any) =>
    !q || [e.title, e.location, e.description, isOnlineEvent(e) ? onlineLabel(e) : null].some((v: string | null) => v?.toLowerCase().includes(q))
  const listed = (filter === 'history' ? pastEvents : filter === 'overdue' ? overdueEvents : upcomingEvents).filter(matches)

  const summary = [
    { icon: CalendarClock, label: 'Próximos', value: upcomingEvents.length - overdueEvents.length, tone: 'bg-indigo-500' },
    { icon: Calendar, label: 'Próximos 7 dias', value: thisWeek.length, tone: 'bg-blue-600' },
    { icon: AlertTriangle, label: 'Por fechar', value: overdueEvents.length, tone: overdueEvents.length ? 'bg-amber-500' : 'bg-stone-300' },
    { icon: Activity, label: 'Presença média', value: avgAttendance === null ? '—' : `${avgAttendance}%`, tone: 'bg-teal-500' },
  ]

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Próximos', count: upcomingEvents.length },
    { key: 'overdue', label: 'Por fechar', count: overdueEvents.length },
    { key: 'history', label: 'Histórico', count: pastEvents.length },
  ]

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ──────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className={`${D} text-3xl font-extrabold tracking-tight text-blue-950`}>Eventos</h2>
          <p className="text-sm text-stone-500">Agenda reuniões, acampamentos e atividades para atribuir pontos.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-6 font-extrabold text-blue-950 shadow-[0_12px_28px_-12px_rgba(250,204,21,.8)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300"
        >
          <Plus className="h-4 w-4" /> Novo Evento
        </button>
      </div>

      {/* ── Resumo ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map(s => (
          <div key={s.label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className={`${D} text-2xl font-extrabold leading-none text-blue-950`}>{s.value}</p>
              <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-stone-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Filtros + pesquisa */}
          <div className="flex flex-col gap-3 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-stone-200 sm:flex-row sm:items-center">
            <div className="flex gap-1 overflow-x-auto">
              {filters.map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                    filter === f.key ? 'bg-blue-950 text-white' : 'text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] font-extrabold ${
                      filter === f.key ? 'bg-white/20' : f.key === 'overdue' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative sm:ml-auto sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Procurar eventos..."
                className="h-10 rounded-xl border-stone-200 bg-stone-50 pl-9"
              />
            </div>
          </div>

          {/* Lista */}
          {listed.length === 0 && (
            <div className="rounded-[1.75rem] border-2 border-dashed border-stone-200 bg-white py-14 text-center">
              <Calendar className="mx-auto h-10 w-10 text-stone-300" />
              <p className="mt-3 font-bold text-blue-950">
                {q ? 'Nenhum evento encontrado.' : filter === 'history' ? 'Ainda não há eventos concluídos.' : filter === 'overdue' ? 'Nada por fechar. 🙌' : 'Não há eventos marcados.'}
              </p>
            </div>
          )}

          {filter !== 'history' && listed.map(event => {
            const startMs = new Date(event.start_at).getTime()
            const showAttendance = now > 0 && now >= startMs - 60 * 60 * 1000
            const overdue = isOverdue(event)
            const p = fmtParts(event.start_at)
            const d = now ? daysUntil(event.start_at, now) : null

            return (
              <article
                key={event.id}
                className={`flex flex-col gap-4 rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 transition-shadow hover:shadow-md sm:flex-row sm:p-5 ${overdue ? 'ring-amber-300' : 'ring-stone-200'}`}
              >
                <div className="flex shrink-0 items-start gap-4 sm:block">
                  <div className="w-16 overflow-hidden rounded-2xl bg-white text-center shadow-sm ring-1 ring-stone-200">
                    <div className="bg-red-500 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">{p.month}</div>
                    <div className={`${D} text-3xl font-extrabold leading-tight text-blue-950`}>{p.day}</div>
                    <div className="pb-1 text-[10px] font-bold capitalize text-stone-400">{p.weekday}</div>
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-lg font-extrabold leading-tight text-blue-950">{event.title}</h3>
                    {d !== null && !overdue && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${d <= 1 ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {relativeDayLabel(d)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {p.time}{event.end_at ? ` – ${fmtParts(event.end_at).time}` : ''}</span>
                    {isOnlineEvent(event) ? (event.online_url ? (
                      <a href={event.online_url} target="_blank" rel="noopener noreferrer" title="Abrir o link da reunião" className="flex items-center gap-1 hover:text-blue-700 hover:underline">
                        <Video className="h-3.5 w-3.5 text-blue-600" /> {onlineLabel(event)}
                      </a>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-700" title="Falta o link — acrescenta-o em Editar"><Video className="h-3.5 w-3.5" /> Online · sem link</span>
                    )) : event.location && (placeCoords(event) ? (
                      <a href={googleMapsUrl(event)!} target="_blank" rel="noopener noreferrer" title="Abrir no mapa" className="flex items-center gap-1 hover:text-blue-700 hover:underline">
                        <MapPin className="h-3.5 w-3.5 text-red-500" /> {event.location}
                      </a>
                    ) : (
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {event.location}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-stone-600">
                      {event.target_section ? SECTION_LABELS[event.target_section] : 'Todos'}
                    </span>
                    {!event.target_section && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-700" title="Eventos para Todos aparecem na página inicial do site para visitantes">
                        <Globe className="h-3 w-3" /> Página inicial
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-extrabold text-indigo-600"><Trophy className="h-3 w-3" /> {event.xp_reward} XP</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-600"><Coins className="h-3 w-3" /> {event.gold_reward} Gold</span>
                  </div>
                  {event.rsvp_enabled && (
                    <RsvpCountsButton
                      summary={summarizeRsvps(event.id, rsvpRows, audienceOf(event).map((m) => m.id))}
                      deadline={event.rsvp_deadline}
                      onClick={() => setRsvpEvent(event)}
                    />
                  )}
                  {overdue && (
                    <div className="mt-1 flex w-fit items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {event.end_at ? 'Evento terminado — regista as presenças!' : 'Já começou — regista as presenças no fim.'}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:w-40">
                  {showAttendance && (
                    <Button
                      size="sm"
                      className="gap-1.5 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700"
                      onClick={() => { setSelectedEvent(event); setAttendanceOpen(true) }}
                    >
                      <ListChecks className="h-4 w-4" /> Presenças
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-xl border-blue-200 font-bold text-blue-700 hover:bg-blue-50"
                    onClick={() => openReschedule(event)}
                  >
                    <Calendar className="h-4 w-4" /> Reagendar
                  </Button>
                  <div className="flex justify-between gap-1 sm:justify-end">
                    <IconAction title="Partilhar evento" onClick={() => { setSharingEvent(event); setShareOpen(true) }}><Share2 className="h-4 w-4" /></IconAction>
                    <IconAction title="Duplicar (mesma hora, próxima semana)" onClick={() => openDuplicate(event)}><Copy className="h-4 w-4" /></IconAction>
                    <IconAction title="Editar evento" onClick={() => openEdit(event)}><Pencil className="h-4 w-4" /></IconAction>
                    <IconAction title="Cancelar evento" danger onClick={() => { setCancelEvent(event); setAnnounceCancel(true) }}><Trash2 className="h-4 w-4" /></IconAction>
                  </div>
                </div>
              </article>
            )
          })}

          {filter === 'history' && listed.map(event => {
            const s = attendanceMap.get(event.id)
            const rateCls = s?.rate == null ? 'bg-stone-300' : s.rate >= 80 ? 'bg-emerald-500' : s.rate >= 60 ? 'bg-amber-400' : 'bg-rose-500'
            return (
              <article key={event.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold text-blue-950">{event.title}</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Concluído
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    {fmtShort(event.start_at)} · {event.target_section ? SECTION_LABELS[event.target_section] : 'Todos'}
                  </p>
                  {s ? (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-stone-100">
                        <div className={`h-full rounded-full ${rateCls}`} style={{ width: `${s.rate ?? 0}%` }} />
                      </div>
                      <span className="text-xs font-extrabold text-blue-950">{s.rate}%</span>
                      <span className="text-[11px] text-stone-400">
                        {s.present} presentes · {s.late} atrasados · {s.absent} faltas
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-stone-400">Presenças fora dos últimos 15 eventos concluídos.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-stone-600 hover:text-blue-700" onClick={() => { setSelectedEvent(event); setAttendanceOpen(true) }}>
                    <ListChecks className="h-3.5 w-3.5" /> Presenças
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-stone-600 hover:text-blue-700" onClick={() => openDuplicate(event)}>
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-stone-600 hover:text-orange-600"
                    title="Reverter atribuição de pontos"
                    onClick={() => handleRevertEvent(event)}
                    disabled={revertingId === event.id}
                  >
                    {revertingId === event.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Reverter
                  </Button>
                </div>
              </article>
            )
          })}
        </div>

        {/* ── Lateral ─────────────────────────────────────────── */}
        <aside className="space-y-5">
          <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-stone-200">
            <h3 className={`${D} flex items-center gap-2 text-lg font-extrabold text-blue-950`}>
              <CalendarClock className="h-5 w-5 text-indigo-500" /> Próximos 7 dias
            </h3>
            {thisWeek.length === 0 ? (
              <p className="py-4 text-center text-sm text-stone-400">Nada marcado para esta semana.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {thisWeek.map(e => {
                  const p = fmtParts(e.start_at)
                  return (
                    <li key={e.id} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 rounded-xl bg-indigo-50 py-1 text-center text-[11px] font-extrabold capitalize text-indigo-700">{p.weekday}<br />{p.day}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-blue-950">{e.title}</p>
                        <p className="text-[11px] text-stone-400">{p.time} · {e.target_section ? SECTION_LABELS[e.target_section] : 'Todos'}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="rounded-[1.75rem] bg-blue-950 p-5 text-white shadow-lg">
            <h3 className={`${D} flex items-center gap-2 text-lg font-extrabold`}>
              <Info className="h-5 w-5 text-yellow-300" /> Dicas
            </h3>
            <ul className="mt-3 space-y-3 text-sm text-blue-100/85">
              <li className="flex gap-2"><Copy className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" /><span>Usa <b className="text-white">Duplicar</b> para reuniões semanais: fica tudo preenchido para a semana seguinte.</span></li>
              <li className="flex gap-2"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" /><span>O comunicado é opcional ao criar, reagendar e cancelar, e podes editar o texto antes de enviar.</span></li>
              <li className="flex gap-2"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" /><span>Eventos para <b className="text-white">Todos</b> aparecem na página inicial do site para visitantes.</span></li>
            </ul>
          </section>
        </aside>
      </div>

      {/* ── Criar / duplicar evento ────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!creating) setCreateOpen(v) }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.75rem] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className={`${D} text-2xl font-extrabold text-blue-950`}>Criar Novo Evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateEvent} className="space-y-6 pt-1">
            <FormSection title="O quê">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="event-title">Título *</Label>
                  <Input id="event-title" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Ex: Reunião de Sábado" />
                </div>
              </div>
              <div className="space-y-2">
                <EventPlaceField
                  id="event-location"
                  online={online} onOnlineChange={setOnline}
                  text={location} onTextChange={setLocation}
                  coords={coords} onCoordsChange={setCoords}
                  url={onlineUrl} onUrlChange={setOnlineUrl}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-desc">Descrição</Label>
                <Textarea id="event-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="O que vai acontecer?" rows={2} />
              </div>
            </FormSection>

            <FormSection title="Quando">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-start">Início *</Label>
                  <Input id="event-start" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-end">Fim <span className="font-normal text-stone-400">(opcional)</span></Label>
                  <Input id="event-end" type="datetime-local" value={endAt} min={startAt || undefined} onChange={e => setEndAt(e.target.value)} />
                </div>
              </div>
              <RsvpSettings
                enabled={rsvpEnabled}
                onEnabledChange={setRsvpEnabled}
                deadline={rsvpDeadline}
                onDeadlineChange={setRsvpDeadline}
                maxDeadline={startAt}
              />
            </FormSection>

            <FormSection title="Para quem e recompensas">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Público Alvo</Label>
                  <Select value={targetSection} onValueChange={setTargetSection} disabled={isDirigente}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {Object.entries(SECTION_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {targetSection === '__all__' && (
                    <p className="flex items-start gap-1 text-[11px] text-sky-700">
                      <Globe className="mt-0.5 h-3 w-3 shrink-0" /> Aparece também na página inicial do site para visitantes (título, data, local e descrição{online ? '; o link da reunião fica só para os membros no Painel' : ''}).
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-indigo-600"><Trophy className="h-3 w-3" /> XP</Label>
                    <Input type="number" min={0} value={xpReward} onChange={e => setXpReward(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-yellow-600"><Coins className="h-3 w-3" /> Ouro</Label>
                    <Input type="number" min={0} value={goldReward} onChange={e => setGoldReward(Number(e.target.value))} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 rounded-2xl bg-stone-50 p-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-stone-500">Desconto Atraso (%)</Label>
                  <Input type="number" min={0} max={100} value={lateDiscount} onChange={e => setLateDiscount(Number(e.target.value))} />
                  <p className="text-[10px] text-stone-400">Percentagem de pontos removida se chegar atrasado.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-stone-500">Penalidade Falta (%)</Label>
                  <Input type="number" min={0} max={100} value={absentPenalty} onChange={e => setAbsentPenalty(Number(e.target.value))} />
                  <p className="text-[10px] text-stone-400">Percentagem da recompensa retirada em caso de falta.</p>
                </div>
              </div>
            </FormSection>

            {/* Comunicado opcional */}
            <div className={`rounded-2xl p-4 ring-1 ring-inset transition-colors ${announceCreate ? 'bg-yellow-50 ring-yellow-300' : 'bg-stone-50 ring-stone-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${announceCreate ? 'bg-yellow-400 text-blue-950' : 'bg-stone-200 text-stone-500'}`}>
                    <Megaphone className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-bold text-blue-950">Enviar comunicado</p>
                    <p className="text-xs text-stone-500">
                      {announceCreate
                        ? `Vai para ${targetSection === '__all__' ? 'todo o clube' : `a classe ${SECTION_LABELS[targetSection]}`} (aparece nos avisos e nas notificações).`
                        : 'O evento é criado sem avisar ninguém.'}
                    </p>
                  </div>
                </div>
                <Switch checked={announceCreate} onCheckedChange={setAnnounceCreate} aria-label="Enviar comunicado" />
              </div>
              {announceCreate && (
                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase text-stone-500">Título do comunicado</Label>
                    <Input
                      value={shownAnnTitle}
                      maxLength={120}
                      onChange={e => { if (!annEdited) setAnnMessage(shownAnnMessage); setAnnEdited(true); setAnnTitle(e.target.value) }}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase text-stone-500">Mensagem</Label>
                    <Textarea
                      value={shownAnnMessage}
                      rows={4}
                      maxLength={2000}
                      onChange={e => { if (!annEdited) setAnnTitle(shownAnnTitle); setAnnEdited(true); setAnnMessage(e.target.value) }}
                      className="bg-white"
                    />
                  </div>
                  <p className="text-[11px] text-stone-500">
                    {annEdited ? (
                      <>Texto personalizado. <button type="button" className="cursor-pointer font-bold text-blue-700 hover:underline" onClick={() => setAnnEdited(false)}>Repor texto automático</button></>
                    ) : 'O texto atualiza-se sozinho com os dados do evento. Podes editá-lo.'}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <button
                type="submit"
                disabled={creating}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-950 py-3.5 font-extrabold text-white transition-colors hover:bg-blue-900 disabled:opacity-60"
              >
                {creating ? <><Loader2 className="h-5 w-5 animate-spin" /> A criar...</> : announceCreate ? <><Megaphone className="h-4 w-4" /> Criar Evento e Enviar Comunicado</> : 'Criar Evento'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Reagendar ──────────────────────────────────────────── */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="rounded-[1.75rem] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`${D} text-2xl font-extrabold text-blue-950`}>Reagendar Evento</DialogTitle>
            <DialogDescription>{reschedulingEvent?.title}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReschedule} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Novo Horário de Início</Label>
              <Input type="datetime-local" value={newStartAt} onChange={e => setNewStartAt(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Novo Horário de Fim <span className="font-normal text-stone-400">(opcional)</span></Label>
              <Input type="datetime-local" value={newEndAt} min={newStartAt || undefined} onChange={e => setNewEndAt(e.target.value)} />
            </div>
            <AnnounceToggle
              checked={announceReschedule}
              onChange={setAnnounceReschedule}
              label="Avisar os membros da nova data"
              section={reschedulingEvent?.target_section ?? null}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRescheduleOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-950 hover:bg-blue-900" disabled={rescheduling}>
                {rescheduling ? 'A guardar...' : 'Confirmar Reagendamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Cancelar ───────────────────────────────────────────── */}
      <Dialog open={!!cancelEvent} onOpenChange={(v) => { if (!v && !cancelling) setCancelEvent(null) }}>
        <DialogContent className="rounded-[1.75rem] sm:max-w-md">
          <DialogHeader>
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <Trash2 className="h-6 w-6" />
            </div>
            <DialogTitle className={`${D} text-2xl font-extrabold text-blue-950`}>Cancelar evento?</DialogTitle>
            <DialogDescription>
              O evento <b className="text-blue-950">{cancelEvent?.title}</b> ({cancelEvent ? fmtShort(cancelEvent.start_at) : ''}) vai ser apagado. Isto não pode ser desfeito.
            </DialogDescription>
          </DialogHeader>
          <AnnounceToggle
            checked={announceCancel}
            onChange={setAnnounceCancel}
            label="Enviar comunicado de cancelamento"
            section={cancelEvent?.target_section ?? null}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelEvent(null)} disabled={cancelling}>Voltar</Button>
            <Button type="button" className="bg-red-600 hover:bg-red-700" onClick={handleCancelEvent} disabled={cancelling}>
              {cancelling ? <><Loader2 className="h-4 w-4 animate-spin" /> A cancelar...</> : announceCancel ? 'Cancelar e avisar' : 'Apagar sem aviso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Editar ─────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.75rem] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`${D} text-2xl font-extrabold text-blue-950`}>Editar Evento</DialogTitle>
            <DialogDescription>Para mudar a data usa &quot;Reagendar&quot;.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditEvent} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Título</Label>
              <Input id="edit-title" value={editTitle} onChange={e => setEditTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <EventPlaceField
                id="edit-location"
                online={editOnline} onOnlineChange={setEditOnline}
                text={editLocation} onTextChange={setEditLocation}
                coords={editCoords} onCoordsChange={setEditCoords}
                url={editOnlineUrl} onUrlChange={setEditOnlineUrl}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Descrição</Label>
              <Textarea id="edit-desc" value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="O que vai acontecer?" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-indigo-600"><Trophy className="h-3 w-3" /> XP</Label>
                <Input type="number" min={0} value={editXpReward} onChange={e => setEditXpReward(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-yellow-600"><Coins className="h-3 w-3" /> Ouro</Label>
                <Input type="number" min={0} value={editGoldReward} onChange={e => setEditGoldReward(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-stone-500">Atraso (%)</Label>
                <Input type="number" min={0} max={100} value={editLateDiscount} onChange={e => setEditLateDiscount(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-stone-500">Falta (%)</Label>
                <Input type="number" min={0} max={100} value={editAbsentPenalty} onChange={e => setEditAbsentPenalty(Number(e.target.value))} />
              </div>
            </div>
            <RsvpSettings
              enabled={editRsvpEnabled}
              onEnabledChange={setEditRsvpEnabled}
              deadline={editRsvpDeadline}
              onDeadlineChange={setEditRsvpDeadline}
              maxDeadline={editingEvent ? toLocalInput(editingEvent.start_at) : ''}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-950 hover:bg-blue-900" disabled={updating}>
                {updating ? 'A guardar...' : 'Guardar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <RsvpSummaryDialog
        event={rsvpEvent}
        onOpenChange={(v) => { if (!v) setRsvpEvent(null) }}
        members={members}
        summary={rsvpEvent ? summarizeRsvps(rsvpEvent.id, rsvpRows, audienceOf(rsvpEvent).map((m) => m.id)) : null}
        onAnswerSet={(userId, going) => {
          if (!rsvpEvent) return
          setRsvpRows((previous) => [
            ...previous.filter((row) => !(row.event_id === rsvpEvent.id && row.user_id === userId)),
            { event_id: rsvpEvent.id, user_id: userId, going },
          ])
          router.refresh()
        }}
      />

      {sharingEvent && (
        <EventShareDialog
          event={sharingEvent}
          open={shareOpen}
          onOpenChange={(v) => { setShareOpen(v); if (!v) setSharingEvent(null) }}
        />
      )}

      {selectedEvent && (
        <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Controlo de Presenças: {selectedEvent.title}</DialogTitle>
              {selectedEvent.target_section && (
                <p className="pt-1 text-xs text-gray-500">
                  A mostrar apenas membros da secção: <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold">{SECTION_LABELS[selectedEvent.target_section] || selectedEvent.target_section}</span>
                </p>
              )}
            </DialogHeader>
            <EventAttendanceManager
              event={selectedEvent}
              members={audienceOf(selectedEvent)}
              profile={profile}
              onComplete={() => {
                setAttendanceOpen(false)
                setSelectedEvent(null)
                router.refresh()
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function IconAction({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-stone-400 transition-colors ${danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-blue-50 hover:text-blue-700'}`}
    >
      {children}
    </button>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-stone-400">{title}</legend>
      {children}
    </fieldset>
  )
}

function AnnounceToggle({ checked, onChange, label, section }: { checked: boolean; onChange: (v: boolean) => void; label: string; section: string | null }) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-3 rounded-2xl p-3.5 ring-1 ring-inset transition-colors ${checked ? 'bg-yellow-50 ring-yellow-300' : 'bg-stone-50 ring-stone-200'}`}>
      <span className="flex items-start gap-2.5">
        <Megaphone className={`mt-0.5 h-4 w-4 shrink-0 ${checked ? 'text-amber-600' : 'text-stone-400'}`} />
        <span>
          <span className="block text-sm font-bold text-blue-950">{label}</span>
          <span className="block text-xs text-stone-500">
            {checked ? `Comunicado para ${section ? `a classe ${SECTION_LABELS[section]}` : 'todo o clube'}.` : 'Ninguém é avisado.'}
          </span>
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}
