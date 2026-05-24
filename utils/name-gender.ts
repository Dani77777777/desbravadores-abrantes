/**
 * Heurística simples para detectar género do primeiro nome (PT-PT).
 * Regras:
 *  1. Lista de excepções conhecidas (nomes masculinos terminados em 'a' e femininos não-padrão)
 *  2. Termina em 'a' → feminino
 *  3. Outros → masculino (default)
 */

// Nomes masculinos que terminam em 'a' (raros mas existem)
const MASCULINE_A = new Set([
  'andrea', 'luca', 'joshua', 'akira', 'isaías', 'isaias', 'jeremias', 'matías',
  'zacarias', 'zacarías', 'elias', 'tobias', 'josias',
])

// Nomes femininos que NÃO terminam em 'a'
const FEMININE_OTHER = new Set([
  'inês', 'ines', 'beatriz', 'iris', 'íris', 'carmen', 'jasmim', 'jazmim',
  'soledad', 'mercedes', 'esther', 'ester', 'rute', 'rachel', 'raquel',
  'judite', 'edite', 'isabel', 'mabel', 'lis',
])

export type Gender = 'm' | 'f'

export function detectGender(fullName: string): Gender {
  if (!fullName) return 'm'
  const first = fullName.trim().split(/\s+/)[0]?.toLowerCase() || ''
  if (!first) return 'm'

  if (MASCULINE_A.has(first)) return 'm'
  if (FEMININE_OTHER.has(first)) return 'f'

  // Termina em 'a' (incluindo acentos)
  if (/[aáã]$/i.test(first)) return 'f'

  return 'm'
}

/**
 * Pronome / artigo definido conforme género: "o" ou "a"
 */
export function articleFor(gender: Gender): string {
  return gender === 'f' ? 'a' : 'o'
}

/**
 * "vencedor" / "vencedora"
 */
export function winnerWord(gender: Gender): string {
  return gender === 'f' ? 'vencedora' : 'vencedor'
}
