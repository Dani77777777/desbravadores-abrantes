// Estrutura da Bíblia (66 livros) usada pelo VanaEspada.
//
// Na base de dados guarda-se SEMPRE o `id` canónico (1–66), nunca o nome: evita o
// clássico problema "Jó" vs "Jo(ão)", que só se distinguem pelo acento.
// O `slug` é o mesmo que a Bíblia Online usa (ver utils/bible-link.ts), para se
// poderem construir links diretos para o texto.
//
// Sem dependências: este ficheiro é importado pelo cliente, pelo servidor e pelos testes.

export type Testament = 'old' | 'new'

export type BibleSection =
  | 'law' | 'history' | 'poetry' | 'major_prophets' | 'minor_prophets'   // AT
  | 'gospels' | 'acts' | 'pauline' | 'general' | 'apocalyptic'           // NT

export interface BibleBook {
  /** 1..66, ordem canónica. É isto que se guarda na BD. */
  id: number
  /** Nome em PT-PT, ex.: "1 Samuel". */
  name: string
  /** Abreviatura curta para a grelha do telemóvel, ex.: "1Sm". */
  abbr: string
  /** Abreviatura da Bíblia Online (igual à de utils/bible-link.ts). */
  slug: string
  testament: Testament
  section: BibleSection
  /** Número de capítulos na versificação da Almeida. */
  chapters: number
}

export const BIBLE_BOOKS: BibleBook[] = [
  // ── Antigo Testamento ──────────────────────────────────────────
  { id: 1,  name: 'Génesis',       abbr: 'Gn',  slug: 'gn',   testament: 'old', section: 'law',            chapters: 50 },
  { id: 2,  name: 'Êxodo',         abbr: 'Êx',  slug: 'ex',   testament: 'old', section: 'law',            chapters: 40 },
  { id: 3,  name: 'Levítico',      abbr: 'Lv',  slug: 'lv',   testament: 'old', section: 'law',            chapters: 27 },
  { id: 4,  name: 'Números',       abbr: 'Nm',  slug: 'nm',   testament: 'old', section: 'law',            chapters: 36 },
  { id: 5,  name: 'Deuteronómio',  abbr: 'Dt',  slug: 'dt',   testament: 'old', section: 'law',            chapters: 34 },
  { id: 6,  name: 'Josué',         abbr: 'Js',  slug: 'js',   testament: 'old', section: 'history',        chapters: 24 },
  { id: 7,  name: 'Juízes',        abbr: 'Jz',  slug: 'jz',   testament: 'old', section: 'history',        chapters: 21 },
  { id: 8,  name: 'Rute',          abbr: 'Rt',  slug: 'rt',   testament: 'old', section: 'history',        chapters: 4  },
  { id: 9,  name: '1 Samuel',      abbr: '1Sm', slug: '1sm',  testament: 'old', section: 'history',        chapters: 31 },
  { id: 10, name: '2 Samuel',      abbr: '2Sm', slug: '2sm',  testament: 'old', section: 'history',        chapters: 24 },
  { id: 11, name: '1 Reis',        abbr: '1Rs', slug: '1rs',  testament: 'old', section: 'history',        chapters: 22 },
  { id: 12, name: '2 Reis',        abbr: '2Rs', slug: '2rs',  testament: 'old', section: 'history',        chapters: 25 },
  { id: 13, name: '1 Crónicas',    abbr: '1Cr', slug: '1cr',  testament: 'old', section: 'history',        chapters: 29 },
  { id: 14, name: '2 Crónicas',    abbr: '2Cr', slug: '2cr',  testament: 'old', section: 'history',        chapters: 36 },
  { id: 15, name: 'Esdras',        abbr: 'Ed',  slug: 'ed',   testament: 'old', section: 'history',        chapters: 10 },
  { id: 16, name: 'Neemias',       abbr: 'Ne',  slug: 'ne',   testament: 'old', section: 'history',        chapters: 13 },
  { id: 17, name: 'Ester',         abbr: 'Et',  slug: 'et',   testament: 'old', section: 'history',        chapters: 10 },
  { id: 18, name: 'Jó',            abbr: 'Jó',  slug: 'jó',   testament: 'old', section: 'poetry',         chapters: 42 },
  { id: 19, name: 'Salmos',        abbr: 'Sl',  slug: 'sl',   testament: 'old', section: 'poetry',         chapters: 150 },
  { id: 20, name: 'Provérbios',    abbr: 'Pv',  slug: 'pv',   testament: 'old', section: 'poetry',         chapters: 31 },
  { id: 21, name: 'Eclesiastes',   abbr: 'Ec',  slug: 'ec',   testament: 'old', section: 'poetry',         chapters: 12 },
  { id: 22, name: 'Cânticos',      abbr: 'Ct',  slug: 'ct',   testament: 'old', section: 'poetry',         chapters: 8  },
  { id: 23, name: 'Isaías',        abbr: 'Is',  slug: 'is',   testament: 'old', section: 'major_prophets', chapters: 66 },
  { id: 24, name: 'Jeremias',      abbr: 'Jr',  slug: 'jr',   testament: 'old', section: 'major_prophets', chapters: 52 },
  { id: 25, name: 'Lamentações',   abbr: 'Lm',  slug: 'lm',   testament: 'old', section: 'major_prophets', chapters: 5  },
  { id: 26, name: 'Ezequiel',      abbr: 'Ez',  slug: 'ez',   testament: 'old', section: 'major_prophets', chapters: 48 },
  { id: 27, name: 'Daniel',        abbr: 'Dn',  slug: 'dn',   testament: 'old', section: 'major_prophets', chapters: 12 },
  { id: 28, name: 'Oseias',        abbr: 'Os',  slug: 'os',   testament: 'old', section: 'minor_prophets', chapters: 14 },
  { id: 29, name: 'Joel',          abbr: 'Jl',  slug: 'jl',   testament: 'old', section: 'minor_prophets', chapters: 3  },
  { id: 30, name: 'Amós',          abbr: 'Am',  slug: 'am',   testament: 'old', section: 'minor_prophets', chapters: 9  },
  { id: 31, name: 'Obadias',       abbr: 'Ob',  slug: 'ob',   testament: 'old', section: 'minor_prophets', chapters: 1  },
  { id: 32, name: 'Jonas',         abbr: 'Jn',  slug: 'jn',   testament: 'old', section: 'minor_prophets', chapters: 4  },
  { id: 33, name: 'Miqueias',      abbr: 'Mq',  slug: 'mq',   testament: 'old', section: 'minor_prophets', chapters: 7  },
  { id: 34, name: 'Naum',          abbr: 'Na',  slug: 'na',   testament: 'old', section: 'minor_prophets', chapters: 3  },
  { id: 35, name: 'Habacuque',     abbr: 'Hc',  slug: 'hc',   testament: 'old', section: 'minor_prophets', chapters: 3  },
  { id: 36, name: 'Sofonias',      abbr: 'Sf',  slug: 'sf',   testament: 'old', section: 'minor_prophets', chapters: 3  },
  { id: 37, name: 'Ageu',          abbr: 'Ag',  slug: 'ag',   testament: 'old', section: 'minor_prophets', chapters: 2  },
  { id: 38, name: 'Zacarias',      abbr: 'Zc',  slug: 'zc',   testament: 'old', section: 'minor_prophets', chapters: 14 },
  { id: 39, name: 'Malaquias',     abbr: 'Ml',  slug: 'ml',   testament: 'old', section: 'minor_prophets', chapters: 4  },

  // ── Novo Testamento ────────────────────────────────────────────
  { id: 40, name: 'Mateus',            abbr: 'Mt',  slug: 'mt',   testament: 'new', section: 'gospels',     chapters: 28 },
  { id: 41, name: 'Marcos',            abbr: 'Mc',  slug: 'mc',   testament: 'new', section: 'gospels',     chapters: 16 },
  { id: 42, name: 'Lucas',             abbr: 'Lc',  slug: 'lc',   testament: 'new', section: 'gospels',     chapters: 24 },
  { id: 43, name: 'João',              abbr: 'Jo',  slug: 'jo',   testament: 'new', section: 'gospels',     chapters: 21 },
  { id: 44, name: 'Atos',              abbr: 'At',  slug: 'atos', testament: 'new', section: 'acts',        chapters: 28 },
  { id: 45, name: 'Romanos',           abbr: 'Rm',  slug: 'rm',   testament: 'new', section: 'pauline',     chapters: 16 },
  { id: 46, name: '1 Coríntios',       abbr: '1Co', slug: '1co',  testament: 'new', section: 'pauline',     chapters: 16 },
  { id: 47, name: '2 Coríntios',       abbr: '2Co', slug: '2co',  testament: 'new', section: 'pauline',     chapters: 13 },
  { id: 48, name: 'Gálatas',           abbr: 'Gl',  slug: 'gl',   testament: 'new', section: 'pauline',     chapters: 6  },
  { id: 49, name: 'Efésios',           abbr: 'Ef',  slug: 'ef',   testament: 'new', section: 'pauline',     chapters: 6  },
  { id: 50, name: 'Filipenses',        abbr: 'Fp',  slug: 'fp',   testament: 'new', section: 'pauline',     chapters: 4  },
  { id: 51, name: 'Colossenses',       abbr: 'Cl',  slug: 'cl',   testament: 'new', section: 'pauline',     chapters: 4  },
  { id: 52, name: '1 Tessalonicenses', abbr: '1Ts', slug: '1ts',  testament: 'new', section: 'pauline',     chapters: 5  },
  { id: 53, name: '2 Tessalonicenses', abbr: '2Ts', slug: '2ts',  testament: 'new', section: 'pauline',     chapters: 3  },
  { id: 54, name: '1 Timóteo',         abbr: '1Tm', slug: '1tm',  testament: 'new', section: 'pauline',     chapters: 6  },
  { id: 55, name: '2 Timóteo',         abbr: '2Tm', slug: '2tm',  testament: 'new', section: 'pauline',     chapters: 4  },
  { id: 56, name: 'Tito',              abbr: 'Tt',  slug: 'tt',   testament: 'new', section: 'pauline',     chapters: 3  },
  { id: 57, name: 'Filémon',           abbr: 'Fm',  slug: 'fm',   testament: 'new', section: 'pauline',     chapters: 1  },
  { id: 58, name: 'Hebreus',           abbr: 'Hb',  slug: 'hb',   testament: 'new', section: 'general',     chapters: 13 },
  { id: 59, name: 'Tiago',             abbr: 'Tg',  slug: 'tg',   testament: 'new', section: 'general',     chapters: 5  },
  { id: 60, name: '1 Pedro',           abbr: '1Pe', slug: '1pe',  testament: 'new', section: 'general',     chapters: 5  },
  { id: 61, name: '2 Pedro',           abbr: '2Pe', slug: '2pe',  testament: 'new', section: 'general',     chapters: 3  },
  { id: 62, name: '1 João',            abbr: '1Jo', slug: '1jo',  testament: 'new', section: 'general',     chapters: 5  },
  { id: 63, name: '2 João',            abbr: '2Jo', slug: '2jo',  testament: 'new', section: 'general',     chapters: 1  },
  { id: 64, name: '3 João',            abbr: '3Jo', slug: '3jo',  testament: 'new', section: 'general',     chapters: 1  },
  { id: 65, name: 'Judas',             abbr: 'Jd',  slug: 'jd',   testament: 'new', section: 'general',     chapters: 1  },
  { id: 66, name: 'Apocalipse',        abbr: 'Ap',  slug: 'ap',   testament: 'new', section: 'apocalyptic', chapters: 22 },
]

const BY_ID = new Map<number, BibleBook>(BIBLE_BOOKS.map((b) => [b.id, b]))

export function getBook(bookId: number | null | undefined): BibleBook | undefined {
  return bookId == null ? undefined : BY_ID.get(bookId)
}

export function bookName(bookId: number | null | undefined): string {
  return getBook(bookId)?.name ?? '—'
}

export const OLD_TESTAMENT = BIBLE_BOOKS.filter((b) => b.testament === 'old')
export const NEW_TESTAMENT = BIBLE_BOOKS.filter((b) => b.testament === 'new')

/** Total de capítulos da Bíblia — usado para as larguras proporcionais da BibleBar. */
export const TOTAL_CHAPTERS = BIBLE_BOOKS.reduce((sum, b) => sum + b.chapters, 0)

/** Máximo de versículos num capítulo da Bíblia (Sl 119) — limite do teclado numérico. */
export const MAX_VERSE = 176

export const SECTION_LABELS: Record<BibleSection, string> = {
  law: 'Lei',
  history: 'História',
  poetry: 'Poéticos',
  major_prophets: 'Profetas maiores',
  minor_prophets: 'Profetas menores',
  gospels: 'Evangelhos',
  acts: 'Atos',
  pauline: 'Cartas de Paulo',
  general: 'Cartas gerais',
  apocalyptic: 'Apocalipse',
}

/**
 * Cores por secção. Todas escuras o suficiente para texto branco por cima
 * (contraste AA), tanto na grelha do telemóvel como na barra do projetor.
 */
export const SECTION_COLORS: Record<BibleSection, { bg: string; hex: string }> = {
  law:            { bg: 'bg-amber-600',   hex: '#D97706' },
  history:        { bg: 'bg-orange-700',  hex: '#C2410C' },
  poetry:         { bg: 'bg-emerald-700', hex: '#047857' },
  major_prophets: { bg: 'bg-violet-700',  hex: '#6D28D9' },
  minor_prophets: { bg: 'bg-fuchsia-800', hex: '#86198F' },
  gospels:        { bg: 'bg-sky-700',     hex: '#0369A1' },
  acts:           { bg: 'bg-cyan-700',    hex: '#0E7490' },
  pauline:        { bg: 'bg-blue-800',    hex: '#1E40AF' },
  general:        { bg: 'bg-indigo-800',  hex: '#3730A3' },
  apocalyptic:    { bg: 'bg-rose-800',    hex: '#9F1239' },
}

/** Capítulos válidos de um livro (1 se o livro não existir, para nunca partir a UI). */
export function chaptersOf(bookId: number): number {
  return getBook(bookId)?.chapters ?? 1
}

/** true se `chapter` existe mesmo em `bookId`. Validação das server actions. */
export function isValidChapter(bookId: number, chapter: number): boolean {
  const book = getBook(bookId)
  if (!book) return false
  return Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters
}
