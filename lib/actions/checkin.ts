'use server'

import { cookies, headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { effectiveLeadershipSection, effectiveRole } from '@/utils/permissions'
import { shortDisplayName } from '@/utils/display-name'
import { hashIp, requestIp } from '@/lib/perguntas/data'
import { eventFromPass, qrToken } from '@/lib/checkin/token'
import { familyGroupIds } from '@/lib/checkin/family'
import {
  CHECKIN_PASS_COOKIE,
  checkinGuestEntryId,
  checkinOpen,
  checkinStatus,
  cleanGuestName,
  type CheckinEvent,
  type CheckinStatus,
} from '@/utils/checkin'
import type { RaffleEntry } from '@/utils/raffle'

// Presenças por QR. Quem marca escreve SÓ no rascunho (points_awarded = false) e nunca
// muda uma presença que já exista (ex.: um dirigente marcou "faltou"). Os convidados vão
// para event_guests, que só o servidor lê (service role). Ver supabase-setup-event-checkin.sql.

type Service = ReturnType<typeof createServiceClient>

const EVENT_COLUMNS = 'id, title, start_at, end_at, target_section, is_finished'
const EXPIRED = 'O QR expirou. Lê outra vez o QR que está no ecrã.'
const CLOSED = 'As presenças deste evento já fecharam.'
/** Convidados que a mesma rede pode registar no mesmo evento (contra nomes falsos em série). */
const MAX_GUESTS_PER_IP = 8

async function hasPass(eventId: string) {
  const jar = await cookies()
  return eventFromPass(jar.get(CHECKIN_PASS_COOKIE)?.value) === eventId
}

async function loadEvent(service: Service, eventId: string) {
  const { data } = await service.from('events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle()
  return (data as CheckinEvent | null) ?? null
}

/** Rede de segurança: apaga os convidados de eventos que acabaram há mais de 24 h. */
async function cleanupStaleGuests(service: Service) {
  const { error } = await service.rpc('cleanup_stale_event_guests')
  if (error) console.warn('cleanup_stale_event_guests:', error.message)
}

type ProfileRow = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  section: string | null
  leadership_section: string | null
  helper_role: string | null
  helper_section: string | null
}

/** Num evento de uma secção, só marcam os dessa secção, a liderança dela e a coordenação. */
function canAttend(p: ProfileRow, e: CheckinEvent) {
  if (!e.target_section) return true
  return p.section === e.target_section || effectiveLeadershipSection(p) === e.target_section || effectiveRole(p) === 'coordenador'
}

// ── Quem lê o QR ──────────────────────────────────────────────

export type CheckinPerson = { id: string; name: string; avatar: string | null; status: CheckinStatus | 'faltou' | null; canAttend: boolean }

/** A pessoa com sessão iniciada e a família dela, com o que já está marcado neste evento. */
export async function getMyCheckinFamily(eventId: string): Promise<CheckinPerson[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const service = createServiceClient()
  const event = await loadEvent(service, eventId)
  if (!event) return []
  const ids = await familyGroupIds(service, user.id)
  const [{ data: profiles }, { data: rows }] = await Promise.all([
    service
      .from('profiles')
      .select('id, full_name, avatar_url, role, section, leadership_section, helper_role, helper_section')
      .in('id', ids),
    service.from('event_attendance').select('user_id, status').eq('event_id', eventId).in('user_id', ids),
  ])
  const status = new Map((rows ?? []).map((r) => [r.user_id as string, r.status as CheckinPerson['status']]))
  const byId = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]))
  return ids.flatMap((id) => {
    const p = byId.get(id)
    return p ? [{ id, name: shortDisplayName(p.full_name, 'Membro'), avatar: p.avatar_url, status: status.get(id) ?? null, canAttend: canAttend(p, event) }] : []
  })
}

export async function checkInMembers(
  eventId: string,
  ids: string[],
): Promise<{ marked?: string[]; already?: string[]; status?: CheckinStatus; error?: string }> {
  if (!(await hasPass(eventId))) return { error: EXPIRED }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Entra na tua conta primeiro.' }

  const service = createServiceClient()
  const event = await loadEvent(service, eventId)
  if (!event) return { error: 'Evento não encontrado.' }
  if (!checkinOpen(event)) return { error: CLOSED }

  const family = await familyGroupIds(service, user.id)
  const wanted = [...new Set(ids)].filter((id) => family.includes(id))
  if (wanted.length === 0) return { error: 'Escolhe quem está aqui.' }

  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name, avatar_url, role, section, leadership_section, helper_role, helper_section')
    .in('id', wanted)
  const eligible = ((profiles ?? []) as ProfileRow[]).filter((p) => canAttend(p, event))
  if (eligible.length === 0) return { error: 'Este evento é só para outra secção.' }

  const status = checkinStatus(event.start_at)
  const now = new Date().toISOString()
  // ignoreDuplicates: quem já tem presença (do QR ou de um dirigente) fica como estava.
  const { data: inserted, error } = await service
    .from('event_attendance')
    .upsert(
      eligible.map((p) => ({ event_id: eventId, user_id: p.id, status, points_awarded: false, checkin_at: now })),
      { onConflict: 'event_id,user_id', ignoreDuplicates: true },
    )
    .select('user_id')
  if (error) {
    console.error('checkInMembers:', error)
    return { error: 'Não foi possível marcar. Tenta outra vez.' }
  }
  await cleanupStaleGuests(service)

  const insertedIds = new Set((inserted ?? []).map((r) => r.user_id as string))
  const name = (p: ProfileRow) => shortDisplayName(p.full_name, 'Membro')
  return {
    marked: eligible.filter((p) => insertedIds.has(p.id)).map(name),
    already: eligible.filter((p) => !insertedIds.has(p.id)).map(name),
    status,
  }
}

export async function checkInGuest(
  eventId: string,
  rawName: string,
): Promise<{ guest?: { id: string; secret: string; name: string }; error?: string }> {
  if (!(await hasPass(eventId))) return { error: EXPIRED }
  const name = cleanGuestName(rawName)
  if (!name) return { error: 'Escreve o teu nome (2 a 40 letras).' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return { error: 'Tens sessão iniciada: marca a presença com a tua conta.' }

  const service = createServiceClient()
  const event = await loadEvent(service, eventId)
  if (!event) return { error: 'Evento não encontrado.' }
  if (!checkinOpen(event)) return { error: CLOSED }

  const ipHash = hashIp(requestIp(await headers()))
  const { data: existing } = await service.from('event_guests').select('name, ip_hash').eq('event_id', eventId)
  if ((existing ?? []).some((g) => g.name.toLocaleLowerCase('pt') === name.toLocaleLowerCase('pt'))) {
    return { error: 'Já há uma visita com esse nome. Junta o apelido.' }
  }
  if (ipHash && (existing ?? []).filter((g) => g.ip_hash === ipHash).length >= MAX_GUESTS_PER_IP) {
    return { error: 'Já foram registadas muitas visitas a partir desta rede. Pede ajuda a um dirigente.' }
  }

  const { data, error } = await service
    .from('event_guests')
    .insert({ event_id: eventId, name, ip_hash: ipHash })
    .select('id, secret, name')
    .single()
  if (error || !data) {
    console.error('checkInGuest:', error)
    return { error: 'Não foi possível registar. Tenta outra vez.' }
  }
  await cleanupStaleGuests(service)
  return { guest: { id: data.id, secret: data.secret, name: data.name } }
}

// ── Liderança (Ecrã do Clube, Sorteador, Formador de equipas) ─

async function requireEventLeader(eventId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, section, leadership_section, helper_role, helper_section')
    .eq('id', user.id)
    .maybeSingle()
  const role = effectiveRole(profile)
  if (role !== 'coordenador' && role !== 'dirigente') return null
  const service = createServiceClient()
  const event = await loadEvent(service, eventId)
  if (!event) return null
  // O dirigente só gere os eventos gerais e os da sua secção (como no Sorteador).
  const section = role === 'dirigente' ? effectiveLeadershipSection(profile) || profile?.section : null
  if (section && event.target_section && event.target_section !== section) return null
  return { service, event }
}

export type CheckinBoard = {
  token: string
  open: boolean
  event: { id: string; title: string; start_at: string }
  members: { id: string; name: string; avatar: string | null; status: CheckinStatus; viaQr: boolean; at: string }[]
  guests: { id: string; name: string; at: string }[]
}

/** Para o projetor e o controlo: o código do QR de agora e quem já marcou. */
export async function getCheckinBoard(eventId: string): Promise<CheckinBoard | { error: string }> {
  const ctx = await requireEventLeader(eventId)
  if (!ctx) return { error: 'Sem acesso a este evento.' }
  const { service, event } = ctx
  const [{ data: rows }, { data: guests }] = await Promise.all([
    service
      .from('event_attendance')
      .select('user_id, status, checkin_at, created_at, profiles(full_name, avatar_url)')
      .eq('event_id', event.id)
      .in('status', ['presente', 'atrasado']),
    service.from('event_guests').select('id, name, created_at').eq('event_id', event.id).order('created_at'),
  ])
  type Row = { user_id: string; status: CheckinStatus; checkin_at: string | null; created_at: string; profiles: { full_name: string | null; avatar_url: string | null } | null }
  const members = ((rows ?? []) as unknown as Row[])
    .map((r) => ({
      id: r.user_id,
      name: shortDisplayName(r.profiles?.full_name, 'Membro'),
      avatar: r.profiles?.avatar_url ?? null,
      status: r.status,
      viaQr: !!r.checkin_at,
      at: r.checkin_at ?? r.created_at,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
  return {
    token: qrToken(event.id),
    open: checkinOpen(event),
    event: { id: event.id, title: event.title, start_at: event.start_at },
    members,
    guests: (guests ?? []).map((g) => ({ id: g.id, name: g.name, at: g.created_at })),
  }
}

export async function removeCheckinGuest(eventId: string, guestId: string): Promise<{ error?: string }> {
  const ctx = await requireEventLeader(eventId)
  if (!ctx) return { error: 'Sem acesso a este evento.' }
  const { error } = await ctx.service.from('event_guests').delete().eq('id', guestId).eq('event_id', eventId)
  return error ? { error: 'Não foi possível apagar.' } : {}
}

/** Os convidados que marcaram pelo QR, como visitas do Sorteador / Formador de equipas. */
export async function listCheckinGuests(eventId: string): Promise<RaffleEntry[]> {
  const ctx = await requireEventLeader(eventId)
  if (!ctx) return []
  const { data } = await ctx.service.from('event_guests').select('id, name').eq('event_id', eventId).order('created_at')
  return (data ?? []).map((g) => ({ id: checkinGuestEntryId(g.id), name: g.name, avatar: null }))
}
