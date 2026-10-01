'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker } from 'leaflet'
import { DEFAULT_CENTER, type Coords } from '@/utils/maps'

// Pino próprio (os ícones por defeito do Leaflet perdem-se no bundler)
const PIN_HTML = `
  <div style="position:relative;width:34px;height:44px;filter:drop-shadow(0 6px 8px rgba(23,37,84,.35))">
    <svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true">
      <path d="M17 1C8.2 1 1 8 1 16.7 1 28.4 17 43 17 43s16-14.6 16-26.3C33 8 25.8 1 17 1z" fill="#172554" stroke="#fff" stroke-width="2"/>
      <circle cx="17" cy="16.5" r="6.5" fill="#facc15"/>
    </svg>
  </div>`

interface LocationMapProps {
  value: Coords | null
  /** Com isto o mapa fica editável: tocar no mapa ou arrastar o pino muda o ponto. */
  onPick?: (c: Coords) => void
  /** Ponto para onde voar quando não há `value` (ex.: resultado de pesquisa). */
  zoom?: number
  className?: string
}

/** Mapa OpenStreetMap (Leaflet). Carrega o Leaflet só no browser. */
export function LocationMap({ value, onPick, zoom = 16, className = 'h-56' }: LocationMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const L = useRef<typeof import('leaflet') | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  // O Leaflet carrega de forma assíncrona: ao criar o mapa usa-se o ponto mais recente
  const valueRef = useRef(value)
  valueRef.current = value
  // Último ponto escolhido no próprio mapa: esse não precisa de "voar" até lá
  const picked = useRef<Coords | null>(null)
  const pick = (c: Coords) => {
    picked.current = c
    onPickRef.current?.(c)
  }

  const placeMarker = (c: Coords) => {
    const lib = L.current, m = map.current
    if (!lib || !m) return
    if (!marker.current) {
      marker.current = lib
        .marker([c.lat, c.lng], {
          draggable: !!onPickRef.current,
          icon: lib.divIcon({ html: PIN_HTML, className: '', iconSize: [34, 44], iconAnchor: [17, 43] }),
          keyboard: false,
        })
        .addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng()
        pick({ lat: p.lat, lng: p.lng })
      })
    } else {
      marker.current.setLatLng([c.lat, c.lng])
    }
  }

  // Criar o mapa uma vez
  useEffect(() => {
    let cancelled = false
    let resizeObs: ResizeObserver | null = null
    import('leaflet').then((lib) => {
      if (cancelled || !el.current || map.current) return
      L.current = lib
      const initial = valueRef.current
      const start = initial ?? DEFAULT_CENTER
      const m = lib.map(el.current, {
        center: [start.lat, start.lng],
        zoom: initial ? zoom : 12,
        scrollWheelZoom: false,
        attributionControl: true,
      })
      lib.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m)
      m.attributionControl.setPrefix(false)
      if (onPickRef.current) {
        m.on('click', (e) => pick({ lat: e.latlng.lat, lng: e.latlng.lng }))
      }
      map.current = m
      if (initial) placeMarker(initial)
      // Dentro de diálogos (ou escondido) o tamanho muda depois de criado: recentrar no ponto
      resizeObs = new ResizeObserver(() => {
        m.invalidateSize()
        const v = valueRef.current
        if (v) m.setView([v.lat, v.lng], m.getZoom(), { animate: false })
      })
      resizeObs.observe(el.current)
    })
    return () => {
      cancelled = true
      resizeObs?.disconnect()
      map.current?.remove()
      map.current = null
      marker.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Acompanhar o ponto escolhido
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (value) {
      placeMarker(value)
      if (picked.current?.lat === value.lat && picked.current?.lng === value.lng) return
      m.flyTo([value.lat, value.lng], Math.max(m.getZoom(), zoom), { duration: 0.6 })
    } else if (marker.current) {
      marker.current.remove()
      marker.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng])

  return (
    <div
      ref={el}
      className={`relative z-0 w-full overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200 ${onPick ? 'cursor-crosshair' : ''} ${className}`}
    />
  )
}
