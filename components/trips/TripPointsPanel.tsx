'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Check, MapPin, MapPinOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LocationPicker } from '@/components/events/LocationPicker'
import { pointColor, type TripPoint } from '@/utils/trips'

const TripPointsMap = dynamic(() => import('./TripPointsMap').then((m) => m.TripPointsMap), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-stone-100" />,
})

/** Bolinha com o número e a cor do ponto (a mesma do mapa). */
export function PointBadge({ index, title, small }: { index: number; title?: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-black text-white ${small ? 'h-4 w-4 text-[9px]' : 'h-6 w-6 text-xs'}`}
      style={{ backgroundColor: pointColor(index) }}
      title={title}
    >
      {index + 1}
    </span>
  )
}

/** Pontos de encontro comuns às boleias (ida e volta), com o mapa geral. */
export function TripPointsPanel({
  points,
  counts,
  destination,
  onAdd,
  onChange,
  onRemove,
}: {
  points: TripPoint[]
  /** Quantas pessoas usam cada ponto na ida e na volta. */
  counts: Map<string, { ida: number; volta: number }>
  destination: { name: string; lat: number; lng: number } | null
  /** Cria um ponto e devolve o id (para abrir logo a edição). */
  onAdd: () => string
  onChange: (id: string, patch: Partial<TripPoint>) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)

  const mapPoints = useMemo(
    () =>
      points.flatMap((p, i) => {
        if (p.lat == null || p.lng == null) return []
        const c = counts.get(p.id)
        return [{ id: p.id, name: p.name, lat: p.lat, lng: p.lng, color: pointColor(i), detail: c ? `${c.ida} ida · ${c.volta} volta` : undefined }]
      }),
    [points, counts],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-5 w-5 text-emerald-700" /> Pontos de encontro
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700">{points.length}</span>
        </CardTitle>
        <CardDescription>
          Comuns a todos os carros. Toca numa pessoa para escolheres onde é apanhada na ida e onde é deixada na volta. Cada carro
          diz a que horas passa em cada ponto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(mapPoints.length > 0 || (destination && points.length > 0)) && (
          <TripPointsMap points={mapPoints} destination={destination} onSelect={setEditing} />
        )}

        {points.length > 0 && (
          <ul className="space-y-2">
            {points.map((p, i) => {
              const c = counts.get(p.id) ?? { ida: 0, volta: 0 }
              const open = editing === p.id
              const noMap = p.lat == null || p.lng == null
              return (
                <li key={p.id} className={`rounded-xl ring-1 ring-inset ${open ? 'bg-stone-50 p-3 ring-emerald-300' : 'px-2 py-1.5 ring-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <PointBadge index={i} />
                    <button type="button" onClick={() => setEditing(open ? null : p.id)} className="min-w-0 flex-1 text-left">
                      <span className={`block truncate text-sm font-bold ${p.name ? 'text-gray-900' : 'text-gray-400'}`}>{p.name || 'Sem nome'}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        {c.ida} na ida · {c.volta} na volta
                        {noMap && (
                          <span className="inline-flex items-center gap-0.5 font-bold text-amber-600">
                            <MapPinOff className="h-3 w-3" /> sem ponto no mapa
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(open ? null : p.id)}
                      className={`rounded-lg p-2 ${open ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
                      title={open ? 'Feito' : 'Editar ponto'}
                    >
                      {open ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (c.ida + c.volta > 0 && !confirm(`Apagar "${p.name || 'este ponto'}"? Quem o usa fica sem ponto (vale o ponto geral do carro).`)) return
                        if (open) setEditing(null)
                        onRemove(p.id)
                      }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Apagar ponto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {open && (
                    <div className="mt-3">
                      <LocationPicker
                        text={p.name}
                        onTextChange={(name) => onChange(p.id, { name: name.slice(0, 80) })}
                        coords={p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null}
                        onCoordsChange={(co) => onChange(p.id, { lat: co?.lat ?? null, lng: co?.lng ?? null })}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setEditing(onAdd())}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
        >
          <Plus className="h-4 w-4" /> Ponto de encontro
        </button>
      </CardContent>
    </Card>
  )
}
