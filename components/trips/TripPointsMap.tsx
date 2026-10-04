'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { LayerGroup, Map as LeafletMap } from 'leaflet'
import { DEFAULT_CENTER } from '@/utils/maps'

export type MapPoint = {
  id: string
  name: string
  lat: number
  lng: number
  color: string
  /** Texto curto por baixo do nome (ex.: "3 ida · 2 volta"). */
  detail?: string
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const pinHtml = (fill: string, inner: string) => `
  <div style="position:relative;width:30px;height:39px;filter:drop-shadow(0 5px 7px rgba(23,37,84,.35))">
    <svg viewBox="0 0 34 44" width="30" height="39" aria-hidden="true">
      <path d="M17 1C8.2 1 1 8 1 16.7 1 28.4 17 43 17 43s16-14.6 16-26.3C33 8 25.8 1 17 1z" fill="${fill}" stroke="#fff" stroke-width="2"/>
      ${inner}
    </svg>
  </div>`

/** Mapa geral das boleias: todos os pontos de encontro e o local do evento (bandeira). */
export function TripPointsMap({
  points,
  destination,
  onSelect,
  className = 'h-64',
}: {
  points: MapPoint[]
  destination: { name: string; lat: number; lng: number } | null
  onSelect?: (id: string) => void
  className?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const L = useRef<typeof import('leaflet') | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const dataRef = useRef({ points, destination })
  dataRef.current = { points, destination }
  // Só se reenquadra quando muda o conjunto de pontos (não a cada edição de nome)
  const lastFit = useRef('')

  const draw = () => {
    const lib = L.current, m = map.current, g = layer.current
    if (!lib || !m || !g) return
    const { points, destination } = dataRef.current
    g.clearLayers()
    const all: [number, number][] = []
    points.forEach((p, i) => {
      const marker = lib
        .marker([p.lat, p.lng], {
          icon: lib.divIcon({
            html: pinHtml(p.color, `<text x="17" y="21.5" text-anchor="middle" font-size="13" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">${i + 1}</text>`),
            className: '',
            iconSize: [30, 39],
            iconAnchor: [15, 38],
          }),
          keyboard: false,
        })
        .bindTooltip(
          `<b>${escapeHtml(p.name || 'Sem nome')}</b>${p.detail ? `<br><span style="color:#64748b">${escapeHtml(p.detail)}</span>` : ''}`,
          { direction: 'top', offset: [0, -36], permanent: points.length <= 6 },
        )
        .addTo(g)
      marker.on('click', () => onSelectRef.current?.(p.id))
      all.push([p.lat, p.lng])
    })
    if (destination) {
      lib
        .marker([destination.lat, destination.lng], {
          icon: lib.divIcon({
            html: pinHtml('#172554', '<path d="M13 9v16M13 9h10l-2.5 3.5L23 16H13" stroke="#facc15" stroke-width="2.4" fill="#facc15" stroke-linejoin="round"/>'),
            className: '',
            iconSize: [30, 39],
            iconAnchor: [15, 38],
          }),
          keyboard: false,
          zIndexOffset: 500,
        })
        .bindTooltip(`<b>Destino</b><br>${escapeHtml(destination.name || 'Local do evento')}`, { direction: 'top', offset: [0, -36] })
        .addTo(g)
      all.push([destination.lat, destination.lng])
    }
    const key = all.map((c) => c.join(',')).join('|')
    if (key === lastFit.current) return
    lastFit.current = key
    if (all.length === 1) m.setView(all[0], 15)
    else if (all.length > 1) m.fitBounds(lib.latLngBounds(all), { padding: [40, 40], maxZoom: 15 })
  }

  useEffect(() => {
    let cancelled = false
    let resizeObs: ResizeObserver | null = null
    import('leaflet').then((lib) => {
      if (cancelled || !el.current || map.current) return
      L.current = lib
      const m = lib.map(el.current, { center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], zoom: 12, scrollWheelZoom: false })
      lib.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m)
      m.attributionControl.setPrefix(false)
      map.current = m
      layer.current = lib.layerGroup().addTo(m)
      draw()
      resizeObs = new ResizeObserver(() => m.invalidateSize())
      resizeObs.observe(el.current)
    })
    return () => {
      cancelled = true
      resizeObs?.disconnect()
      map.current?.remove()
      map.current = null
      layer.current = null
    }
     
  }, [])

  useEffect(() => {
    draw()
     
  }, [points, destination])

  return <div ref={el} className={`relative z-0 w-full overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200 ${className}`} />
}
