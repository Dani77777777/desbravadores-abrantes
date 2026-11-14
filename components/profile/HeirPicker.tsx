'use client'

import { useState } from 'react'
import { Gift, Search, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'

export interface HeirOption {
  id: string
  full_name: string | null
  avatar_url?: string | null
  section?: string | null
}

interface HeirPickerProps {
  /** Membros que podem receber (já sem a pessoa que sai). */
  options: HeirOption[]
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
  loading?: boolean
  /** Texto por cima da lista, por exemplo "Deixar o XP e o Gold a alguém (opcional)". */
  label: string
}

/** Escolha opcional de quem fica com o XP e o Gold de uma conta que vai ser apagada. */
export function HeirPicker({ options, value, onChange, disabled, loading, label }: HeirPickerProps) {
  const [search, setSearch] = useState('')
  const selected = options.find((o) => o.id === value) ?? null
  const term = search.trim().toLowerCase()
  const filtered = term ? options.filter((o) => o.full_name?.toLowerCase().includes(term)) : options

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <Gift className="h-3.5 w-3.5 text-amber-500" /> {label}
      </p>

      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-2.5">
          <Avatar className="h-9 w-9">
            <AvatarImage src={selected.avatar_url || undefined} className="object-cover" />
            <AvatarFallback className="bg-slate-200 text-sm font-bold text-slate-600">{selected.full_name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{selected.full_name}</p>
            <p className="text-xs text-slate-500">Recebe todo o XP e Gold</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Não deixar a ninguém"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-amber-100 hover:text-slate-900 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar por nome..."
              disabled={disabled}
              className="pl-9"
            />
          </div>
          <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl border bg-slate-50 p-1">
            {filtered.length > 0 ? (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onChange(o.id); setSearch('') }}
                  disabled={disabled}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-white hover:shadow-sm disabled:opacity-50"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={o.avatar_url || undefined} className="object-cover" />
                    <AvatarFallback className="bg-slate-200 text-xs font-bold text-slate-600">{o.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{o.full_name}</span>
                  {o.section && <span className="shrink-0 text-[11px] capitalize text-slate-400">{o.section}</span>}
                </button>
              ))
            ) : (
              <p className="p-3 text-center text-xs text-slate-500">
                {loading ? 'A carregar membros...' : 'Nenhum membro encontrado.'}
              </p>
            )}
          </div>
          <p className="text-xs text-slate-500">Se não escolheres ninguém, o XP e o Gold perdem-se.</p>
        </>
      )}
    </div>
  )
}
