'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarCheck, ExternalLink, MonitorUp, QrCode, Smartphone, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { removeCheckinGuest } from '@/lib/actions/checkin'
import { CHECKIN_TOLERANCE_MIN } from '@/utils/checkin'
import { SECTION_LABELS } from '@/utils/permissions'
import { recommendEvent, type RaffleEvent } from '@/utils/raffle'
import { useCheckinBoard } from './useCheckinBoard'

function eventLabel(e: RaffleEvent) {
  const date = new Date(e.start_at).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })
  const time = new Date(e.start_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  const sec = e.target_section ? SECTION_LABELS[e.target_section] || e.target_section : 'Geral'
  return `${date} ${time} · ${e.title} · ${sec}`
}

/** Controlo das presenças por QR: escolher o evento, pôr o QR no ecrã e ver quem marcou. */
export function CheckinCard({
  events,
  eventId,
  onScreen,
  onEvent,
  onShow,
}: {
  events: RaffleEvent[]
  eventId: string | null
  onScreen: boolean
  onEvent: (id: string | null) => void
  onShow: () => void
}) {
  const event = events.find((e) => e.id === eventId) ?? null
  // Só pede a lista ao servidor com o cartão a ser usado (o projetor tem a sua própria).
  const { board, error, refresh } = useCheckinBoard(eventId, onScreen ? 4000 : 15000)
  const [removing, setRemoving] = useState<string | null>(null)

  // Sem evento escolhido: o que está a decorrer (ou prestes a começar).
  useEffect(() => {
    if (eventId) return
    const rec = recommendEvent(events)
    if (rec) onEvent(rec.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remove = async (id: string, name: string) => {
    if (!eventId || !window.confirm(`Apagar a visita "${name}"?`)) return
    setRemoving(id)
    const r = await removeCheckinGuest(eventId, id)
    setRemoving(null)
    if (r.error) toast.error(r.error)
    else refresh()
  }

  return (
    <Card className={onScreen ? 'ring-2 ring-yellow-400' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-5 w-5 text-yellow-500" /> Presenças por QR
        </CardTitle>
        <CardDescription>
          O QR muda a cada 30 segundos. Quem o lê fica marcado só no <b>rascunho</b> das presenças (até {CHECKIN_TOLERANCE_MIN} min depois do
          início como presente, depois como atrasado). As visitas escrevem o nome e apagam-se quando finalizas as presenças.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <select
          value={eventId ?? ''}
          onChange={(e) => onEvent(e.target.value || null)}
          className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
        >
          <option value="">Escolhe o evento…</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {eventLabel(e)}
            </option>
          ))}
        </select>

        {event && !onScreen && (
          <button
            type="button"
            onClick={onShow}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 text-base font-extrabold text-blue-950 hover:bg-yellow-300"
          >
            <MonitorUp className="h-5 w-5" /> Pôr o QR no ecrã
          </button>
        )}

        {event && error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}

        {event && board && (
          <div className="space-y-3">
            {!board.open && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                Este evento não está a decorrer (ou já foi finalizado): o QR não deixa marcar.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-blue-50 py-2">
                <p className="text-2xl font-black text-blue-950">{board.members.length}</p>
                <p className="text-xs font-bold text-blue-800">do clube</p>
              </div>
              <div className="rounded-xl bg-yellow-50 py-2">
                <p className="text-2xl font-black text-yellow-700">{board.guests.length}</p>
                <p className="text-xs font-bold text-yellow-800">visitas</p>
              </div>
            </div>

            {board.members.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {board.members.map((m) => (
                  <span
                    key={m.id}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                      m.status === 'atrasado' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                    }`}
                    title={m.viaQr ? 'Marcou pelo QR' : 'Marcado por um dirigente'}
                  >
                    {m.viaQr && <Smartphone className="h-3 w-3" />}
                    {m.name}
                    {m.status === 'atrasado' && ' · atrasado'}
                  </span>
                ))}
              </div>
            )}

            {board.guests.length > 0 && (
              <div className="space-y-1.5 rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Visitas</p>
                <div className="flex flex-wrap gap-1.5">
                  {board.guests.map((g) => (
                    <span key={g.id} className="inline-flex items-center gap-1 rounded-full border border-yellow-200 bg-white py-1 pl-2.5 pr-1 text-xs font-bold text-gray-800">
                      {g.name}
                      <button
                        type="button"
                        disabled={removing === g.id}
                        onClick={() => remove(g.id, g.name)}
                        className="rounded-full p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        title="Apagar visita"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <a
              href="/admin?tab=events"
              className="flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 hover:bg-blue-100"
            >
              <span className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4" /> Confirmar e finalizar as presenças
              </span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
