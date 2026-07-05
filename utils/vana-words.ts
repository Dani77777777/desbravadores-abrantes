import type { WordTeam } from '@/types/vana-words'

// ── Lista de palavras (banco com ≥ 100 entradas) ─────────────
export const WORD_LIST = [
  // Fé & Igreja
  'Fé', 'Graça', 'Cruz', 'Paz', 'Luz', 'Amor', 'Bíblia', 'Oração', 'Igreja', 'Baptismo',
  'Servo', 'Rei', 'Profeta', 'Anjo', 'Templo', 'Altar', 'Nuvem', 'Fogo', 'Arca', 'Maná',
  'Sal', 'Pão', 'Vinho', 'Azeite', 'Cordeiro', 'Pomba', 'Graça', 'Milagre', 'Promessa', 'Aliança',
  // Natureza
  'Montanha', 'Rio', 'Floresta', 'Vento', 'Sol', 'Lua', 'Estrela', 'Céu', 'Mar', 'Deserto',
  'Jardim', 'Árvore', 'Fruto', 'Vinha', 'Palma', 'Cedro', 'Trigo', 'Rosa', 'Lírio', 'Rocha',
  'Lago', 'Fonte', 'Poço', 'Brisa', 'Pinheiro', 'Carvalho', 'Oliveira', 'Areia', 'Gelo', 'Chuva',
  // Escutismo
  'Mochila', 'Bússola', 'Corda', 'Nó', 'Tenda', 'Fogueira', 'Trilho', 'Mapa', 'Cantil',
  'Apito', 'Distintivo', 'Lenço', 'Bastão', 'Patrulha', 'Lanterna', 'Faca', 'Bota', 'Sinal',
  // Animais
  'Águia', 'Leão', 'Cavalo', 'Serpente', 'Lobo', 'Raposa', 'Tartaruga', 'Golfinho', 'Pombo',
  'Falcão', 'Abelha', 'Lebre', 'Urso', 'Cegonha', 'Borboleta', 'Corvo', 'Cervo', 'Baleia',
  // Objetos & Conceitos
  'Chave', 'Porta', 'Espada', 'Escudo', 'Coroa', 'Harpa', 'Trompa', 'Farol', 'Âncora',
  'Barco', 'Vela', 'Cofre', 'Tesouro', 'Caminho', 'Ponte', 'Torre', 'Muro', 'Flecha', 'Arco',
  // Valores
  'Bondade', 'Coragem', 'Honra', 'Lealdade', 'Humildade', 'Verdade', 'Justiça', 'Esperança',
  'Alegria', 'Força', 'Sabedoria', 'Misericórdia', 'Perdão', 'Gratidão', 'Silêncio',
]

// Remove duplicates that snuck in
const UNIQUE_WORDS = [...new Set(WORD_LIST)]

// ── Nomes curtos sem ambiguidade ─────────────────────────────
// Primeiro nome de cada jogador; se houver outro jogador na sessão (qualquer
// equipa) com o mesmo primeiro nome, usa "Primeiro Último" para os distinguir.
export function shortDisplayNames(
  players: { id: string; display_name: string }[],
): Map<string, string> {
  const firstNameCount = new Map<string, number>()
  for (const p of players) {
    const first = p.display_name.trim().split(/\s+/)[0]?.toLocaleLowerCase('pt-PT') ?? ''
    firstNameCount.set(first, (firstNameCount.get(first) ?? 0) + 1)
  }
  const result = new Map<string, string>()
  for (const p of players) {
    const parts = p.display_name.trim().split(/\s+/)
    const first = parts[0] ?? ''
    const duplicated = (firstNameCount.get(first.toLocaleLowerCase('pt-PT')) ?? 0) > 1
    result.set(p.id, duplicated && parts.length > 1 ? `${first} ${parts[parts.length - 1]}` : first)
  }
  return result
}

// ── Geração da grelha 5×5 ────────────────────────────────────
export interface WordAssignment {
  word: string
  team: WordTeam
  grid_pos: number
}

// wordPool: lista de palavras a usar; se omitida, usa WORD_LIST de fallback
export function generateWordGrid(wordPool?: string[]): WordAssignment[] {
  const pool = wordPool && wordPool.length >= 25 ? wordPool : UNIQUE_WORDS
  const shuffledWords = [...pool].sort(() => Math.random() - 0.5).slice(0, 25)

  const teams: WordTeam[] = [
    'a', 'a', 'a', 'a', 'a',
    'b', 'b', 'b', 'b', 'b',
    'black',
    ...Array<WordTeam>(14).fill('neutral'),
  ]
  const shuffledTeams = teams.sort(() => Math.random() - 0.5)

  return shuffledWords.map((word, i) => ({
    word,
    team: shuffledTeams[i],
    grid_pos: i,
  }))
}

// ── Algoritmo de distribuição de equipas ─────────────────────
export interface PlayerForTeam {
  id: string
  user_id: string | null
  display_name: string
  section: string | null
}

function sectionPenalty(players: PlayerForTeam[]): number {
  const counts: Record<string, number> = {}
  for (const p of players) {
    if (p.section) counts[p.section] = (counts[p.section] ?? 0) + 1
  }
  return Object.values(counts).reduce((sum, c) => sum + Math.max(0, c - 1), 0)
}

function scoreTeamSplit(teamA: PlayerForTeam[], teamB: PlayerForTeam[]): number {
  let score = 0
  score -= sectionPenalty(teamA) * 2
  score -= sectionPenalty(teamB) * 2
  // Penalize unbalanced sizes
  score -= Math.abs(teamA.length - teamB.length) * 3
  return score
}

export function proposeTeams(
  players: PlayerForTeam[],
): { teamA: PlayerForTeam[]; teamB: PlayerForTeam[] } {
  if (players.length < 2) {
    return { teamA: players, teamB: [] }
  }

  const half = Math.ceil(players.length / 2)
  let best: { teamA: PlayerForTeam[]; teamB: PlayerForTeam[] } | null = null
  let bestScore = -Infinity

  // Try 30 random splits, pick highest score
  for (let attempt = 0; attempt < 30; attempt++) {
    const shuffled = [...players].sort(() => Math.random() - 0.5)
    const teamA = shuffled.slice(0, half)
    const teamB = shuffled.slice(half)
    const score = scoreTeamSplit(teamA, teamB)
    if (score > bestScore) {
      bestScore = score
      best = { teamA, teamB }
    }
  }

  return best!
}

// ── Algoritmo de seleção de Arauto ───────────────────────────
interface RecentArautoRecord {
  user_id: string
  last_at: string // ISO date
}

export function selectArauto(
  teamPlayers: PlayerForTeam[],
  recentArautos: RecentArautoRecord[],
): PlayerForTeam {
  const recentMap = new Map(recentArautos.map((r) => [r.user_id, new Date(r.last_at).getTime()]))

  const weights = teamPlayers.map((p) => {
    if (!p.user_id) return 1 // bots: igual peso
    const lastTs = recentMap.get(p.user_id)
    if (!lastTs) return 200 // nunca foi Arauto: peso muito alto
    const daysSince = (Date.now() - lastTs) / 86_400_000
    return Math.max(1, daysSince)
  })

  const total = weights.reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (let i = 0; i < teamPlayers.length; i++) {
    rand -= weights[i]
    if (rand <= 0) return teamPlayers[i]
  }
  return teamPlayers[teamPlayers.length - 1]
}

// Geração de código de sessão único (4 caracteres, sem 0/O nem 1/I ambíguos)
export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
