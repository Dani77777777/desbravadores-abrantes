// Testes das regras puras do VanaEspada. Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import {
  MAX_LOCATE_POINTS,
  answerTier,
  calcEspadaRewards,
  formatGuess,
  formatReference,
  pickRounds,
  scoreLocate,
  summarizePlayerStrengths,
} from './vana-espada'
import { BIBLE_BOOKS, TOTAL_CHAPTERS, isValidChapter } from './bible-books'
import type { EspadaReference } from '@/types/vana-espada'

const LIMIT = 30_000

// Salmos 23:1 — poéticos, Antigo Testamento.
const SL_23: EspadaReference = { bookId: 19, chapter: 23, verseStart: 1, verseEnd: 1 }
// 1 Samuel 17:45-47 — história, Antigo Testamento (intervalo de versículos).
const SM_17: EspadaReference = { bookId: 9, chapter: 17, verseStart: 45, verseEnd: 47 }
// Judas 1:9 — livro de um só capítulo, Novo Testamento.
const JUDAS: EspadaReference = { bookId: 65, chapter: 1, verseStart: 9, verseEnd: 9 }

describe('bible-books', () => {
  test('tem os 66 livros por ordem canónica', () => {
    expect(BIBLE_BOOKS).toHaveLength(66)
    BIBLE_BOOKS.forEach((book, i) => expect(book.id).toBe(i + 1))
  })

  test('a versificação da Almeida dá 1189 capítulos', () => {
    expect(TOTAL_CHAPTERS).toBe(1189)
  })

  test('não há slugs nem abreviaturas repetidos', () => {
    expect(new Set(BIBLE_BOOKS.map((b) => b.slug)).size).toBe(66)
    expect(new Set(BIBLE_BOOKS.map((b) => b.abbr)).size).toBe(66)
  })

  test('isValidChapter respeita os limites de cada livro', () => {
    expect(isValidChapter(19, 150)).toBe(true)   // Sl 150 existe
    expect(isValidChapter(19, 151)).toBe(false)
    expect(isValidChapter(65, 1)).toBe(true)     // Judas só tem 1
    expect(isValidChapter(65, 2)).toBe(false)
    expect(isValidChapter(99, 1)).toBe(false)    // livro inexistente
  })
})

describe('scoreLocate', () => {
  test('acerto perfeito e instantâneo vale o máximo', () => {
    const { points, breakdown } = scoreLocate(
      { bookId: 19, chapter: 23, verse: 1 },
      SL_23, 0, LIMIT
    )
    expect(points).toBe(MAX_LOCATE_POINTS)
    expect(breakdown).toMatchObject({ book: 600, chapter: 250, verse: 100, speed: 50 })
    expect(breakdown.bookMatch).toBe('exact')
  })

  test('acerto perfeito no fim do tempo perde só a rapidez', () => {
    const { points, breakdown } = scoreLocate(
      { bookId: 19, chapter: 23, verse: 1 },
      SL_23, LIMIT, LIMIT
    )
    expect(points).toBe(MAX_LOCATE_POINTS - 50)
    expect(breakdown.speed).toBe(0)
  })

  test('a rapidez é proporcional ao tempo que sobrou', () => {
    const { breakdown } = scoreLocate({ bookId: 19, chapter: 23, verse: 1 }, SL_23, LIMIT / 2, LIMIT)
    expect(breakdown.speed).toBe(25)
  })

  test('livro errado da mesma secção vale 200 + rapidez', () => {
    // Provérbios (20) e Salmos (19) são ambos poéticos.
    const { points, breakdown } = scoreLocate({ bookId: 20, chapter: 23, verse: 1 }, SL_23, 0, LIMIT)
    expect(breakdown.bookMatch).toBe('section')
    expect(points).toBe(200 + 50)
    expect(breakdown.chapter).toBe(0)
    expect(breakdown.verse).toBe(0)
  })

  test('livro errado do mesmo testamento vale 50 + rapidez', () => {
    // Génesis (1, Lei) contra Salmos (19, poéticos): mesmo testamento, secção diferente.
    const { points, breakdown } = scoreLocate({ bookId: 1, chapter: 23, verse: 1 }, SL_23, 0, LIMIT)
    expect(breakdown.bookMatch).toBe('testament')
    expect(points).toBe(50 + 50)
  })

  test('testamento errado não dá nada, nem sequer rapidez', () => {
    const { points, breakdown } = scoreLocate({ bookId: 43, chapter: 23, verse: 1 }, SL_23, 0, LIMIT)
    expect(breakdown.bookMatch).toBe('none')
    expect(breakdown.speed).toBe(0)
    expect(points).toBe(0)
  })

  test('a proximidade do capítulo decai 10% por capítulo de distância', () => {
    const dois = scoreLocate({ bookId: 19, chapter: 25, verse: null }, SL_23, 0, LIMIT)
    expect(dois.breakdown.chapterDelta).toBe(2)
    expect(dois.breakdown.chapter).toBe(200) // 250 × (1 − 2/10)

    const cinco = scoreLocate({ bookId: 19, chapter: 18, verse: null }, SL_23, 0, LIMIT)
    expect(cinco.breakdown.chapter).toBe(125)
  })

  test('capítulo a 10 ou mais de distância não vale nada', () => {
    const { breakdown } = scoreLocate({ bookId: 19, chapter: 33, verse: 1 }, SL_23, 0, LIMIT)
    expect(breakdown.chapterDelta).toBe(10)
    expect(breakdown.chapter).toBe(0)
    expect(breakdown.verse).toBe(0) // o versículo só conta com o capítulo certo
  })

  test('versículo dentro do intervalo vale tudo (1 Sm 17:45-47)', () => {
    for (const verse of [45, 46, 47]) {
      const { points, breakdown } = scoreLocate({ bookId: 9, chapter: 17, verse }, SM_17, 0, LIMIT)
      expect(breakdown.verse).toBe(100)
      expect(breakdown.verseDelta).toBe(0)
      expect(points).toBe(MAX_LOCATE_POINTS)
    }
  })

  test('versículo fora do intervalo conta a distância ao intervalo', () => {
    const antes = scoreLocate({ bookId: 9, chapter: 17, verse: 43 }, SM_17, 0, LIMIT)
    expect(antes.breakdown.verseDelta).toBe(2)  // 45 − 43
    expect(antes.breakdown.verse).toBe(80)

    const depois = scoreLocate({ bookId: 9, chapter: 17, verse: 50 }, SM_17, 0, LIMIT)
    expect(depois.breakdown.verseDelta).toBe(3) // 50 − 47
    expect(depois.breakdown.verse).toBe(70)
  })

  test('"Só sei o livro" pontua livro + rapidez e mais nada', () => {
    const { points, breakdown } = scoreLocate(
      { bookId: 19, chapter: null, verse: null },
      SL_23, 0, LIMIT
    )
    expect(points).toBe(600 + 50)
    expect(breakdown.chapter).toBe(0)
    expect(breakdown.verse).toBe(0)
    expect(breakdown.chapterDelta).toBeNull()
    expect(breakdown.verseDelta).toBeNull()
  })

  test('livro de um só capítulo (Judas) pontua na mesma', () => {
    const { points } = scoreLocate({ bookId: 65, chapter: 1, verse: 9 }, JUDAS, 0, LIMIT)
    expect(points).toBe(MAX_LOCATE_POINTS)
  })

  test('livro inexistente não rebenta e vale 0', () => {
    const { points, breakdown } = scoreLocate({ bookId: 0, chapter: null, verse: null }, SL_23, 0, LIMIT)
    expect(points).toBe(0)
    expect(breakdown.bookMatch).toBe('none')
  })

  test('o breakdown soma sempre o total', () => {
    const cases = [
      { bookId: 19, chapter: 23, verse: 1 },
      { bookId: 19, chapter: 27, verse: 4 },
      { bookId: 20, chapter: 3, verse: 5 },
      { bookId: 43, chapter: 3, verse: 16 },
    ]
    for (const guess of cases) {
      const { points, breakdown } = scoreLocate(guess, SL_23, 7_000, LIMIT)
      expect(breakdown.book + breakdown.chapter + breakdown.verse + breakdown.speed).toBe(points)
    }
  })

  test('tempo acima do limite (tolerância da rede) não dá rapidez negativa', () => {
    const { breakdown } = scoreLocate({ bookId: 19, chapter: 23, verse: 1 }, SL_23, LIMIT + 5_000, LIMIT)
    expect(breakdown.speed).toBe(0)
  })
})

describe('formatReference / formatGuess', () => {
  test('formata intervalos e versículos únicos', () => {
    expect(formatReference(SM_17)).toBe('1 Samuel 17:45-47')
    expect(formatReference(SL_23)).toBe('Salmos 23:1')
  })

  test('mostra o palpite ao nível de detalhe que o jogador deu', () => {
    expect(formatGuess({ bookId: 1, chapter: 3, verse: 15 })).toBe('Gn 3:15')
    expect(formatGuess({ bookId: 1, chapter: 3, verse: null })).toBe('Gn 3')
    expect(formatGuess({ bookId: 1, chapter: null, verse: null })).toBe('Gn')
    expect(formatGuess(null)).toBe('—')
  })
})

describe('pickRounds', () => {
  const pool = Array.from({ length: 10 }, (_, i) => ({
    id: `v${i}`,
    difficulty: (i < 5 ? 'easy' : 'hard') as 'easy' | 'hard',
  }))
  // RNG determinista: devolve sempre 0 → o shuffle fica previsível.
  const rng = () => 0

  test('devolve o número pedido, sem repetir', () => {
    const picked = pickRounds(pool, { count: 4, difficulty: 'any' }, rng)
    expect(picked).toHaveLength(4)
    expect(new Set(picked.map((p) => p.id)).size).toBe(4)
  })

  test('filtra por dificuldade', () => {
    const picked = pickRounds(pool, { count: 5, difficulty: 'easy' }, rng)
    expect(picked.every((p) => p.difficulty === 'easy')).toBe(true)
  })

  test('evita os excluídos enquanto houver alternativas', () => {
    const picked = pickRounds(pool, { count: 3, difficulty: 'easy', excludeVerseIds: ['v0', 'v1'] }, rng)
    expect(picked.map((p) => p.id)).not.toContain('v0')
    expect(picked.map((p) => p.id)).not.toContain('v1')
  })

  test('recicla os excluídos em vez de devolver rondas a menos', () => {
    const picked = pickRounds(
      pool,
      { count: 5, difficulty: 'easy', excludeVerseIds: ['v0', 'v1', 'v2'] },
      rng
    )
    expect(picked).toHaveLength(5)
    expect(new Set(picked.map((p) => p.id)).size).toBe(5)
  })

  test('nunca devolve mais do que o que existe', () => {
    expect(pickRounds(pool, { count: 50, difficulty: 'easy' }, rng)).toHaveLength(5)
  })
})

describe('calcEspadaRewards', () => {
  test('tira a última casa: 4826 pontos dão 482 Gold e o dobro de XP', () => {
    expect(calcEspadaRewards(4_826)).toEqual({ gold: 482, xp: 964 })
  })

  test('arredonda sempre para baixo', () => {
    expect(calcEspadaRewards(4_829)).toEqual({ gold: 482, xp: 964 })
    expect(calcEspadaRewards(9)).toEqual({ gold: 0, xp: 0 })
    expect(calcEspadaRewards(10)).toEqual({ gold: 1, xp: 2 })
  })

  test('não tem teto: um jogo perfeito de 15 rondas paga tudo', () => {
    expect(calcEspadaRewards(15_000)).toEqual({ gold: 1_500, xp: 3_000 })
  })

  test('pontos a zero ou negativos não dão prémio', () => {
    expect(calcEspadaRewards(0)).toEqual({ gold: 0, xp: 0 })
    expect(calcEspadaRewards(-50)).toEqual({ gold: 0, xp: 0 })
  })
})

describe('answerTier', () => {
  const tierOf = (guess: { bookId: number; chapter: number | null; verse: number | null }) =>
    answerTier(scoreLocate(guess, SL_23, 0, LIMIT).breakdown)

  test('classifica do mais perto para o mais longe', () => {
    expect(tierOf({ bookId: 19, chapter: 23, verse: 1 })).toBe('exact')
    expect(tierOf({ bookId: 19, chapter: 23, verse: 4 })).toBe('chapter')
    expect(tierOf({ bookId: 19, chapter: 23, verse: null })).toBe('chapter')
    expect(tierOf({ bookId: 19, chapter: 30, verse: 1 })).toBe('book')
    expect(tierOf({ bookId: 19, chapter: null, verse: null })).toBe('book') // "Só sei o livro"
    expect(tierOf({ bookId: 20, chapter: 1, verse: 1 })).toBe('section')
    expect(tierOf({ bookId: 1, chapter: 1, verse: 1 })).toBe('testament')
    expect(tierOf({ bookId: 43, chapter: 3, verse: 16 })).toBe('miss')
    expect(answerTier(null)).toBe('unanswered')
  })
})

describe('summarizePlayerStrengths', () => {
  // Duas rondas nos Evangelhos, uma nos profetas menores, uma nos poéticos.
  const rounds = [
    { id: 'r1', bookId: 43 }, // João (evangelhos)
    { id: 'r2', bookId: 40 }, // Mateus (evangelhos)
    { id: 'r3', bookId: 33 }, // Miqueias (profetas menores)
    { id: 'r4', bookId: 19 }, // Salmos (poéticos)
  ]
  const exact = scoreLocate({ bookId: 43, chapter: 3, verse: 16 }, { bookId: 43, chapter: 3, verseStart: 16, verseEnd: 16 }, 3_000, LIMIT)
  const book = scoreLocate({ bookId: 40, chapter: null, verse: null }, { bookId: 40, chapter: 6, verseStart: 33, verseEnd: 33 }, 9_000, LIMIT)
  const miss = scoreLocate({ bookId: 43, chapter: 1, verse: 1 }, { bookId: 33, chapter: 6, verseStart: 8, verseEnd: 8 }, 20_000, LIMIT)

  const s = summarizePlayerStrengths(rounds, [
    { roundId: 'r1', breakdown: exact.breakdown, points: exact.points, elapsedMs: 3_000 },
    { roundId: 'r2', breakdown: book.breakdown, points: book.points, elapsedMs: 9_000 },
    { roundId: 'r3', breakdown: miss.breakdown, points: miss.points, elapsedMs: 20_000 },
    // r4 sem resposta
  ])

  test('conta os níveis e as rondas sem resposta', () => {
    expect(s.rounds).toBe(4)
    expect(s.answered).toBe(3)
    expect(s.tiers.exact).toBe(1)
    expect(s.tiers.book).toBe(1)
    expect(s.tiers.miss).toBe(1)
    expect(s.tiers.unanswered).toBe(1)
  })

  test('a média de tempo só usa as rondas respondidas', () => {
    expect(s.avgSeconds).toBe(10.7) // (3 + 9 + 20) / 3
  })

  test('encontra o ponto forte e as secções a treinar', () => {
    expect(s.bySection[0].section).toBe('gospels')
    expect(s.bySection[0].bookRight).toBe(2)
    expect(s.strongest).toEqual(['gospels'])
    // Sem resposta nos poéticos (0) e falhou os profetas menores (0): os dois a treinar.
    expect(s.weakest).toHaveLength(2)
    expect(s.weakest).toContain('minor_prophets')
    expect(s.weakest).toContain('poetry')
  })

  test('sem rondas não rebenta', () => {
    const empty = summarizePlayerStrengths([], [])
    expect(empty.avgPoints).toBe(0)
    expect(empty.avgSeconds).toBeNull()
    expect(empty.bySection).toEqual([])
  })
})
