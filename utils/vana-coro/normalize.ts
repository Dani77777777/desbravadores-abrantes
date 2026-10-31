// Normalização das respostas da "Pergunta da Semana" (camada 1 do agrupamento, §6.1).
//
// Puro e sem dependências de servidor: corre ao inserir (o resultado vai para
// `normalized_text`) e é o que decide se duas respostas da mesma pessoa são a
// mesma ("Moisés" e "moises" → repetida). Na fase da revisão, o agrupamento sem
// IA (autoGroup) e a sugestão no palco partem também daqui.

import { normalizeText } from '@/utils/text-normalization'

export const ANSWER_MAX_LENGTH = 40
export const MAX_ANSWERS_PER_QUESTION = 3

const LEADING_ARTICLE = /^(o|a|os|as|um|uma|uns|umas) /

/**
 * Texto da resposta como fica guardado: sem espaços nas pontas, espaços seguidos
 * juntos e sem caracteres de controlo. Não mexe em maiúsculas nem acentos.
 */
export function cleanAnswerText(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tamanho em caracteres (code points), igual ao `char_length` do Postgres. */
export function answerLength(text: string): number {
  return [...text].length
}

/**
 * Chave de comparação: minúsculas, sem acentos, sem pontuação nem emojis, espaços
 * juntos e sem artigo inicial. Os plurais ficam (o "s" de "moises" é da palavra).
 */
export function normalizeAnswer(text: string): string {
  const base = normalizeText(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const semArtigo = base.replace(LEADING_ARTICLE, '')
  return semArtigo || base
}

export type AnswerCheck =
  | { ok: true; text: string; normalized: string }
  | { ok: false; error: string }

/** Valida uma resposta acabada de escrever e devolve o texto limpo e a chave. */
export function checkAnswer(raw: string): AnswerCheck {
  const text = cleanAnswerText(raw)
  if (!text) return { ok: false, error: 'Escreve uma resposta.' }
  if (answerLength(text) > ANSWER_MAX_LENGTH) {
    return { ok: false, error: `A resposta pode ter até ${ANSWER_MAX_LENGTH} caracteres.` }
  }
  const normalized = normalizeAnswer(text)
  if (!normalized) return { ok: false, error: 'Escreve uma resposta com letras ou números.' }
  return { ok: true, text, normalized }
}
