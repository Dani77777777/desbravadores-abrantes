// =============================================
// VanaCódigo — Banco de mensagens secretas
// O desafio é o MESMO para todos no mesmo dia (escolha determinística
// a partir da data), para o clube poder comparar resultados.
// Apenas letras A–Z e espaços (sem acentos) — a resposta é escrita
// num teclado sem acentos.
// =============================================

import { lisbonDateParts } from './day';

export type VanaCodigoMode = 'recruta' | 'explorador' | 'mestre';

// Recruta: palavras curtas (4–6 letras)
const CURTAS = [
  'TENDA', 'CORDA', 'TRILHO', 'FLECHA', 'CANOA', 'LENHA', 'FOGO',
  'MAPA', 'NORTE', 'SINAL', 'FAROL', 'VIGIA', 'CAMPO', 'MASTRO',
  'PISTA', 'MARCHA', 'ROCHA', 'MONTE', 'RIACHO', 'JONAS', 'MOISES',
  'ARCA', 'MANA', 'REMO', 'TROPA', 'GUIA', 'NOS', 'FISGA', 'BREJO',
  'CANTIL', 'ALERTA',
];

// Explorador: palavras longas (7–11 letras)
const LONGAS = [
  'BUSSOLA', 'FOGUEIRA', 'EXPLORADOR', 'AVENTURA', 'MENSAGEM',
  'SEMAFORO', 'ESTRELA', 'LANTERNA', 'CANIVETE', 'MOCHILA',
  'CONQUISTA', 'NATUREZA', 'AMIZADE', 'PIONEIRO', 'LIDERANCA',
  'DESBRAVADOR', 'ACAMPAMENTO', 'ORIENTACAO', 'MACHADINHA',
  'BANDEIRA', 'CARAVANA', 'HORIZONTE', 'MONTANHA', 'TRAVESSIA',
  'MARANATA', 'CORAGEM', 'DISCIPLINA', 'UNIFORME', 'FLORESTA',
  'CAMINHADA',
];

// Mestre: frases curtas (2–3 palavras)
const FRASES = [
  'SEMPRE ALERTA', 'DEUS E AMOR', 'SEMPRE FIEL', 'LUZ DO MUNDO',
  'SAL DA TERRA', 'CRISTO VIVE', 'ELE VOLTARA', 'RUMO AO NORTE',
  'ACENDE O FOGO', 'ARMA A TENDA', 'SEGUE O TRILHO', 'FE E CORAGEM',
  'MARANATA VEM', 'BOA CAMINHADA', 'SOBE AO MONTE', 'LE O MAPA',
  'SALVA VIDAS', 'AJUDA O OUTRO', 'OLHA AS ESTRELAS', 'GUARDA O POSTO',
];

const POOLS: Record<VanaCodigoMode, string[]> = {
  recruta: CURTAS,
  explorador: LONGAS,
  mestre: FRASES,
};

const MODE_SALT: Record<VanaCodigoMode, number> = {
  recruta: 17,
  explorador: 53,
  mestre: 97,
};

// PRNG simples e determinístico (mulberry32) — chega para escolher a palavra do dia
function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Mensagem secreta do dia para um modo — igual para todos os jogadores. */
export function getDailySecret(mode: VanaCodigoMode, date: Date = new Date()): string {
  const pool = POOLS[mode];
  const { year, month, day } = lisbonDateParts(date);
  const daySeed = year * 10000 + month * 100 + day;
  const rnd = mulberry32(daySeed * 131 + MODE_SALT[mode]);
  return pool[Math.floor(rnd * pool.length)];
}
