// Eventos públicos da agenda da Juventude Adventista (juventudeadventista.pt).
// O site é server-rendered, por isso basta fetch do HTML (com cache/revalidate
// do Next) e extração por regex — sem browser headless nem dependências novas.
//
// A secção alvo (rebentos, tições, ...) é detetada pelo título do evento.
// Regra de segurança: se nenhuma secção for reconhecida, o evento é para todos
// — antes mostrar a mais do que esconder um evento a quem devia vê-lo.

export interface JAEvent {
  id: string // ex.: 'ja-358' (prefixado para nunca colidir com ids internos)
  title: string
  type: string // Local | Regional | Nacional | Internacional
  description: string
  start_at: string // ISO, dia inteiro (a agenda não publica hora)
  location: string | null
  deadline_text: string | null // "Prazo limite de inscrição: ..." se existir
  image_url: string | null
  url: string // página pública do evento no site da JA
  sections: string[] // [] = para todos
  source: 'ja'
}

const JA_BASE = 'https://juventudeadventista.pt'
const REVALIDATE_SECONDS = 6 * 60 * 60

const SECTION_KEYWORDS = ['rebentos', 'ticoes', 'exploradores', 'companheiros', 'embaixadores']

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â',
  eacute: 'é', ecirc: 'ê', iacute: 'í', igrave: 'ì',
  oacute: 'ó', otilde: 'õ', ocirc: 'ô',
  uacute: 'ú', ucirc: 'û', ccedil: 'ç',
  Aacute: 'Á', Agrave: 'À', Atilde: 'Ã', Acirc: 'Â',
  Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í',
  Oacute: 'Ó', Otilde: 'Õ', Ocirc: 'Ô',
  Uacute: 'Ú', Ccedil: 'Ç',
  euro: '€', hellip: '…', ndash: '–', mdash: '—',
  laquo: '«', raquo: '»', ordf: 'ª', ordm: 'º',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match)
}

function stripHtml(html: string): string {
  return decodeEntities(
    html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
  )
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Secções detetadas no título; [] significa "para todos". */
export function detectSections(title: string): string[] {
  const normalized = normalize(title)
  return SECTION_KEYWORDS.filter((section) => normalized.includes(section))
}

export function parseJAAgenda(html: string): JAEvent[] {
  const events: JAEvent[] = []

  for (const chunk of html.split('<div class="event ').slice(1)) {
    const date = chunk.match(/<span class="date">\s*([\d-]+)\s*<\/span>/)?.[1]
    const rawTitle = chunk.match(/<h3 class="title">([\s\S]*?)<\/h3>/)?.[1]
    const rawType = chunk.match(/<h4 class="type">([\s\S]*?)<\/h4>/)?.[1]
    const rawDescription = chunk.match(/<p class="description"[^>]*>([\s\S]*?)<\/p>/)?.[1]
    const jaId = chunk.match(/href="\/agenda\/(\d+)"/)?.[1]
    const image = chunk.match(/<img[^>]*src="([^"]+)"/)?.[1]

    if (!date || !rawTitle || !jaId) continue
    const [day, month, year] = date.split('-').map(Number)
    if (!day || !month || !year) continue

    const title = stripHtml(rawTitle)
    const description = rawDescription ? stripHtml(rawDescription) : ''

    events.push({
      id: `ja-${jaId}`,
      title,
      type: rawType ? stripHtml(rawType) : 'JA',
      description,
      start_at: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`,
      location: description.match(/Local:\s*([^\n]+)/)?.[1]?.trim() ?? null,
      deadline_text:
        description.match(/Prazo limite de inscri[çc][ãa]o:\s*([^\n]+)/i)?.[1]?.trim() ?? null,
      image_url: image ? `${JA_BASE}${image}` : null,
      url: `${JA_BASE}/agenda/${jaId}`,
      sections: detectSections(title),
      source: 'ja',
    })
  }

  return events
}

/** Vai buscar a agenda da JA com cache de 6h. Se o site falhar, devolve []. */
export async function getJAEvents(): Promise<JAEvent[]> {
  try {
    const res = await fetch(`${JA_BASE}/agenda`, {
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return []
    return parseJAAgenda(await res.text())
  } catch {
    // Site da JA em baixo não pode partir o Painel.
    return []
  }
}

/** Filtra eventos JA para a secção de um membro ([] em sections = todos). */
export function filterJAEventsForSection(events: JAEvent[], section: string | null | undefined): JAEvent[] {
  if (!section) return events
  return events.filter((e) => e.sections.length === 0 || e.sections.includes(section))
}
