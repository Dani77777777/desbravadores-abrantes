'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, MapPin, MapPinOff, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { reverseGeocode, searchPlaces, type Coords, type PlaceResult } from '@/utils/maps'

const LocationMap = dynamic(() => import('./LocationMap').then((m) => m.LocationMap), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-2xl bg-stone-100" />,
})

interface LocationPickerProps {
  id?: string
  text: string
  onTextChange: (v: string) => void
  coords: Coords | null
  onCoordsChange: (c: Coords | null) => void
}

/**
 * Local do evento: texto livre + ponto no mapa (opcional).
 * Procura-se pelo texto ("Mostrar no mapa") ou toca-se diretamente no mapa.
 */
export function LocationPicker({ id, text, onTextChange, coords, onCoordsChange }: LocationPickerProps) {
  const [mapOpen, setMapOpen] = useState(!!coords)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    const q = text.trim()
    setMapOpen(true)
    if (!q) return
    setSearching(true)
    setError(null)
    setResults(null)
    try {
      const found = await searchPlaces(q)
      if (found.length === 0) setError('Não encontrei esse local. Toca no mapa para marcar o ponto.')
      else if (found.length === 1) onCoordsChange({ lat: found[0].lat, lng: found[0].lng })
      else setResults(found)
    } catch {
      setError('A pesquisa falhou. Podes marcar o ponto tocando no mapa.')
    } finally {
      setSearching(false)
    }
  }

  const pickOnMap = async (c: Coords) => {
    onCoordsChange(c)
    setResults(null)
    setError(null)
    // Sem texto? Preenche com o nome do sítio (o texto continua editável)
    if (!text.trim()) {
      const name = await reverseGeocode(c).catch(() => null)
      if (name) onTextChange(name)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${coords ? 'text-red-500' : 'text-stone-400'}`} />
          <Input
            id={id}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }}
            placeholder="Ex: Sede do Agrupamento, Abrantes"
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={search}
          disabled={searching}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-sm font-bold text-blue-800 ring-1 ring-inset ring-blue-200 transition-colors hover:bg-blue-100 disabled:opacity-60"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="hidden sm:inline">{text.trim() ? 'Mostrar no mapa' : 'Escolher no mapa'}</span>
          <span className="sm:hidden">Mapa</span>
        </button>
      </div>

      {results && (
        <ul className="overflow-hidden rounded-xl border border-stone-200 bg-white text-sm shadow-sm">
          <li className="flex items-center justify-between bg-stone-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Qual destes?
            <button type="button" onClick={() => setResults(null)} className="cursor-pointer rounded p-0.5 hover:bg-stone-200" aria-label="Fechar resultados">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                onClick={() => { onCoordsChange({ lat: r.lat, lng: r.lng }); setResults(null) }}
                className="flex w-full cursor-pointer items-start gap-2 border-t border-stone-100 px-3 py-2 text-left hover:bg-blue-50"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-stone-800">{r.label}</span>
                  <span className="block truncate text-xs text-stone-500">{r.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs font-medium text-amber-700">{error}</p>}

      {mapOpen && (
        <div className="space-y-1.5">
          <LocationMap value={coords} onPick={pickOnMap} className="h-56" />
          <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500">
            <span>{coords ? 'Arrasta o pino ou toca no mapa para acertar o ponto.' : 'Toca no mapa para marcar o ponto exato.'}</span>
            {coords ? (
              <button type="button" onClick={() => onCoordsChange(null)} className="inline-flex cursor-pointer items-center gap-1 font-bold text-red-600 hover:underline">
                <MapPinOff className="h-3.5 w-3.5" /> Tirar do mapa
              </button>
            ) : (
              <button type="button" onClick={() => setMapOpen(false)} className="cursor-pointer font-bold text-stone-500 hover:underline">
                Fechar mapa
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
