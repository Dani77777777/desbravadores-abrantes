'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertCircle, Loader2, Mail, MailX, Send } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { SECTION_LABELS } from '@/utils/permissions'
import { sendEventInvites, type InviteSkipReason } from '@/lib/actions/event-invites'
import { SECTION_DOT } from './member-constants'

const BATCH = 10

const SKIP_LABELS: Record<InviteSkipReason, string> = {
  not_allowed: 'sem permissão',
  not_in_event: 'evento de outra classe',
  opted_out: 'não quer receber',
  no_email: 'sem email',
  already_invited: 'já convidado',
  send_failed: 'falhou o envio',
}

type InviteMember = { id: string; full_name: string | null; section: string }
type InviteEventRow = {
  id: string
  title: string
  start_at: string
  end_at?: string | null
  is_finished?: boolean | null
  target_section?: string | null
  rsvp_enabled?: boolean | null
}

interface InviteEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Membros por investir que a liderança pode convidar. */
  members: InviteMember[]
  events: InviteEventRow[]
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function InviteEventDialog({ open, onOpenChange, members, events }: InviteEventDialogProps) {
  const supabase = createClient()
  const [now] = useState(() => Date.now())

  // Eventos que ainda não acabaram, do mais próximo para o mais distante.
  const upcoming = useMemo(
    () => events
      .filter((e) => !e.is_finished && new Date(e.end_at || e.start_at).getTime() >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [events, now],
  )

  const [eventId, setEventId] = useState('')
  const [message, setMessage] = useState('')
  const [resend, setResend] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [invitedAt, setInvitedAt] = useState<Record<string, string>>({})
  const [optedOut, setOptedOut] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const event = upcoming.find((e) => e.id === eventId) ?? null
  const eligible = useMemo(
    () => members
      .filter((m) => !event?.target_section || m.section === event.target_section)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt')),
    [members, event],
  )

  useEffect(() => {
    if (open) {
      setEventId((current) => current && upcoming.some((e) => e.id === current) ? current : upcoming[0]?.id || '')
      setProgress(null)
    }
  }, [open, upcoming])

  // Quem já foi convidado para este evento e quem não quer receber emails.
  useEffect(() => {
    if (!open || !eventId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const ids = members.map((m) => m.id)
      const [inv, opt] = await Promise.all([
        supabase.from('event_invites').select('user_id, sent_at').eq('event_id', eventId),
        supabase.from('email_opt_outs').select('user_id').in('user_id', ids),
      ])
      if (cancelled) return
      setLoadError(!!(inv.error || opt.error))
      const sent = Object.fromEntries((inv.data || []).map((r) => [r.user_id, r.sent_at]))
      const out = new Set((opt.data || []).map((r) => r.user_id))
      setInvitedAt(sent)
      setOptedOut(out)
      setSelected(new Set(
        members
          .filter((m) => {
            const ev = upcoming.find((e) => e.id === eventId)
            return (!ev?.target_section || m.section === ev.target_section) && !out.has(m.id) && !sent[m.id]
          })
          .map((m) => m.id),
      ))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId])

  const selectable = eligible.filter((m) => !optedOut.has(m.id) && (resend || !invitedAt[m.id]))
  const chosen = selectable.filter((m) => selected.has(m.id))
  const sending = !!progress && progress.done < progress.total

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allChosen = selectable.length > 0 && chosen.length === selectable.length
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(selectable.map((m) => m.id)))

  const handleSend = async () => {
    if (!event || chosen.length === 0) return
    const ids = chosen.map((m) => m.id)
    const sentIds: string[] = []
    const skipped: { userId: string; reason: InviteSkipReason }[] = []
    setProgress({ done: 0, total: ids.length })

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      try {
        const res = await sendEventInvites({ eventId: event.id, memberIds: batch, message, resend })
        sentIds.push(...res.sent)
        skipped.push(...res.skipped)
        if (res.error) {
          toast.error(res.error)
          break
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao enviar os convites.')
        break
      }
      setProgress({ done: Math.min(i + BATCH, ids.length), total: ids.length })
    }
    setProgress({ done: ids.length, total: ids.length })

    const stamp = new Date().toISOString()
    setInvitedAt((prev) => ({ ...prev, ...Object.fromEntries(sentIds.map((id) => [id, stamp])) }))
    setSelected(new Set())

    if (sentIds.length) toast.success(`${sentIds.length} ${sentIds.length === 1 ? 'convite enviado' : 'convites enviados'} para "${event.title}".`)
    if (skipped.length) {
      const nameOf = (id: string) => members.find((m) => m.id === id)?.full_name || 'Membro'
      toast.warning(`${skipped.length} sem envio`, {
        description: skipped.map((s) => `${nameOf(s.userId)}: ${SKIP_LABELS[s.reason]}`).join(' · '),
        duration: 10000,
      })
    }
    if (sentIds.length && !skipped.length) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600 sm:mx-0 mx-auto">
            <Mail className="h-6 w-6" />
          </div>
          <DialogTitle>Convidar por email</DialogTitle>
          <DialogDescription>
            Cada membro por investir recebe um convite no email da conta. Nos perfis familiares, o email vai para a conta principal.
          </DialogDescription>
        </DialogHeader>

        {upcoming.length === 0 ? (
          <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">Não há eventos marcados. Cria um evento na aba Eventos primeiro.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Evento</Label>
              <Select value={eventId} onValueChange={setEventId} disabled={sending}>
                <SelectTrigger className="h-11 w-full rounded-xl"><SelectValue placeholder="Escolhe o evento" /></SelectTrigger>
                <SelectContent>
                  {upcoming.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title} · {formatEventDate(e.start_at)}{e.target_section ? ` · ${SECTION_LABELS[e.target_section] || e.target_section}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {event && !event.rsvp_enabled && (
                <p className="text-xs text-stone-500">Este evento não pede confirmação de presença: o botão do email só abre o evento.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-message">Mensagem (opcional)</Label>
              <Textarea
                id="invite-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Ex.: Vai ser um dia especial, gostávamos muito de te ver lá!"
                disabled={sending}
              />
            </div>

            {loadError && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Não foi possível ler os convites anteriores. Confirma que a migração supabase-migration-event-invites.sql foi corrida.
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={sending || selectable.length === 0}
                  className="cursor-pointer text-xs font-bold text-blue-700 hover:underline disabled:opacity-50"
                >
                  {allChosen ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-stone-600">
                  <Switch checked={resend} onCheckedChange={setResend} disabled={sending} />
                  Reenviar a quem já foi convidado
                </label>
              </div>

              <div className="max-h-64 divide-y divide-stone-100 overflow-y-auto rounded-xl ring-1 ring-stone-200">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
                ) : eligible.length === 0 ? (
                  <p className="p-4 text-center text-sm text-stone-500">Nenhum membro por investir {event?.target_section ? 'nesta classe' : ''}.</p>
                ) : eligible.map((m) => {
                  const out = optedOut.has(m.id)
                  const sentAt = invitedAt[m.id]
                  const disabled = sending || out || (!!sentAt && !resend)
                  return (
                    <label key={m.id} className={`flex items-center gap-3 px-3 py-2.5 ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-stone-50'}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-950"
                        checked={!disabled && selected.has(m.id)}
                        disabled={disabled}
                        onChange={() => toggle(m.id)}
                      />
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SECTION_DOT[m.section] || 'bg-stone-300'}`} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-blue-950">{m.full_name}</span>
                      {out ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-400"><MailX className="h-3 w-3" /> Não quer receber</span>
                      ) : sentAt ? (
                        <span className="text-[11px] font-bold text-emerald-600">Convidado a {new Date(sentAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}</span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Fechar</Button>
          <Button onClick={handleSend} disabled={!event || chosen.length === 0 || sending} className="bg-blue-950 hover:bg-blue-900">
            {sending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> A enviar {progress?.done}/{progress?.total}</>
            ) : (
              <><Send className="mr-2 h-4 w-4" /> Enviar {chosen.length || ''} {chosen.length === 1 ? 'convite' : 'convites'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
