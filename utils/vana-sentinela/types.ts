// VanaSentinela — Verdade ou Distorção?
// Tipos das cartas e dos packs (um pack por cidade/pregação).
// Os nomes dos campos seguem os ficheiros JSON dos packs, que estão em português.

export type Dificuldade = 1 | 2 | 3

export type Carta = {
  /** Prefixo da cidade + número, ex.: "abr-01" (evita colisões num futuro modo com todos os packs). */
  id: string
  /** O que aparece na carta (máx. ~160 caracteres). */
  afirmacao: string
  /** true = VERDADE, false = DISTORÇÃO. */
  verdade: boolean
  /** Mostrada depois de responder (1–2 frases). */
  explicacao: string
  /** Trecho do que o pregador disse (português do Brasil, de propósito). */
  citacao?: string
  /** Texto bíblico relacionado, ex.: "Hebreus 4:16". */
  referencia?: string
  /** Momento no vídeo, "h:mm:ss". */
  minuto?: string
  dificuldade: Dificuldade
}

export type Pack = {
  slug: string
  cidade: string
  titulo: string
  orador: string
  /** Mostrada no ecrã final. */
  fraseChave: string
  /** Se existir, os minutos das cartas passam a ser links (?t=segundos). */
  videoUrl?: string
  disponivel: boolean
  cartas: Carta[]
}
