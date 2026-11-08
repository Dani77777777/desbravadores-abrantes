'use client'

import { Check } from 'lucide-react'
import { SECTION_LABELS, helperLabel } from '@/utils/permissions'
import { memberEntry, type RaffleMember } from '@/utils/raffle'
import { EntryAvatar } from './RaffleStage'

function roleLabel(m: RaffleMember): string | null {
  if (m.role === 'coordenador') return 'Coordenação'
  if (m.role === 'dirigente') {
    return `Dirigente${m.leadership_section ? ` · ${SECTION_LABELS[m.leadership_section] || m.leadership_section}` : ''}`
  }
  return helperLabel(m)
}

/** Linha de uma pessoa nas listas do sorteador. */
export function PersonRow({
  member,
  on,
  isMe,
  note,
  disabled,
  onToggle,
}: {
  member: RaffleMember
  on: boolean
  isMe: boolean
  /** Etiqueta âmbar (ex.: "Já saiu"). */
  note?: string
  disabled?: boolean
  onToggle: () => void
}) {
  const entry = memberEntry(member)
  const badge = roleLabel(member)
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${on ? 'bg-blue-50/60' : 'hover:bg-gray-50 disabled:hover:bg-transparent'}`}
      >
        <span
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 ${
            on ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 bg-white'
          }`}
        >
          {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
        <EntryAvatar entry={entry} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-bold ${on ? 'text-gray-900' : 'text-gray-500'}`}>
            {member.full_name || entry.name}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
            {member.section && <span>{SECTION_LABELS[member.section] || member.section}</span>}
            {badge && <span className="rounded bg-slate-100 px-1.5 font-bold text-slate-600">{badge}</span>}
            {isMe && <span className="rounded bg-blue-100 px-1.5 font-bold text-blue-700">Eu</span>}
            {note && <span className="rounded bg-amber-100 px-1.5 font-bold text-amber-700">{note}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}

export function QuickButton({
  children,
  icon,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-700"
    >
      {icon}
      {children}
    </button>
  )
}
