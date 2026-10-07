'use client'

import dynamic from 'next/dynamic'
import { Copy, ExternalLink, MapPin, Navigation, Video } from 'lucide-react'
import { toast } from 'sonner'
import { directionsUrl, googleMapsUrl, placeCoords, wazeUrl, type EventPlace } from '@/utils/maps'
import { isOnlineEvent, onlinePlatform, shortUrl, type OnlinePlace } from '@/utils/online-event'

const LocationMap = dynamic(() => import('./LocationMap').then((m) => m.LocationMap), {
  ssr: false,
  loading: () => <div className="h-44 animate-pulse rounded-2xl bg-stone-100" />,
})

/** Local do evento no detalhe: link da reunião (online) ou mapa + atalhos para Google Maps / Waze. */
export function EventLocation({ event }: { event: EventPlace & OnlinePlace }) {
  if (isOnlineEvent(event)) return <OnlineLocation event={event} />

  const coords = placeCoords(event)
  const mapsUrl = googleMapsUrl(event)
  if (!mapsUrl) return null

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Localização</h4>
      {event.location && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-gray-700">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          {event.location}
        </p>
      )}
      {coords ? (
        <>
          <LocationMap value={coords} className="h-44" />
          <div className="grid grid-cols-3 gap-2">
            <a
              href={directionsUrl(coords)}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-950 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-900"
            >
              <Navigation className="h-3.5 w-3.5" /> Como chegar
            </a>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-blue-800 ring-1 ring-inset ring-blue-200 transition-colors hover:bg-blue-50"
            >
              Google Maps
            </a>
            <a
              href={wazeUrl(coords)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-blue-800 ring-1 ring-inset ring-blue-200 transition-colors hover:bg-blue-50"
            >
              Waze
            </a>
          </div>
        </>
      ) : (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Procurar no Google Maps
        </a>
      )}
    </div>
  )
}

function OnlineLocation({ event }: { event: OnlinePlace }) {
  const url = event.online_url
  const platform = onlinePlatform(url)

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado!')
    } catch {
      toast.error('Não foi possível copiar o link.')
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Evento online</h4>
      <div className="space-y-3 rounded-2xl bg-blue-50 p-3.5 ring-1 ring-inset ring-blue-100 [contain:inline-size]">
        <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-blue-950">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Video className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block">{platform ?? 'Reunião online'}</span>
            {url && <span className="block truncate text-xs font-medium text-blue-700/80">{shortUrl(url)}</span>}
          </span>
        </p>
        {url ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-950 px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-900"
            >
              <ExternalLink className="h-4 w-4" /> Entrar na reunião
            </a>
            <button
              type="button"
              onClick={copy}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-blue-800 ring-1 ring-inset ring-blue-200 transition-colors hover:bg-blue-100"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar
            </button>
          </div>
        ) : (
          <p className="text-xs font-medium text-blue-800/80">O link para entrar vai ser partilhado em breve.</p>
        )}
      </div>
    </div>
  )
}
