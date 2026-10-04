// VanaSentinela — regras do jogo (lógica pura, sem React nem Supabase).
// Usada pelo jogo no browser, pela rota da API que grava pontuações e pelos testes.
//
// O sorteio recebe uma LISTA de cartas, não um pack: assim o futuro modo
// "Maratona" (cartas de todos os packs) só precisa de juntar as listas.

import type { Carta } from './types'

export const GAME_ID = 'vana-sentinela'
export const CARTAS_POR_RONDA = 15
export const TEMPO_CARTA_MS = 8000
export const PONTOS_BASE = 100
export const BONUS_RAPIDEZ_MAX = 50
/** Ninguém lê uma carta em menos disto (validação do servidor). */
export const TEMPO_MINIMO_POR_CARTA_MS = 600
/** Cartas do início só de dificuldade 1–2; as difíceis ficam nas últimas. */
export const CARTAS_FACEIS_NO_INICIO = 5
export const CARTAS_NO_FIM_COM_DIFICEIS = 5

export type Rng = () => number

function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function semRepetidas(cartas: readonly Carta[]): Carta[] {
  const vistas = new Set<string>()
  return cartas.filter((c) => (vistas.has(c.id) ? false : (vistas.add(c.id), true)))
}

/**
 * Sorteia as cartas de uma ronda:
 *  • sem repetições;
 *  • metade verdades, metade distorções (em 15: 7 ou 8 verdades, ao calhas);
 *  • 1 a 3 cartas de dificuldade 3, sempre nas últimas 5;
 *  • as restantes vão (mais ou menos) das fáceis para as médias.
 */
export function sortearRonda(
  cartas: readonly Carta[],
  { n = CARTAS_POR_RONDA, rng = Math.random }: { n?: number; rng?: Rng } = {},
): Carta[] {
  const unicas = semRepetidas(cartas)
  const total = Math.min(n, unicas.length)
  if (total === 0) return []

  const verdades = shuffle(unicas.filter((c) => c.verdade), rng)
  const distorcoes = shuffle(unicas.filter((c) => !c.verdade), rng)

  // Quantas verdades: metade, arredondada para um lado ou para o outro.
  let quantasVerdades = rng() < 0.5 ? Math.floor(total / 2) : Math.ceil(total / 2)
  quantasVerdades = Math.max(total - distorcoes.length, Math.min(verdades.length, quantasVerdades))
  const falta = { verdade: quantasVerdades, distorcao: total - quantasVerdades }
  const lado = (c: Carta): keyof typeof falta => (c.verdade ? 'verdade' : 'distorcao')

  const escolhidas: Carta[] = []
  const tirar = (c: Carta) => {
    if (falta[lado(c)] <= 0) return false
    falta[lado(c)]--
    escolhidas.push(c)
    return true
  }

  // 1. As difíceis primeiro (1 a 3, se o pack as tiver).
  const dificeis = shuffle([...verdades, ...distorcoes].filter((c) => c.dificuldade === 3), rng)
  const alvoDificeis = Math.min(1 + Math.floor(rng() * 3), CARTAS_NO_FIM_COM_DIFICEIS, total)
  for (const c of dificeis) {
    if (escolhidas.length >= alvoDificeis) break
    tirar(c)
  }
  // 2. O resto com fáceis e médias.
  for (const c of [...verdades, ...distorcoes]) if (c.dificuldade !== 3 && !escolhidas.includes(c)) tirar(c)
  // 3. Pack pequeno: completar com as difíceis que sobrarem.
  for (const c of dificeis) if (!escolhidas.includes(c)) tirar(c)

  // Ordem: fáceis → médias (com alguma mistura), e as difíceis espalhadas pelas últimas 5.
  const peso = new Map(escolhidas.map((c) => [c.id, c.dificuldade + rng() * 1.5]))
  const normais = escolhidas.filter((c) => c.dificuldade !== 3).sort((a, b) => peso.get(a.id)! - peso.get(b.id)!)
  const difs = escolhidas.filter((c) => c.dificuldade === 3)
  const tamanhoCauda = Math.min(total, Math.max(CARTAS_NO_FIM_COM_DIFICEIS, difs.length))
  const corte = total - tamanhoCauda
  return [...normais.slice(0, corte), ...shuffle([...normais.slice(corte), ...difs], rng)]
}

// ── Pontuação ───────────────────────────────────────────────────────────────

/** Multiplicador para a PRÓXIMA carta, conforme os acertos seguidos que já leva. */
export function multiplicadorCombo(combo: number): 1 | 2 | 3 | 4 {
  if (combo >= 10) return 4
  if (combo >= 6) return 3
  if (combo >= 3) return 2
  return 1
}

/** Até +50, linear com o tempo que sobra. */
export function bonusRapidez(restanteMs: number): number {
  const r = Math.max(0, Math.min(TEMPO_CARTA_MS, restanteMs))
  return Math.round((BONUS_RAPIDEZ_MAX * r) / TEMPO_CARTA_MS)
}

/** Pontos de um acerto, com `combo` = acertos seguidos ANTES desta carta. */
export function pontosAcerto(restanteMs: number, combo: number): number {
  return (PONTOS_BASE + bonusRapidez(restanteMs)) * multiplicadorCombo(combo)
}

/** Pontos de uma sequência de `n` acertos seguidos, todos instantâneos. */
function pontosSequencia(n: number): number {
  let soma = 0
  for (let i = 0; i < n; i++) soma += (PONTOS_BASE + BONUS_RAPIDEZ_MAX) * multiplicadorCombo(i)
  return soma
}

/** Pontuação máxima teórica de uma ronda de `n` cartas (tudo certo e instantâneo). */
export function pontuacaoMaxima(n: number): number {
  return pontosSequencia(Math.max(0, n))
}

/**
 * Máximo possível com `acertos` certas, maior combo `comboMax`, em `total` cartas.
 * null quando a combinação é impossível (ex.: combo maior que os acertos).
 *
 * Os pontos de uma sequência crescem cada vez mais depressa, por isso o melhor
 * caso é ter o maior número possível de sequências do tamanho do combo máximo.
 */
export function pontosMaximosPara(acertos: number, comboMax: number, total: number): number | null {
  if (![acertos, comboMax, total].every(Number.isInteger)) return null
  if (total < 1 || acertos < 0 || acertos > total) return null
  if (acertos === 0) return comboMax === 0 ? 0 : null
  if (comboMax < 1 || comboMax > acertos) return null

  const sequenciasCheias = Math.floor(acertos / comboMax)
  const resto = acertos % comboMax
  const sequencias = sequenciasCheias + (resto > 0 ? 1 : 0)
  // Entre duas sequências tem de haver pelo menos um erro.
  const erros = total - acertos
  if (sequencias > erros + 1) return null

  return sequenciasCheias * pontosSequencia(comboMax) + pontosSequencia(resto)
}

// ── Estado da ronda ─────────────────────────────────────────────────────────

/** 'tempo' = o tempo acabou sem resposta (conta como errada). */
export type Resposta = 'verdade' | 'distorcao' | 'tempo'

export type Jogada = {
  carta: Carta
  resposta: Resposta
  certa: boolean
  pontos: number
  /** Multiplicador que estava ativo nesta carta. */
  multiplicador: number
  tempoMs: number
}

export type EstadoRonda = {
  pontos: number
  /** Acertos seguidos neste momento. */
  combo: number
  comboMax: number
  acertos: number
  /** Soma do tempo a responder (não conta o tempo a ler o feedback). */
  duracaoMs: number
  jogadas: Jogada[]
}

export const ESTADO_INICIAL: EstadoRonda = { pontos: 0, combo: 0, comboMax: 0, acertos: 0, duracaoMs: 0, jogadas: [] }

export function respostaCerta(carta: Carta, resposta: Resposta): boolean {
  if (resposta === 'tempo') return false
  return carta.verdade === (resposta === 'verdade')
}

/** Aplica uma resposta (ou o tempo esgotado) ao estado da ronda. */
export function responder(estado: EstadoRonda, carta: Carta, resposta: Resposta, tempoMs: number): EstadoRonda {
  const tempo = resposta === 'tempo' ? TEMPO_CARTA_MS : Math.max(0, Math.min(TEMPO_CARTA_MS, Math.round(tempoMs)))
  const certa = respostaCerta(carta, resposta)
  const multiplicador = multiplicadorCombo(estado.combo)
  const pontos = certa ? pontosAcerto(TEMPO_CARTA_MS - tempo, estado.combo) : 0
  const combo = certa ? estado.combo + 1 : 0
  return {
    pontos: estado.pontos + pontos,
    combo,
    comboMax: Math.max(estado.comboMax, combo),
    acertos: estado.acertos + (certa ? 1 : 0),
    duracaoMs: estado.duracaoMs + tempo,
    jogadas: [...estado.jogadas, { carta, resposta, certa, pontos, multiplicador, tempoMs: tempo }],
  }
}

// ── Ecrã final ──────────────────────────────────────────────────────────────

export type Classificacao = { titulo: string; emoji: string }

/** Classificação divertida pela percentagem de acertos. */
export function classificacao(acertos: number, total: number): Classificacao {
  const pct = total > 0 ? (acertos / total) * 100 : 0
  if (pct <= 40) return { titulo: 'Ouvinte distraído', emoji: '😴' }
  if (pct <= 70) return { titulo: 'Ouvinte atento', emoji: '👂' }
  if (pct <= 90) return { titulo: 'Guardião da Mensagem', emoji: '🛡️' }
  return { titulo: 'Sentinela do Santuário', emoji: '🔥' }
}

/** "0:23:15" → 1395. null se o formato não for válido. */
export function minutoParaSegundos(minuto: string | undefined): number | null {
  if (!minuto) return null
  const partes = minuto.trim().split(':').map(Number)
  if (partes.length < 2 || partes.length > 3 || partes.some((p) => !Number.isInteger(p) || p < 0)) return null
  return partes.reduce((acc, p) => acc * 60 + p, 0)
}

/** Link para o vídeo naquele minuto (?t=segundos), ou null se não houver vídeo. */
export function linkMinuto(videoUrl: string | undefined, minuto: string | undefined): string | null {
  const segundos = minutoParaSegundos(minuto)
  if (!videoUrl || segundos === null) return null
  try {
    const url = new URL(videoUrl)
    url.searchParams.set('t', String(segundos))
    return url.toString()
  } catch {
    return null
  }
}

/** "1:05" ou "48,3 s". */
export function formatarDuracao(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`
  const min = Math.floor(s / 60)
  return `${min}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function formatarPontos(pontos: number): string {
  return pontos.toLocaleString('pt-PT')
}

// ── Pontuações enviadas pelo cliente ────────────────────────────────────────

export type PontuacaoEnviada = {
  pack: string
  pontos: number
  acertos: number
  total: number
  comboMax: number
  duracaoMs: number
}

/**
 * Verifica se uma pontuação é possível. Não é anti-batota a sério (quem tem
 * sessão consegue forjar pedidos), mas trava o óbvio. Devolve o motivo ou null.
 */
export function motivoPontuacaoImpossivel(p: PontuacaoEnviada): string | null {
  if (p.total !== CARTAS_POR_RONDA) return 'Número de cartas inválido.'
  if (p.pontos < 0 || !Number.isInteger(p.pontos)) return 'Pontos inválidos.'
  if (p.pontos > pontuacaoMaxima(p.total)) return 'Pontuação acima do máximo possível.'
  const maximo = pontosMaximosPara(p.acertos, p.comboMax, p.total)
  if (maximo === null) return 'Acertos e combo não batem certo.'
  if (p.pontos > maximo) return 'Pontuação impossível para esses acertos e combo.'
  if (p.acertos > 0 && p.pontos < p.acertos * PONTOS_BASE) return 'Pontuação abaixo do mínimo para esses acertos.'
  if (p.duracaoMs < p.total * TEMPO_MINIMO_POR_CARTA_MS) return 'Ronda demasiado rápida.'
  if (p.duracaoMs > p.total * TEMPO_CARTA_MS) return 'Duração inválida.'
  return null
}

// ── Recorde local (visitantes) e preferências ───────────────────────────────

export const recordeLocalKey = (pack: string) => `vana-sentinela:recorde:${pack}`
export const SOM_KEY = 'vana-sentinela:som'
