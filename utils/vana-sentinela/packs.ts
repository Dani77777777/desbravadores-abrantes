// Índice dos packs do VanaSentinela.
// Acrescentar um pack = criar packs/<cidade>.json + uma linha aqui. Nada mais.
// Os JSON são validados com zod nos testes (schema.ts), não em produção.

import type { Pack } from './types'
import abrantes from './packs/abrantes.json'

const ORADOR = 'Evangelista Jefferson Araújo'

export const PACKS: Pack[] = [
  { ...(abrantes as Pack), disponivel: true },
  { slug: 'entroncamento', cidade: 'Entroncamento', titulo: 'Em breve', orador: ORADOR, fraseChave: '', disponivel: false, cartas: [] },
  { slug: 'ourem', cidade: 'Ourém', titulo: 'Em breve', orador: ORADOR, fraseChave: '', disponivel: false, cartas: [] },
  { slug: 'tomar', cidade: 'Tomar', titulo: 'Em breve', orador: ORADOR, fraseChave: '', disponivel: false, cartas: [] },
]

export function getPack(slug: string): Pack | undefined {
  return PACKS.find((p) => p.slug === slug)
}

/** Pack que existe e já tem cartas para jogar. */
export function getPackDisponivel(slug: string): Pack | undefined {
  const pack = getPack(slug)
  return pack?.disponivel && pack.cartas.length > 0 ? pack : undefined
}
