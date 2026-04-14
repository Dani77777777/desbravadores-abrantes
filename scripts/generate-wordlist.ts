/**
 * Script que lê o léxico português de vendor/pt-br/lexico
 * (repositório: https://github.com/fserb/pt-br)
 * e gera o ficheiro utils/vantur-word-list.ts com palavras de 5 letras.
 * Guarda a forma limpa (sem acentos) como chave e a forma original como valor.
 *
 * Uso: bun run scripts/generate-wordlist.ts
 *
 * Para atualizar o repositório: git -C vendor/pt-br pull
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..')
const LEXICO_PATH = resolve(ROOT, 'vendor/pt-br/lexico')
const OUTPUT_PATH = resolve(ROOT, 'utils/vantur-word-list.ts')

console.log('A ler léxico de', LEXICO_PATH)

const text = await Bun.file(LEXICO_PATH).text()
const lines = text.split('\n')

console.log(`Total de entradas no léxico: ${lines.length}`)

function stripAccents(w: string): string {
  return w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '')
}

function countAccents(w: string): number {
  return (w.normalize('NFD').match(/[\u0300-\u036f]/g) ?? []).length
}

// Record<clean, display> — clean é a chave de validação, display é apresentado ao jogador
// Quando há conflito, prefere a forma com mais acentos
const wordMap: Record<string, string> = {}

for (const line of lines) {
  const display = line.trim().toLowerCase()
  const clean = stripAccents(display)
  if (clean.length === 5) {
    if (!(clean in wordMap) || countAccents(display) > countAccents(wordMap[clean])) {
      wordMap[clean] = display
    }
  }
}

const sorted = Object.entries(wordMap).sort(([a], [b]) => a.localeCompare(b))

console.log(`Palavras com 5 letras (sem duplicados): ${sorted.length}`)

const entries = sorted.map(([clean, display]) => `  "${clean}": "${display}"`).join(',\n')

const output = `// Palavras portuguesas de 5 letras — gerado automaticamente a partir de:
// https://github.com/fserb/pt-br  (em vendor/pt-br)
// Chave: forma limpa (sem acentos) — Valor: forma original (com acentos)
// Para regenerar: bun run scripts/generate-wordlist.ts
// Para atualizar o repositório: git -C vendor/pt-br pull
export const WORD_LIST: Record<string, string> = {
${entries}
}
`

await Bun.write(OUTPUT_PATH, output)
console.log(`Ficheiro gerado: ${OUTPUT_PATH}`)
