'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Map as MapIcon, Navigation } from 'lucide-react'
import { directionsUrl, wazeUrl, type Coords } from '@/utils/maps'

const LocationMap = dynamic(() => import('@/components/events/LocationMap').then((m) => m.LocationMap), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />,
})

/** Ponto de encontro de uma boleia no Painel: "Como chegar", Waze e o mapa (só quando se abre). */
export function TripStopMap({ coords }: { coords: Coords }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <a
          href={directionsUrl(coords)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg bg-blue-950 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-blue-900"
        >
          <Navigation className="h-3 w-3" /> Como chegar
        </a>
        <a
          href={wazeUrl(coords)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-blue-800 ring-1 ring-inset ring-blue-200 hover:bg-blue-50"
        >
          Waze
        </a>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-blue-800 ring-1 ring-inset ring-blue-200 hover:bg-blue-50"
        >
          <MapIcon className="h-3 w-3" /> {open ? 'Esconder mapa' : 'Ver no mapa'}
        </button>
      </div>
      {open && <LocationMap value={coords} className="h-40" />}
    </div>
  )
}
