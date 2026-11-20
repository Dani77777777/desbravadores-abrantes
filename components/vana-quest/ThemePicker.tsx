'use client'

import { Check } from 'lucide-react'
import { VANA_QUEST_THEMES } from './themes'

/**
 * Escolha do tema de um VanaQuest em cartões (cores + emoji + nome).
 * Envia o valor no formulário como `theme` (input escondido).
 */
export function ThemePicker({
  value,
  onChange,
  labelId,
}: {
  value: string
  onChange: (id: string) => void
  labelId: string
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <input type="hidden" name="theme" value={value} />
      {VANA_QUEST_THEMES.map((theme) => {
        const selected = theme.id === value
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(theme.id)}
            className={`relative text-left rounded-xl border-2 overflow-hidden transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              selected ? 'border-blue-600 shadow-md' : 'border-transparent ring-1 ring-gray-200 hover:ring-gray-300'
            }`}
          >
            <div className="h-14 flex items-center justify-between px-3" style={{ background: theme.preview.background }}>
              <span className="text-2xl drop-shadow" aria-hidden>{theme.emoji}</span>
              <span className="flex gap-1" aria-hidden>
                {theme.preview.swatches.map((c) => (
                  <span key={c} className="w-3.5 h-3.5 rounded-full border border-white/60" style={{ background: c }} />
                ))}
              </span>
            </div>
            <div className="px-3 py-2 bg-white">
              <p className="text-sm font-bold text-gray-900">{theme.name}</p>
              <p className="text-[11px] text-gray-500 leading-snug">{theme.description}</p>
            </div>
            {selected && (
              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
