import type { ComponentType, CSSProperties, ReactNode } from 'react'

/**
 * Sons do VanaQuest. Cada tema pode trocar qualquer um; o que um tema não define
 * (ou não carrega) toca o do tema "normal".
 */
export type VanaQuestSoundKey =
  | 'lobby' // sala de espera + intro do quiz (loop)
  | 'thinkFast' // intro da pergunta + pergunta ativa (loop)
  | 'standings' // classificação entre perguntas (loop)
  | 'podiumIntro' // pódio final (sem loop) → passa para 'victory'
  | 'victory' // depois do podiumIntro (loop)
  | 'answered' // SFX: alguém respondeu
  | 'lightning' // SFX: aviso ×2/×3
  | 'earning' // SFX: pontos a subir na classificação
  | 'end' // SFX: fim do tempo da pergunta

/** Onde o tema está a ser mostrado. */
export type VanaQuestSurface = 'projector' | 'phone'

/** Celebração do pódio final (por omissão: confetti colorido). */
export interface PodiumCelebration {
  /** Cores da explosão do vencedor e dos canhões contínuos. */
  colors: string[]
  /** Formas nativas do canvas-confetti. */
  shapes?: Array<'square' | 'circle' | 'star'>
  /** Emojis/caracteres usados como partículas (ex.: '❄'). */
  textShapes?: string[]
  /** Tamanho das partículas (1 = normal). */
  scalar?: number
}

export interface VanaQuestTheme {
  /** Identificador gravado em vana_quests.theme — só [a-z0-9-], até 30 caracteres. */
  id: string
  name: string
  emoji: string
  description: string

  /** Cartão do seletor de tema no admin. */
  preview: {
    /** Fundo do cartão (CSS `background`). */
    background: string
    /** Bolinhas com as cores principais. */
    swatches: string[]
  }

  /**
   * "Pele" do tema: variáveis CSS (`--vq-*`) aplicadas a todo o jogo pelo
   * VanaQuestThemeScope. Sem `skin`, o jogo fica EXATAMENTE como o original
   * (nem sequer se acrescenta um elemento à página).
   * As regras que usam estas variáveis estão em themes.css.
   */
  skin?: CSSProperties & Record<`--vq-${string}` | `--color-${string}`, string>

  /** Camadas animadas por trás do conteúdo (neve, luzinhas, estrelas...). */
  Backdrop?: ComponentType<{ surface: VanaQuestSurface }>

  /** Enfeite junto ao nome do quiz (ex.: gorro de Natal). */
  titleOrnament?: ReactNode

  /** Pódio final do projetor. */
  podium?: {
    /** Classe do anel dos avatares, da cor do fundo (ex.: 'ring-offset-[#4a0812]'). */
    ringOffsetClassName: string
    celebration?: PodiumCelebration
  }

  /** Imagem do pódio para partilhar (PodiumShareCard). */
  shareCard?: {
    background: string
    accent: string
    titleEmoji: string
    /** Cor de fundo usada pelo html-to-image fora do cartão. */
    captureBackground: string
  }

  /** Ficheiros em public/sounds/VanaQuest - soundboard/. */
  sounds: Partial<Record<VanaQuestSoundKey, string>>
}
