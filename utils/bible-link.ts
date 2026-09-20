/**
 * Converte referências bíblicas em português ("Êxodo 14:14", "1 Samuel 17:45-47",
 * "Sl 23", "Josué 1–6") em links para a Bíblia Online (ACF).
 * Formato do site: /acf/{livro}/{capítulo}/{versículo ou intervalo}.
 */

import { normalizeText } from '@/utils/text-normalization'

const BIBLE_ONLINE_BASE = 'https://www.bibliaonline.com.br/acf'

// [abreviatura no site, nomes/abreviaturas aceites (normalizados: sem acentos, espaços ou pontos)]
const BOOKS: [string, string[]][] = [
  ['gn', ['genesis', 'gen', 'gn']],
  ['ex', ['exodo', 'ex']],
  ['lv', ['levitico', 'lev', 'lv']],
  ['nm', ['numeros', 'num', 'nm']],
  ['dt', ['deuteronomio', 'deut', 'dt']],
  ['js', ['josue', 'jos', 'js']],
  ['jz', ['juizes', 'jz']],
  ['rt', ['rute', 'rt']],
  ['1sm', ['1samuel', '1sam', '1sm']],
  ['2sm', ['2samuel', '2sam', '2sm']],
  ['1rs', ['1reis', '1rs']],
  ['2rs', ['2reis', '2rs']],
  ['1cr', ['1cronicas', '1cron', '1cr']],
  ['2cr', ['2cronicas', '2cron', '2cr']],
  ['ed', ['esdras', 'esd', 'ed']],
  ['ne', ['neemias', 'ne']],
  ['et', ['ester', 'est', 'et']],
  ['jó', ['job']], // "Jó" vs "Jo" (João) só se distingue pelo acento: tratado em bibleOnlineUrl
  ['sl', ['salmos', 'salmo', 'sal', 'sl']],
  ['pv', ['proverbios', 'prov', 'pv']],
  ['ec', ['eclesiastes', 'ecl', 'ec']],
  ['ct', ['canticodoscanticos', 'canticos', 'cantares', 'ct']],
  ['is', ['isaias', 'is']],
  ['jr', ['jeremias', 'jer', 'jr']],
  ['lm', ['lamentacoes', 'lam', 'lm']],
  ['ez', ['ezequiel', 'ez']],
  ['dn', ['daniel', 'dan', 'dn']],
  ['os', ['oseias', 'os']],
  ['jl', ['joel', 'jl']],
  ['am', ['amos', 'am']],
  ['ob', ['obadias', 'ob']],
  ['jn', ['jonas', 'jn']],
  ['mq', ['miqueias', 'mq']],
  ['na', ['naum', 'na']],
  ['hc', ['habacuque', 'hab', 'hc']],
  ['sf', ['sofonias', 'sf']],
  ['ag', ['ageu', 'ag']],
  ['zc', ['zacarias', 'zac', 'zc']],
  ['ml', ['malaquias', 'mal', 'ml']],
  ['mt', ['mateus', 'mat', 'mt']],
  ['mc', ['marcos', 'mc']],
  ['lc', ['lucas', 'lc']],
  ['jo', ['joao', 'jo']],
  ['atos', ['atos', 'actos', 'at']],
  ['rm', ['romanos', 'rom', 'rm']],
  ['1co', ['1corintios', '1cor', '1co']],
  ['2co', ['2corintios', '2cor', '2co']],
  ['gl', ['galatas', 'gal', 'gl']],
  ['ef', ['efesios', 'ef']],
  ['fp', ['filipenses', 'fil', 'fp']],
  ['cl', ['colossenses', 'col', 'cl']],
  ['1ts', ['1tessalonicenses', '1tes', '1ts']],
  ['2ts', ['2tessalonicenses', '2tes', '2ts']],
  ['1tm', ['1timoteo', '1tim', '1tm']],
  ['2tm', ['2timoteo', '2tim', '2tm']],
  ['tt', ['tito', 'tt']],
  ['fm', ['filemon', 'filemom', 'fm']],
  ['hb', ['hebreus', 'heb', 'hb']],
  ['tg', ['tiago', 'tg']],
  ['1pe', ['1pedro', '1pe']],
  ['2pe', ['2pedro', '2pe']],
  ['1jo', ['1joao', '1jo']],
  ['2jo', ['2joao', '2jo']],
  ['3jo', ['3joao', '3jo']],
  ['jd', ['judas', 'jd']],
  ['ap', ['apocalipse', 'apoc', 'ap']],
]

const BOOK_BY_NAME = new Map<string, string>()
for (const [slug, names] of BOOKS) {
  for (const name of names) BOOK_BY_NAME.set(name, slug)
}

const ROMAN_PREFIX: Record<string, string> = { i: '1', ii: '2', iii: '3' }

// livro (com prefixo numérico opcional) + capítulo + versículo/intervalo opcional
const REFERENCE_RE =
  /^\s*((?:[1-3]\s*\.?\s*[ºª°]?\s*|(?:iii|ii|i)\s+)?\p{L}[\p{L}\s.]*?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?/iu

export function bibleOnlineUrl(reference: string | null | undefined): string | null {
  if (!reference) return null
  const match = reference.match(REFERENCE_RE)
  if (!match) return null

  const [, rawBook, chapter, verseStart, verseEnd] = match
  let book = normalizeText(rawBook)
  book = book.replace(/^(iii|ii|i)\s+/, (_, roman: string) => ROMAN_PREFIX[roman])
  book = book.replace(/[\s.ºª°]/g, '')

  const slug = rawBook.trim().toLowerCase() === 'jó' ? 'jó' : BOOK_BY_NAME.get(book)
  if (!slug) return null

  let url = `${BIBLE_ONLINE_BASE}/${encodeURIComponent(slug)}/${chapter}`
  if (verseStart) url += `/${verseStart}${verseEnd ? `-${verseEnd}` : ''}`
  return url
}
