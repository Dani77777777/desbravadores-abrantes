'use client'

import { ExternalLink, Link2, MapPin, Video } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LocationPicker } from './LocationPicker'
import { normalizeUrl, onlinePlatform } from '@/utils/online-event'
import type { Coords } from '@/utils/maps'

interface EventPlaceFieldProps {
  id: string
  online: boolean
  onOnlineChange: (v: boolean) => void
  text: string
  onTextChange: (v: string) => void
  coords: Coords | null
  onCoordsChange: (c: Coords | null) => void
  url: string
  onUrlChange: (v: string) => void
}

/** Onde é o evento: presencial (local + mapa) ou online (link da reunião). */
export function EventPlaceField({
  id, online, onOnlineChange, text, onTextChange, coords, onCoordsChange, url, onUrlChange,
}: EventPlaceFieldProps) {
  const normalized = normalizeUrl(url)
  const platform = onlinePlatform(normalized)
  const invalid = url.trim() !== '' && !normalized

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>
          {online ? 'Link da reunião' : 'Local'}{' '}
          <span className="font-normal text-stone-400">
            {online ? '(podes pôr mais tarde)' : '(escreve e/ou marca no mapa)'}
          </span>
        </Label>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-xs font-bold" role="radiogroup" aria-label="Tipo de evento">
          {([[false, 'Presencial', MapPin], [true, 'Online', Video]] as const).map(([value, label, Icon]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={online === value}
              onClick={() => onOnlineChange(value)}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                online === value ? 'bg-white text-blue-950 shadow-sm' : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {online ? (
        <div className="space-y-1.5">
          <div className="relative">
            <Link2 className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${normalized ? 'text-blue-600' : 'text-stone-400'}`} />
            <Input
              id={id}
              type="text"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="Ex: https://meet.google.com/abc-defg-hij"
              className="pl-9"
              aria-invalid={invalid}
            />
          </div>
          {invalid ? (
            <p className="text-xs font-medium text-red-600">Isto não parece um link válido.</p>
          ) : normalized ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
              <span className="inline-flex items-center gap-1 font-bold text-blue-800">
                <Video className="h-3.5 w-3.5" /> {platform ?? 'Reunião online'}
              </span>
              <a href={normalized} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline">
                <ExternalLink className="h-3 w-3" /> Testar link
              </a>
            </p>
          ) : (
            <p className="text-[11px] text-stone-500">Google Meet, Zoom, Teams, YouTube… Os membros veem um botão para entrar.</p>
          )}
        </div>
      ) : (
        <LocationPicker id={id} text={text} onTextChange={onTextChange} coords={coords} onCoordsChange={onCoordsChange} />
      )}
    </div>
  )
}
