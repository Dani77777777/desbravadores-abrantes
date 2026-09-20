/**
 * VanaTrilha — A Rota da Promessa.
 * Desafio bíblico diário, singleplayer (estilo VANTUR).
 *
 * Convenção: campos em snake_case quando espelham colunas do Supabase.
 */

export type VanaTrilhaCategory = 'personagens' | 'lugares' | 'numeros' | 'milagres' | 'versiculos'
export type VanaTrilhaDifficulty = 'facil' | 'media' | 'dificil'
export type VanaTrilhaRunStatus = 'playing' | 'completed' | 'failed'
/** Casas do Modo Diário: só as "suaves" (no máximo uma especial por etapa). */
export type VanaTrilhaTile = 'normal' | 'milagre' | 'tabuas' | 'elim'

export interface VanaTrilhaStation {
  id: number            // 1..7
  name: string          // "Mar Vermelho"
  subtitle: string      // "A travessia"
  reference: string     // "Êxodo 14"
  color: VanaTrilhaStationColor
  verse: string         // citação curta mostrada ao entrar na estação
  verse_reference: string
}

export type VanaTrilhaStationColor = 'stone' | 'blue' | 'amber' | 'violet' | 'orange' | 'teal' | 'yellow'

/** Pergunta tal como chega ao CLIENTE — sem correct_index nem explicação. */
export interface VanaTrilhaQuestionPublic {
  id: string
  station: number
  category: VanaTrilhaCategory
  difficulty: VanaTrilhaDifficulty
  prompt: string
  options: string[]     // sempre 4
}

/**
 * Pergunta bónus das Tábuas da Lei (Verdadeiro/Falso).
 * Mostra uma pergunta do banco com UMA resposta proposta: está certa ou não?
 * Opção 0 = Verdadeiro, 1 = Falso.
 */
export interface VanaTrilhaBonusPublic {
  id: string
  category: VanaTrilhaCategory
  prompt: string
  proposed_answer: string
}

export type VanaTrilhaStep =
  | { kind: 'question'; question: VanaTrilhaQuestionPublic }
  | { kind: 'bonus'; bonus: VanaTrilhaBonusPublic }

/** Estado público da corrida (nunca inclui ids de perguntas futuras nem respostas). */
export interface VanaTrilhaDailyRun {
  id: string
  user_id: string
  run_date: string
  station: number
  current_index: number   // casa a conquistar (0..8)
  position: number        // casa onde está o peão (0..8)
  lives: number
  correct_count: number
  mistakes: number
  turn: number            // n.º de respostas já submetidas (inclui bónus)
  bonus_gold: number
  immune_next_error: boolean
  status: VanaTrilhaRunStatus
  rewards_awarded: boolean
  started_at: string
  finished_at: string | null
  /** Histórico resumido para o tabuleiro/partilha: uma entrada por resposta. */
  history: VanaTrilhaHistoryEntry[]
}

export interface VanaTrilhaHistoryEntry {
  kind: 'question' | 'bonus'
  correct: boolean
  protected?: boolean     // errou mas estava na Fonte de Elim
}

export interface VanaTrilhaRewards {
  xp: number
  gold: number
  perfect: boolean
  bonus_gold: number
}

/** Resultado de uma resposta, devolvido pela server action. */
export interface VanaTrilhaAnswerResult {
  kind: 'question' | 'bonus'
  correct: boolean
  correct_index: number          // em bónus: 0 = Verdadeiro, 1 = Falso
  correct_answer: string         // texto da resposta certa
  explanation: string
  reference: string | null
  life_lost: boolean
  protected_by_elim: boolean
  run: VanaTrilhaDailyRun
  tile: VanaTrilhaTile           // casa onde o peão ficou (efeito ativado agora, se ≠ normal)
  tile_triggered: boolean        // o peão acabou de parar numa casa especial
  next_step: VanaTrilhaStep | null
  rewards: VanaTrilhaRewards | null
}

/** Pergunta completa — só para o painel de gestão (dirigentes/coordenadores). */
export interface VanaTrilhaQuestionAdmin extends VanaTrilhaQuestionPublic {
  correct_index: number
  reference: string | null
  explanation: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VanaTrilhaQuestionInput {
  station: number
  category: VanaTrilhaCategory
  difficulty: VanaTrilhaDifficulty
  prompt: string
  options: string[]
  correct_index: number
  reference: string | null
  explanation: string
  is_active?: boolean
}

export interface VanaTrilhaTodayStats {
  run_date: string
  station: number
  total: number
  playing: number
  completed: number
  failed: number
  perfect: number
}

export const VANATRILHA_DAILY_LENGTH = 8
export const VANATRILHA_DAILY_LIVES = 3
export const VANATRILHA_MILAGRE_GOLD = 2
export const VANATRILHA_TABUAS_STEPS = 1
export const VANATRILHA_REWARD_XP = 2
export const VANATRILHA_REWARD_GOLD = 2
export const VANATRILHA_PERFECT_BONUS_XP = 1
export const VANATRILHA_PERFECT_BONUS_GOLD = 1
export const VANATRILHA_BADGE_NAME = 'Peregrino da Promessa'

export const VANATRILHA_STATIONS: VanaTrilhaStation[] = [
  {
    id: 1,
    name: 'Egito',
    subtitle: 'Casa de Escravidão',
    reference: 'Êxodo 1–12',
    color: 'stone',
    verse: 'Eu sou o Senhor, e vos tirarei de debaixo das cargas dos egípcios.',
    verse_reference: 'Êxodo 6:6',
  },
  {
    id: 2,
    name: 'Mar Vermelho',
    subtitle: 'A travessia',
    reference: 'Êxodo 14–15',
    color: 'blue',
    verse: 'O Senhor pelejará por vós, e vós vos calareis.',
    verse_reference: 'Êxodo 14:14',
  },
  {
    id: 3,
    name: 'Deserto de Sin',
    subtitle: 'Pão do céu',
    reference: 'Êxodo 16–17',
    color: 'amber',
    verse: 'Eis que vos farei chover pão dos céus.',
    verse_reference: 'Êxodo 16:4',
  },
  {
    id: 4,
    name: 'Monte Sinai',
    subtitle: 'A Lei de Deus',
    reference: 'Êxodo 19–20',
    color: 'violet',
    verse: 'Eu sou o Senhor, teu Deus, que te tirei da terra do Egito.',
    verse_reference: 'Êxodo 20:2',
  },
  {
    id: 5,
    name: 'Cades-Barneia',
    subtitle: 'Os doze espias',
    reference: 'Números 13–14',
    color: 'orange',
    verse: 'Subamos animosamente e possuamo-la em herança; porque certamente prevaleceremos contra ela.',
    verse_reference: 'Números 13:30',
  },
  {
    id: 6,
    name: 'Rio Jordão',
    subtitle: 'As águas param',
    reference: 'Josué 3–4',
    color: 'teal',
    verse: 'Santificai-vos, porque amanhã fará o Senhor maravilhas no meio de vós.',
    verse_reference: 'Josué 3:5',
  },
  {
    id: 7,
    name: 'Terra Prometida',
    subtitle: 'Canaã',
    reference: 'Josué 1–6',
    color: 'yellow',
    verse: 'Sê forte e corajoso; não temas, nem te espantes, porque o Senhor, teu Deus, é contigo.',
    verse_reference: 'Josué 1:9',
  },
]

export function getStation(id: number): VanaTrilhaStation {
  return VANATRILHA_STATIONS.find((s) => s.id === id) ?? VANATRILHA_STATIONS[0]
}
