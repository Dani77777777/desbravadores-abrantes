// Normalização das respostas da "Pergunta da Semana" (camada 1 do agrupamento, §6.1).
//
// Puro e sem dependências de servidor: corre ao inserir (o resultado vai para
// `normalized_text`) e é o que decide se duas respostas da mesma pessoa são a
// mesma ("Moisés" e "moises" → repetida). Na fase da revisão, o agrupamento sem
// IA (autoGroup) e a sugestão no palco partem também daqui.

import { normalizeText } from '@/utils/text-normalization'

export const ANSWER_MAX_LENGTH = 40
export const MAX_ANSWERS_PER_QUESTION = 3

const LEADING_ARTICLE = /^(o|a|os|as|um|uma|uns|umas) /

/**
 * Texto da resposta como fica guardado: sem espaços nas pontas, espaços seguidos
 * juntos e sem caracteres de controlo. Não mexe em maiúsculas nem acentos.
 */
export function cleanAnswerText(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tamanho em caracteres (code points), igual ao `char_length` do Postgres. */
export function answerLength(text: string): number {
  return [...text].length
}

/**
 * Chave de comparação: minúsculas, sem acentos, sem pontuação nem emojis, espaços
 * juntos e sem artigo inicial. Os plurais ficam (o "s" de "moises" é da palavra).
 */
export function normalizeAnswer(text: string): string {
  const base = normalizeText(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const semArtigo = base.replace(LEADING_ARTICLE, '')
  return semArtigo || base
}

export type AnswerCheck =
  | { ok: true; text: string; normalized: string }
  | { ok: false; error: string }

/** Valida uma resposta acabada de escrever e devolve o texto limpo e a chave. */
export function checkAnswer(raw: string): AnswerCheck {
  const text = cleanAnswerText(raw)
  if (!text) return { ok: false, error: 'Escreve uma resposta.' }
  if (answerLength(text) > ANSWER_MAX_LENGTH) {
    return { ok: false, error: `A resposta pode ter até ${ANSWER_MAX_LENGTH} caracteres.` }
  }
  const normalized = normalizeAnswer(text)
  if (!normalized) return { ok: false, error: 'Escreve uma resposta com letras ou números.' }
  return { ok: true, text, normalized }
}

// ── Agrupamento sem IA (camada 1) ─────────────────────────────

/** Distância de edição (inserir, apagar ou trocar uma letra). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const x = [...a]
  const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[y.length]
}

/** Erros de escrita tolerados pelo tamanho: ≤4 letras, 0; 5–8, 1; mais, 2. */
export function maxTypos(length: number): number {
  if (length <= 4) return 0
  if (length <= 8) return 1
  return 2
}

/** Duas chaves normalizadas são a mesma resposta, a menos de um erro de escrita? */
export function isTypoOf(a: string, b: string): boolean {
  if (a === b) return true
  const la = [...a].length
  const lb = [...b].length
  const limit = maxTypos(Math.min(la, lb))
  if (limit === 0 || Math.abs(la - lb) > limit) return false
  return levenshtein(a, b) <= limit
}

export interface GroupableAnswer {
  id: string
  text: string
  normalized: string
}

export interface AutoGroup {
  label: string
  answerIds: string[]
}

/** Primeira letra maiúscula; o resto fica como foi escrito. */
export function capitalize(text: string): string {
  return text ? text[0].toLocaleUpperCase('pt-PT') + text.slice(1) : text
}

/** O texto mais escrito do grupo; nos empates, o que tem acentos e maiúscula ("Noé" antes de "noe"). */
export function groupLabel(texts: string[]): string {
  const counts = new Map<string, number>()
  for (const t of texts) counts.set(t, (counts.get(t) ?? 0) + 1)
  const accents = (t: string) => [...t].filter((c) => c.normalize('NFD').length > 1).length
  const upper = (t: string) => (/^\p{Lu}/u.test(t) ? 1 : 0)
  const [best] = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || accents(b[0]) - accents(a[0]) || upper(b[0]) - upper(a[0]),
  )
  return capitalize(best?.[0] ?? '')
}

/**
 * Junta as respostas com a mesma chave normalizada e, a seguir, as que só diferem
 * num erro de escrita ("moizes" ↔ "moises"). Os grupos saem do maior para o menor.
 */
export function autoGroup(items: GroupableAnswer[]): AutoGroup[] {
  const byKey = new Map<string, GroupableAnswer[]>()
  for (const item of items) {
    if (!item.normalized) continue
    byKey.set(item.normalized, [...(byKey.get(item.normalized) ?? []), item])
  }
  const keys = [...byKey.keys()]

  // Union-find sobre as chaves
  const parent = keys.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (isTypoOf(keys[i], keys[j])) parent[find(j)] = find(i)
    }
  }

  const clusters = new Map<number, GroupableAnswer[]>()
  keys.forEach((key, i) => {
    const root = find(i)
    clusters.set(root, [...(clusters.get(root) ?? []), ...byKey.get(key)!])
  })

  return [...clusters.values()]
    .map((members) => ({ label: groupLabel(members.map((m) => m.text)), answerIds: members.map((m) => m.id) }))
    .sort((a, b) => b.answerIds.length - a.answerIds.length || a.label.localeCompare(b.label, 'pt-PT'))
}

export interface SuggestableGroup {
  id: string
  label: string
  texts: string[]
}

/**
 * No palco: o grupo mais parecido com o que a equipa disse (sem IA). Compara com o
 * nome do grupo e com as respostas originais. null se nada for parecido.
 */
export function suggestGroup(input: string, groups: SuggestableGroup[]): string | null {
  const key = normalizeAnswer(input)
  if (!key) return null
  let best: { id: string; score: number } | null = null
  for (const g of groups) {
    for (const candidate of [g.label, ...g.texts].map(normalizeAnswer)) {
      if (!candidate) continue
      let score: number | null = null
      if (candidate === key) score = 0
      else if (isTypoOf(candidate, key)) score = levenshtein(candidate, key)
      // "lanterna grande" ↔ "lanterna": uma contém a outra (palavras com 4+ letras)
      else if (Math.min(candidate.length, key.length) >= 4 && (candidate.includes(key) || key.includes(candidate))) score = 3
      if (score !== null && (!best || score < best.score)) best = { id: g.id, score }
    }
  }
  return best?.id ?? null
}
