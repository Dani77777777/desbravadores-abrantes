/**
 * Rótulos legíveis em português para os enums internos do VanaTrilha.
 * Os valores guardados na base de dados continuam como estão (status em inglês,
 * categorias/dificuldades sem acentos); estes mapas servem apenas para a UI.
 */

import type {
  VanaTrilhaCategory,
  VanaTrilhaDifficulty,
  VanaTrilhaRunStatus,
  VanaTrilhaStationColor,
  VanaTrilhaTile,
} from '@/types/vana-trilha'

export const CATEGORY_LABEL: Record<VanaTrilhaCategory, string> = {
  personagens: 'Personagens',
  lugares: 'Lugares',
  numeros: 'Números',
  milagres: 'Milagres',
  versiculos: 'Versículos',
}

export const CATEGORY_EMOJI: Record<VanaTrilhaCategory, string> = {
  personagens: '👤',
  lugares: '🗺️',
  numeros: '🔢',
  milagres: '✨',
  versiculos: '📖',
}

export const DIFFICULTY_LABEL: Record<VanaTrilhaDifficulty, string> = {
  facil: 'Fácil',
  media: 'Média',
  dificil: 'Difícil',
}

export const DIFFICULTY_BADGE_CLASS: Record<VanaTrilhaDifficulty, string> = {
  facil: 'bg-emerald-100 text-emerald-700',
  media: 'bg-amber-100 text-amber-700',
  dificil: 'bg-rose-100 text-rose-700',
}

export const STATUS_LABEL: Record<VanaTrilhaRunStatus, string> = {
  playing: 'A decorrer',
  completed: 'Completa',
  failed: 'Por completar',
}

export const TILE_LABEL: Record<VanaTrilhaTile, string> = {
  normal: 'Casa normal',
  milagre: 'Milagre',
  tabuas: 'Tábuas da Lei',
  elim: 'Fonte de Elim',
}

export const TILE_EMOJI: Record<VanaTrilhaTile, string> = {
  normal: '',
  milagre: '✨',
  tabuas: '📜',
  elim: '🌴',
}

/**
 * Classes Tailwind completas por cor de estação (escritas por extenso para o
 * Tailwind as detetar — não construir nomes de classes dinamicamente).
 */
export const STATION_THEME: Record<
  VanaTrilhaStationColor,
  { bg: string; soft: string; text: string; border: string; ring: string; gradient: string; dot: string }
> = {
  stone: {
    bg: 'bg-stone-600',
    soft: 'bg-stone-100',
    text: 'text-stone-700',
    border: 'border-stone-300',
    ring: 'ring-stone-400',
    gradient: 'from-stone-500 to-stone-700',
    dot: 'bg-stone-500',
  },
  blue: {
    bg: 'bg-blue-600',
    soft: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
    ring: 'ring-blue-400',
    gradient: 'from-sky-500 to-blue-700',
    dot: 'bg-blue-500',
  },
  amber: {
    bg: 'bg-amber-500',
    soft: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
    ring: 'ring-amber-400',
    gradient: 'from-amber-400 to-orange-500',
    dot: 'bg-amber-500',
  },
  violet: {
    bg: 'bg-violet-600',
    soft: 'bg-violet-100',
    text: 'text-violet-700',
    border: 'border-violet-300',
    ring: 'ring-violet-400',
    gradient: 'from-violet-500 to-indigo-700',
    dot: 'bg-violet-500',
  },
  orange: {
    bg: 'bg-orange-600',
    soft: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-300',
    ring: 'ring-orange-400',
    gradient: 'from-orange-500 to-red-600',
    dot: 'bg-orange-500',
  },
  teal: {
    bg: 'bg-teal-600',
    soft: 'bg-teal-100',
    text: 'text-teal-700',
    border: 'border-teal-300',
    ring: 'ring-teal-400',
    gradient: 'from-teal-500 to-cyan-700',
    dot: 'bg-teal-500',
  },
  yellow: {
    bg: 'bg-yellow-500',
    soft: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
    ring: 'ring-yellow-400',
    gradient: 'from-yellow-400 to-amber-600',
    dot: 'bg-yellow-500',
  },
}
