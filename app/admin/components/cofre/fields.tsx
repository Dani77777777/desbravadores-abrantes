'use client'

// Campos partilhados pelos diálogos do Cofre e da Loja.

import { Banknote, Smartphone, Landmark } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '@/lib/cofre'

export interface Coordinator {
  id: string
  full_name: string | null
}

const METHOD_ICONS: Record<PaymentMethod, React.ElementType> = {
  numerario: Banknote,
  mbway: Smartphone,
  transferencia: Landmark,
}

export function MethodPicker({ label, value, onChange, hint }: {
  label: string
  value: PaymentMethod
  onChange: (m: PaymentMethod) => void
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
        {PAYMENT_METHODS.map(m => {
          const Icon = METHOD_ICONS[m]
          const active = value === m
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(m)}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-bold ring-1 ring-inset transition-colors ${
                active ? 'bg-blue-950 text-white ring-blue-950' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
              }`}
            >
              <Icon className="h-4 w-4" /> {METHOD_LABELS[m]}
            </button>
          )
        })}
      </div>
      {hint && <p className="text-[11px] text-stone-500">{hint}</p>}
    </div>
  )
}

export function CoordinatorSelect({ id, label, value, onChange, coordinators, currentUserId }: {
  id: string
  label: string
  value: string
  onChange: (id: string) => void
  coordinators: Coordinator[]
  currentUserId: string
}) {
  const others = coordinators
    .filter(c => c.id !== currentUserId)
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt'))
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <option value={currentUserId}>Eu</option>
        {others.map(c => (
          <option key={c.id} value={c.id}>{c.full_name || 'Coordenador'}</option>
        ))}
      </select>
    </div>
  )
}

export const coordinatorName = (coordinators: Coordinator[], id: string | null | undefined, currentUserId?: string) => {
  if (!id) return '—'
  if (id === currentUserId) return 'Eu'
  return coordinators.find(c => c.id === id)?.full_name || 'Coordenador'
}
