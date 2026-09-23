'use client'

import { CalendarCheck, Check, HelpCircle, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { RsvpSummary } from '@/utils/event-rsvp'
import { SECTION_LABELS, fmtShort } from './event-utils'

/** "Pedir confirmação de presença" + prazo opcional (formulários de criar/editar evento). */
export function RsvpSettings({
  enabled,
  onEnabledChange,
  deadline,
  onDeadlineChange,
  maxDeadline,
}: {
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  deadline: string
  onDeadlineChange: (v: string) => void
  /** Início do evento (datetime-local): o prazo não pode passar daqui. */
  maxDeadline: string
}) {
  return (
    <div className={`rounded-2xl p-3.5 ring-1 ring-inset transition-colors ${enabled ? 'bg-violet-50 ring-violet-200' : 'bg-stone-50 ring-stone-200'}`}>
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span className="flex items-start gap-2.5">
          <CalendarCheck className={`mt-0.5 h-4 w-4 shrink-0 ${enabled ? 'text-violet-600' : 'text-stone-400'}`} />
          <span>
            <span className="block text-sm font-bold text-blue-950">Pedir confirmação de presença</span>
            <span className="block text-xs text-stone-500">
              {enabled
                ? 'Cada membro diz no Painel se vai ou não. Serve para organizar (ex.: tendas e boleias); a presença real marcas tu no dia.'
                : 'Para saídas e acampamentos em que precisas de saber quem vai.'}
            </span>
          </span>
        </span>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} aria-label="Pedir confirmação de presença" />
      </label>
      {enabled && (
        <div className="mt-3 space-y-1.5 pl-6">
          <Label htmlFor="rsvp-deadline" className="text-xs font-bold uppercase text-stone-500">
            Responder até <span className="font-normal normal-case text-stone-400">(opcional)</span>
          </Label>
          <Input
            id="rsvp-deadline"
            type="datetime-local"
            value={deadline}
            max={maxDeadline || undefined}
            onChange={(e) => onDeadlineChange(e.target.value)}
            className="bg-white"
          />
          <p className="text-[11px] text-stone-500">
            {deadline ? 'Depois desta hora já ninguém pode responder nem mudar a resposta.' : 'Sem prazo, podem responder até o evento começar.'}
          </p>
        </div>
      )}
    </div>
  )
}

/** "12 vão · 3 não vão · 8 sem resposta" na lista de eventos. */
export function RsvpCountsButton({
  summary,
  deadline,
  onClick,
}: {
  summary: RsvpSummary
  deadline: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 flex w-fit cursor-pointer flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-800 ring-1 ring-inset ring-violet-200 transition-colors hover:bg-violet-100"
      title="Ver quem vai"
    >
      <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
      <span className="text-emerald-700">{summary.going.length} vão</span>
      <span className="text-violet-300">·</span>
      <span className="text-stone-600">{summary.notGoing.length} não vão</span>
      <span className="text-violet-300">·</span>
      <span className="text-amber-700">{summary.noAnswer.length} sem resposta</span>
      {deadline && <span className="font-medium text-violet-600">· responder até {fmtShort(deadline)}</span>}
    </button>
  )
}

type Member = { id: string; full_name: string | null; avatar_url?: string | null; section?: string | null }

/** Quem vai / não vai / ainda não respondeu. */
export function RsvpSummaryDialog({
  event,
  onOpenChange,
  members,
  summary,
}: {
  event: { title: string; rsvp_deadline?: string | null; start_at: string } | null
  onOpenChange: (v: boolean) => void
  members: Member[]
  summary: RsvpSummary | null
}) {
  const byId = new Map(members.map((m) => [m.id, m]))
  const groups = summary
    ? ([
        { key: 'going', label: 'Vão', ids: summary.going, icon: Check, tone: 'text-emerald-700 bg-emerald-100' },
        { key: 'noAnswer', label: 'Sem resposta', ids: summary.noAnswer, icon: HelpCircle, tone: 'text-amber-700 bg-amber-100' },
        { key: 'notGoing', label: 'Não vão', ids: summary.notGoing, icon: X, tone: 'text-stone-600 bg-stone-100' },
      ] as const)
    : []

  return (
    <Dialog open={!!event} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-[1.75rem] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-blue-950">Quem vai · {event?.title}</DialogTitle>
          <DialogDescription>
            É o que cada um disse no Painel
            {event?.rsvp_deadline ? ` (responder até ${fmtShort(event.rsvp_deadline)})` : ' (podem responder até o evento começar)'}. A presença
            real marcas nas Presenças.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-stone-500">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full ${g.tone}`}>
                  <g.icon className="h-3 w-3" strokeWidth={3} />
                </span>
                {g.label} <span className="rounded-full bg-stone-100 px-1.5 text-[10px] text-stone-600">{g.ids.length}</span>
              </h4>
              {g.ids.length === 0 ? (
                <p className="pl-7 text-xs text-stone-400">Ninguém.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 pl-7">
                  {g.ids
                    .map((id) => byId.get(id) ?? { id, full_name: 'Membro' })
                    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt'))
                    .map((m) => (
                      <li
                        key={m.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-2.5 text-xs font-bold text-blue-950 ring-1 ring-inset ring-stone-200"
                        title={m.section ? SECTION_LABELS[m.section] : undefined}
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={m.avatar_url || undefined} className="object-cover" />
                          <AvatarFallback className="bg-stone-200 text-[10px] font-bold text-stone-600">{m.full_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        {m.full_name}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
