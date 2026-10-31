// O quadro de uma pergunta (§3.1): os grupos mais votados, com pontos que somam 100.
//
// Votos de um grupo = pessoas diferentes que deram uma resposta desse grupo: duas
// respostas da mesma pessoa no mesmo grupo contam 1 vez. Puro e com testes.

export const BOARD_SIZE = 5
/** Um grupo só vai ao quadro com pelo menos 2 pessoas. */
export const MIN_GROUP_RESPONDENTS = 2
/** Mínimo de pessoas diferentes para a pergunta poder ir a jogo. */
export const MIN_RESPONDENTS = 12
/** Mínimo de grupos válidos no quadro. */
export const MIN_BOARD_GROUPS = 3

export interface BoardGroupInput {
  id: string
  label: string
  emoji: string | null
  hidden: boolean
  /** Pessoas que deram uma resposta (não escondida) deste grupo; pode ter repetidas. */
  respondentKeys: string[]
}

export interface BoardEntry {
  rank: number
  groupId: string
  label: string
  emoji: string | null
  respondents: number
  points: number
}

/** Pontos proporcionais aos votos, arredondados; o 1.º lugar acerta a soma para 100. */
export function normalizePoints(votes: number[]): number[] {
  const total = votes.reduce((s, v) => s + v, 0)
  if (total === 0) return votes.map(() => 0)
  const points = votes.map((v) => Math.round((v / total) * 100))
  points[0] += 100 - points.reduce((s, p) => s + p, 0)
  return points
}

/** Grupos com os votos (pessoas diferentes), por ordem decrescente; empates pelo nome. */
export function rankGroups<T extends BoardGroupInput>(groups: T[]): (T & { respondents: number })[] {
  return groups
    .map((g) => ({ ...g, respondents: new Set(g.respondentKeys).size }))
    .sort((a, b) => b.respondents - a.respondents || a.label.localeCompare(b.label, 'pt-PT'))
}

export function computeBoard(groups: BoardGroupInput[]): BoardEntry[] {
  const valid = rankGroups(groups)
    .filter((g) => !g.hidden && g.respondents >= MIN_GROUP_RESPONDENTS)
    .slice(0, BOARD_SIZE)
  const points = normalizePoints(valid.map((g) => g.respondents))
  return valid.map((g, i) => ({
    rank: i + 1,
    groupId: g.id,
    label: g.label,
    emoji: g.emoji,
    respondents: g.respondents,
    points: points[i],
  }))
}

export interface BoardCheck {
  entries: BoardEntry[]
  /** Porque é que ainda não pode ficar pronta (vazio = pode). */
  problems: string[]
}

/** O quadro que sairia agora e o que falta para a pergunta poder ficar pronta. */
export function checkBoard(groups: BoardGroupInput[], totalRespondents: number): BoardCheck {
  const entries = computeBoard(groups)
  const problems: string[] = []
  if (totalRespondents < MIN_RESPONDENTS) {
    problems.push(`Só ${totalRespondents} ${totalRespondents === 1 ? 'pessoa' : 'pessoas'}: mínimo ${MIN_RESPONDENTS}.`)
  }
  if (entries.length < MIN_BOARD_GROUPS) {
    problems.push(
      `Só ${entries.length} ${entries.length === 1 ? 'grupo válido' : 'grupos válidos'} (com ${MIN_GROUP_RESPONDENTS}+ pessoas): mínimo ${MIN_BOARD_GROUPS}.`,
    )
  }
  return { entries, problems }
}
