'use client'

import { Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Gender } from '@/utils/name-gender'

const SYMBOL: Record<Gender, string> = { m: '♂', f: '♀' }
const TONE: Record<Gender, string> = {
  m: 'bg-sky-100 text-sky-700 ring-sky-200',
  f: 'bg-pink-100 text-pink-700 ring-pink-200',
}

/**
 * ♂/♀ de um membro. Se ainda não o indicou no perfil, mostra o palpite pelo nome com
 * "?" e tracejado. A coordenação carrega nele para o definir; os outros só veem.
 */
export function GenderBadge({
  gender,
  confirmed,
  canEdit,
  onSet,
  size = 'sm',
}: {
  gender: Gender
  confirmed: boolean
  canEdit: boolean
  onSet?: (g: Gender) => void
  size?: 'sm' | 'md'
}) {
  const cls = `inline-flex flex-shrink-0 items-center justify-center gap-0.5 rounded-full font-black ${TONE[gender]} ${
    confirmed ? 'ring-1 ring-inset' : 'border border-dashed border-current'
  } ${size === 'md' ? 'h-7 min-w-7 px-1.5 text-sm' : 'h-5 min-w-5 px-1 text-[11px]'}`
  const label = `${SYMBOL[gender]}${confirmed ? '' : '?'}`
  const title = confirmed
    ? gender === 'm'
      ? 'Masculino'
      : 'Feminino'
    : `Palpite pelo nome: ${gender === 'm' ? 'masculino' : 'feminino'} — ainda não indicou no perfil`

  if (!canEdit || !onSet) {
    return (
      <span className={cls} title={title}>
        {label}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${cls} cursor-pointer`} title={title} onClick={(e) => e.stopPropagation()}>
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">{confirmed ? 'Sexo' : 'Definir sexo'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(['m', 'f'] as const).map((g) => (
          <DropdownMenuItem key={g} onSelect={() => onSet(g)}>
            <span className="w-4 font-black">{SYMBOL[g]}</span> {g === 'm' ? 'Masculino' : 'Feminino'}
            {confirmed && gender === g && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
