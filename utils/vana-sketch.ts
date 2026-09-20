// Utilitários do VanaSketch (Pictionary/Gartic)

// ── Lista de palavras de emergência ──────────────────────────
// Usada apenas se o dicionário Vantur (vantur_dictionary) estiver vazio.
// Palavras bíblicas/clube fáceis de desenhar.
export const FALLBACK_WORDS = [
  'Arca', 'Cruz', 'Pomba', 'Cordeiro', 'Estrela', 'Coroa', 'Templo', 'Altar',
  'Serpente', 'Baleia', 'Leão', 'Águia', 'Pão', 'Peixe', 'Barco', 'Rede',
  'Espada', 'Escudo', 'Harpa', 'Trombeta', 'Poço', 'Monte', 'Deserto', 'Rio',
  'Videira', 'Oliveira', 'Trigo', 'Maná', 'Fogueira', 'Tenda', 'Bússola',
  'Mochila', 'Lenço', 'Apito', 'Corda', 'Lanterna', 'Anjo', 'Pastor', 'Ovelha',
  'Camelo', 'Burro', 'Jumento', 'Arco-íris', 'Nuvem', 'Relâmpago', 'Moeda',
  'Lâmpada', 'Azeite', 'Uvas', 'Figueira',
]

// ── Máscara da palavra ("Arca" → "_ _ _ _") ──────────────────
// Espaços e hífens ficam visíveis para dar a estrutura da palavra.
export function maskWord(word: string): string {
  return word
    .split('')
    .map((ch) => (ch === ' ' ? ' ' : ch === '-' ? '-' : '_'))
    .join(' ')
}

// ── Pontuação ────────────────────────────────────────────────
// Palpiteiro: 50 base + até 100 conforme o tempo restante.
export function guesserPoints(msLeft: number, totalSeconds: number): number {
  const frac = Math.max(0, Math.min(1, msLeft / (totalSeconds * 1000)))
  return 50 + Math.round(100 * frac)
}

// Desenhador: 30 pontos por cada jogador que acertou.
export const DRAWER_POINTS_PER_GUESS = 30

// ── Rotação de desenhadores ──────────────────────────────────
// draw_order é atribuído no arranque (baralhado); a ronda N é desenhada por
// order[(N-1) % nJogadores].
export function drawerOrderForRound(
  roundNumber: number,
  orderedPlayerIds: string[],
): string {
  return orderedPlayerIds[(roundNumber - 1) % orderedPlayerIds.length]
}

// ── Cores e tamanhos do pincel ───────────────────────────────
export const BRUSH_COLORS = [
  '#1a1a2e', // tinta (quase preto)
  '#e63946', // vermelho
  '#f77f00', // laranja
  '#fcbf49', // amarelo
  '#2a9d8f', // verde
  '#2563eb', // azul
  '#7c3aed', // roxo
  '#b5838d', // castanho-rosado
  '#ffffff', // branco (borracha sobre fundo branco)
]

export const BRUSH_SIZES = [3, 6, 12, 24]

// Fundo do quadro de desenho (igual em todos os ecrãs para o desenho bater certo)
export const CANVAS_BG = '#fdf6e3'
