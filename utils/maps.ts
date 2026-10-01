// Localização dos eventos: links para apps de mapas e pesquisa de moradas.
// A pesquisa usa o Nominatim (OpenStreetMap): grátis e sem chave, mas com regras —
// no máximo 1 pedido por segundo e nunca a cada tecla (só ao carregar em "Procurar").

export type EventPlace = {
  location?: string | null
  location_lat?: number | null
  location_lng?: number | null
}

export type Coords = { lat: number; lng: number }

/** Centro por defeito do mapa (Abrantes). */
export const DEFAULT_CENTER: Coords = { lat: 39.4636, lng: -8.1975 }

export function placeCoords(e: EventPlace): Coords | null {
  return e.location_lat != null && e.location_lng != null ? { lat: e.location_lat, lng: e.location_lng } : null
}

/** Abrir o local no Google Maps (ponto exato, ou pesquisa pelo texto). null sem local. */
export function googleMapsUrl(e: EventPlace): string | null {
  const c = placeCoords(e)
  if (c) return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
  if (e.location?.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location.trim())}`
  return null
}

export function directionsUrl(c: Coords): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
}

export function wazeUrl(c: Coords): string {
  return `https://waze.com/ul?ll=${c.lat},${c.lng}&navigate=yes`
}

export type PlaceResult = { label: string; detail: string; lat: number; lng: number }

const NOMINATIM = 'https://nominatim.openstreetmap.org'

function splitName(r: { name?: string; display_name: string }): { label: string; detail: string } {
  const parts = r.display_name.split(',').map((p) => p.trim())
  const label = r.name || parts[0]
  const rest = parts.filter((p) => p !== label)
  return { label, detail: rest.slice(0, 3).join(', ') }
}

/** Procura um local pelo nome/morada (Portugal e Espanha primeiro). */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'pt,es',
    'accept-language': 'pt-PT',
  })
  const res = await fetch(`${NOMINATIM}/search?${params}`)
  if (!res.ok) throw new Error('Pesquisa indisponível')
  const data: { name?: string; display_name: string; lat: string; lon: string }[] = await res.json()
  return data.map((r) => ({ ...splitName(r), lat: Number(r.lat), lng: Number(r.lon) }))
}

/** Nome curto de um ponto do mapa (para preencher o texto do local quando está vazio). */
export async function reverseGeocode(c: Coords): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(c.lat),
    lon: String(c.lng),
    format: 'jsonv2',
    zoom: '17',
    'accept-language': 'pt-PT',
  })
  const res = await fetch(`${NOMINATIM}/reverse?${params}`)
  if (!res.ok) return null
  const r: { name?: string; display_name?: string; address?: Record<string, string> } = await res.json()
  if (!r.display_name) return null
  const a = r.address ?? {}
  const town = a.village || a.town || a.city || a.municipality
  const place = r.name || [a.road, a.house_number].filter(Boolean).join(' ')
  return [place, town].filter(Boolean).join(', ') || r.display_name.split(',').slice(0, 2).join(',')
}
