import { describe, expect, test } from 'bun:test'
import { handleScorePost, type ScoreDeps, type ScoreRow } from './score-handler'

const valido = { pack: 'abrantes', pontos: 1500, acertos: 10, total: 15, comboMax: 5, duracaoMs: 40_000 }
const AGORA = new Date('2026-10-04T12:00:00Z')

function deps(over: Partial<ScoreDeps> = {}) {
  const inserted: ScoreRow[] = []
  const d: ScoreDeps = {
    getUserId: async () => 'user-1',
    getRole: async () => 'desbravador',
    canPlay: async () => true,
    lastScoreAt: async () => null,
    insert: async (row) => {
      inserted.push(row)
      return { error: null }
    },
    now: () => AGORA,
    ...over,
  }
  return { d, inserted }
}

describe('POST pontuação', () => {
  test('com sessão e dados válidos → 201 e grava com o user_id da sessão', async () => {
    const { d, inserted } = deps()
    const res = await handleScorePost({ ...valido, user_id: 'outro-utilizador' }, d)
    expect(res.status).toBe(201)
    expect(inserted).toEqual([
      { pack: 'abrantes', user_id: 'user-1', points: 1500, correct: 10, total: 15, max_combo: 5, duration_ms: 40_000 },
    ])
  })

  test('sem sessão → 401 e não grava nada', async () => {
    const { d, inserted } = deps({ getUserId: async () => null })
    const res = await handleScorePost(valido, d)
    expect(res.status).toBe(401)
    expect(inserted).toHaveLength(0)
  })

  test('conta sem perfil do clube → 403', async () => {
    const { d, inserted } = deps({ getRole: async () => null })
    expect((await handleScorePost(valido, d)).status).toBe(403)
    expect(inserted).toHaveLength(0)
  })

  test('jogo desativado para o cargo → 403', async () => {
    const { d } = deps({ canPlay: async () => false })
    expect((await handleScorePost(valido, d)).status).toBe(403)
  })

  test('pontuação impossível → 400', async () => {
    for (const body of [
      { ...valido, pontos: 999_999 },
      { ...valido, duracaoMs: 3_000 },
      { ...valido, acertos: 3, comboMax: 5 },
      { ...valido, pack: 'tomar' },
      { ...valido, pack: 'nao-existe' },
      { ...valido, pontos: 'muitos' },
      null,
    ]) {
      const { d, inserted } = deps()
      expect((await handleScorePost(body, d)).status).toBe(400)
      expect(inserted).toHaveLength(0)
    }
  })

  test('rate limit: segunda pontuação em menos de 20 s → 429', async () => {
    const { d, inserted } = deps({ lastScoreAt: async () => new Date(AGORA.getTime() - 5_000) })
    expect((await handleScorePost(valido, d)).status).toBe(429)
    expect(inserted).toHaveLength(0)

    const depois = deps({ lastScoreAt: async () => new Date(AGORA.getTime() - 25_000) })
    expect((await handleScorePost(valido, depois.d)).status).toBe(201)
  })
})
