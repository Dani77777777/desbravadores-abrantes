// =============================================
// VanaCódigo — Códigos de comunicação dos Desbravadores
// Morse, Semáforo, Cifra de César, Números (A1Z26) e Atbash
// =============================================

import { lisbonWeekday } from './day';

export type CodeType = 'morse' | 'semaforo' | 'cesar' | 'numeros' | 'atbash';

// Rotação semanal do código (Domingo → Sábado).
// Morse e Semáforo aparecem duas vezes por serem as especialidades centrais.
export const CODE_BY_WEEKDAY: CodeType[] = [
  'numeros',  // Domingo
  'morse',    // Segunda
  'semaforo', // Terça
  'cesar',    // Quarta
  'morse',    // Quinta
  'atbash',   // Sexta
  'semaforo', // Sábado
];

export const CODE_LABELS: Record<CodeType, string> = {
  morse: 'Código Morse',
  semaforo: 'Semáforo',
  cesar: 'Cifra de César',
  numeros: 'Números (A=1)',
  atbash: 'Alfabeto Invertido',
};

export const CODE_DESCRIPTIONS: Record<CodeType, string> = {
  morse: 'Cada letra é uma sequência de pontos (•) e traços (—).',
  semaforo: 'Cada letra é uma posição das duas bandeiras do sinaleiro.',
  cesar: 'Cada letra foi deslocada 3 posições para a frente no alfabeto (A→D, B→E...). Recua 3 posições para decifrar.',
  numeros: 'Cada letra é a sua posição no alfabeto (A=1, B=2 ... Z=26).',
  atbash: 'O alfabeto foi invertido: A↔Z, B↔Y, C↔X...',
};

export function getCodeTypeForDate(date: Date = new Date()): CodeType {
  return CODE_BY_WEEKDAY[lisbonWeekday(date)];
}

// ---- Morse ----
export const MORSE_MAP: Record<string, string> = {
  A: '·−',    B: '−···',  C: '−·−·',  D: '−··',   E: '·',
  F: '··−·',  G: '−−·',   H: '····',  I: '··',    J: '·−−−',
  K: '−·−',   L: '·−··',  M: '−−',    N: '−·',    O: '−−−',
  P: '·−−·',  Q: '−−·−',  R: '·−·',   S: '···',   T: '−',
  U: '··−',   V: '···−',  W: '·−−',   X: '−··−',  Y: '−·−−',
  Z: '−−··',
};

// ---- Semáforo ----
// Cada braço aponta numa de 8 direções, em passos de 45°.
// Ângulos em graus, no sentido dos ponteiros do relógio, com 0° = para cima
// (perspetiva de quem OLHA para o sinaleiro). Posição de descanso = 180° (baixo).
// Posições 1–7: 1=225°, 2=270°, 3=315°, 4=0°, 5=45°, 6=90°, 7=135°.
const SEMAPHORE_POSITION_ANGLES = [225, 270, 315, 0, 45, 90, 135];

// Tabela padrão do semáforo: cada letra = par de posições (1–7).
// Letras A–G usam um só braço (o outro fica em descanso).
const SEMAPHORE_POSITIONS: Record<string, number[]> = {
  A: [1],    B: [2],    C: [3],    D: [4],    E: [5],    F: [6],    G: [7],
  H: [1, 2], I: [1, 3], K: [1, 4], L: [1, 5], M: [1, 6], N: [1, 7],
  O: [2, 3], P: [2, 4], Q: [2, 5], R: [2, 6], S: [2, 7],
  T: [3, 4], U: [3, 5], Y: [3, 6],
  J: [4, 6], V: [4, 7],
  W: [5, 6], X: [5, 7],
  Z: [6, 7],
};

const REST_ANGLE = 180;

/** Devolve os ângulos [braço1, braço2] das bandeiras para uma letra A–Z. */
export function getSemaphoreAngles(letter: string): [number, number] {
  const positions = SEMAPHORE_POSITIONS[letter.toUpperCase()];
  if (!positions) return [REST_ANGLE, REST_ANGLE];
  const a1 = SEMAPHORE_POSITION_ANGLES[positions[0] - 1];
  const a2 = positions.length > 1 ? SEMAPHORE_POSITION_ANGLES[positions[1] - 1] : REST_ANGLE;
  return [a1, a2];
}

// ---- Cifras alfabéticas ----
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const CAESAR_SHIFT = 3;

export function caesarEncode(letter: string): string {
  const idx = ALPHABET.indexOf(letter.toUpperCase());
  if (idx < 0) return letter;
  return ALPHABET[(idx + CAESAR_SHIFT) % 26];
}

export function atbashEncode(letter: string): string {
  const idx = ALPHABET.indexOf(letter.toUpperCase());
  if (idx < 0) return letter;
  return ALPHABET[25 - idx];
}

export function a1z26Encode(letter: string): string {
  const idx = ALPHABET.indexOf(letter.toUpperCase());
  if (idx < 0) return letter;
  return String(idx + 1);
}

/**
 * Símbolo codificado de uma única letra (para alinhar cada símbolo
 * com a respetiva célula de resposta). Para semáforo devolve a própria
 * letra — o componente SemaphoreChar desenha-a como bandeiras.
 */
export function encodeLetter(letter: string, codeType: CodeType): string {
  const upper = letter.toUpperCase();
  switch (codeType) {
    case 'morse':    return MORSE_MAP[upper] ?? '?';
    case 'cesar':    return caesarEncode(upper);
    case 'numeros':  return a1z26Encode(upper);
    case 'atbash':   return atbashEncode(upper);
    case 'semaforo': return upper;
  }
}
