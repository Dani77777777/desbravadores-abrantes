'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Lock, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { fmtRsvpDeadline, isRsvpOpen, rsvpClosesAt, type RsvpEvent } from '@/utils/event-rsvp'

/** Selo pequeno para a lista de eventos do Painel. */
export function RsvpBadge({ event, answer, now }: { event: RsvpEvent; answer: boolean | undefined; now: number }) {
  if (!event.rsvp_enabled) return null
  if (answer === true)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
        <Check className="h-2.5 w-2.5" strokeWidth={3} /> Vais
      </span>
    )
  if (answer === false)
    return (
      <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-stone-500">Não vais</span>
    )
  if (!now || !isRsvpOpen(event, now)) return null
  return (
    <span className="animate-pulse rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-950">
      Vais? Responde
    </span>
  )
}

/** "Vais estar presente?" no detalhe de um evento que pede confirmação. */
export function EventRsvp({
  event,
  answer,
  onAnswered,
}: {
  event: RsvpEvent
  answer: boolean | undefined
  onAnswered: (going: boolean) => void
}) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [saving, setSaving] = useState<boolean | null>(null)
  const [now] = useState(() => Date.now())

  if (!event.rsvp_enabled) return null
  const open = isRsvpOpen(event, now)
  const closes = rsvpClosesAt(event)

  const answerWith = async (going: boolean) => {
    if (saving !== null || going === answer) return
    setSaving(going)
    const { error } = await supabase.rpc('set_event_rsvp', { p_event_id: event.id, p_going: going })
    setSaving(null)
    if (error) {
      toast.error(error.message || 'Não foi possível guardar a resposta.')
      return
    }
    onAnswered(going)
    toast.success(going ? 'Boa! Ficas marcado como "Vou".' : 'Ok, ficas marcado como "Não vou".')
    router.refresh()
  }

  return (
    <div className="space-y-3 rounded-xl border border-violet-100 bg-violet-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-violet-900">Vais estar presente?</h4>
          <p className="mt-0.5 text-[11px] text-violet-800/80">
            {open
              ? event.rsvp_deadline
                ? `Responde até ${fmtRsvpDeadline(event.rsvp_deadline)}. Podes mudar até lá.`
                : 'Podes mudar a resposta até o evento começar.'
              : 'O prazo para responder terminou.'}
          </p>
        </div>
        {!open && <Lock className="h-4 w-4 shrink-0 text-violet-400" />}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([true, false] as const).map((going) => {
          const active = answer === going
          return (
            <button
              key={String(going)}
              type="button"
              onClick={() => answerWith(going)}
              disabled={!open || saving !== null}
              className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-extrabold transition-all disabled:cursor-not-allowed ${
                active
                  ? going
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/20'
                    : 'bg-stone-700 text-white shadow-md'
                  : open
                    ? 'bg-white text-stone-600 ring-1 ring-inset ring-violet-200 hover:ring-violet-400'
                    : 'bg-white/60 text-stone-400 ring-1 ring-inset ring-stone-200'
              }`}
            >
              {saving === going ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : going ? (
                <Check className="h-4 w-4" strokeWidth={3} />
              ) : (
                <X className="h-4 w-4" strokeWidth={3} />
              )}
              {going ? 'Vou' : 'Não vou'}
            </button>
          )
        })}
      </div>

      {answer === undefined && !open && closes <= now && (
        <p className="text-[11px] font-semibold text-violet-800/80">Não chegaste a responder.</p>
      )}
      <p className="text-[10px] text-violet-800/60">
        A presença verdadeira é marcada pelos dirigentes no dia; é isso que conta para os pontos.
      </p>
    </div>
  )
}
