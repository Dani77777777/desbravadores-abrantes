// Testes das regras puras do VanaEspada. Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import {
  MAX_LOCATE_POINTS,
  calcEspadaRewards,
  formatGuess,
  formatReference,
  pickRounds,
  scoreLocate,
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
  test('escala os pontos do jogo antes de os converter em Gold', () => {
    // 7340 pontos ≈ 73 Gold (e não 500, que seria o limite da sessão).
    expect(calcEspadaRewards(7_340, 9_000)).toEqual({ gold: 73, xp: 146 })
  })

  test('respeita o limite da sessão, escalando todos na mesma proporção', () => {
    const top = calcEspadaRewards(100_000, 100_000)
    expect(top.gold).toBe(500)
    expect(top.xp).toBe(1_000)

    const metade = calcEspadaRewards(50_000, 100_000)
    expect(metade.gold).toBe(250)
  })

  test('pontos a zero não dão prémio', () => {
    expect(calcEspadaRewards(0, 5_000)).toEqual({ gold: 0, xp: 0 })
  })
})
