'use client'

import { Check } from 'lucide-react'
import type { Gender } from '@/utils/name-gender'

const OPTIONS: { id: Gender; label: string; symbol: string; on: string; badge: string }[] = [
  {
    id: 'm',
    label: 'Masculino',
    symbol: '♂',
    on: 'bg-sky-50 text-sky-900 ring-2 ring-sky-500 shadow-[0_10px_24px_-12px_rgba(14,165,233,.8)]',
    badge: 'bg-sky-500 text-white',
  },
  {
    id: 'f',
    label: 'Feminino',
    symbol: '♀',
    on: 'bg-pink-50 text-pink-900 ring-2 ring-pink-500 shadow-[0_10px_24px_-12px_rgba(236,72,153,.8)]',
    badge: 'bg-pink-500 text-white',
  },
]

/** Escolha do sexo (onboarding e perfil): dois cartões grandes, um toque. */
export function GenderChoice({
  value,
  onChange,
  disabled,
  name = 'gender',
}: {
  value: Gender | null
  onChange: (g: Gender) => void
  disabled?: boolean
  name?: string
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-3">
      {OPTIONS.map((o) => {
        const active = value === o.id
        return (
          <label
            key={o.id}
            className={`relative flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5 transition-all has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-yellow-400/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
              active ? o.on : 'bg-stone-50 text-stone-600 ring-1 ring-inset ring-stone-200 hover:bg-white hover:ring-stone-300'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={active}
              disabled={disabled}
              onChange={() => onChange(o.id)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl font-black transition-colors ${
                active ? o.badge : 'bg-white text-stone-400 ring-1 ring-inset ring-stone-200'
              }`}
            >
              {o.symbol}
            </span>
            <span className="text-base font-extrabold">{o.label}</span>
            {active && <Check className="ml-auto h-5 w-5 shrink-0" strokeWidth={3} />}
          </label>
        )
      })}
    </div>
  )
}
