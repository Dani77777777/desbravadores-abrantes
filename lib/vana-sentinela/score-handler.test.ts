import { describe, expect, test } from 'bun:test'
import { handleScorePost, type Jogador, type ScoreDeps, type ScoreRow } from './score-handler'

const valido = { pack: 'abrantes', pontos: 1500, acertos: 10, total: 15, comboMax: 5, duracaoMs: 40_000 }
const GUEST_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const convidado = { ...valido, convidado: { id: GUEST_ID, nome: '  Leão  Veloz ' } }
const AGORA = new Date('2026-10-04T12:00:00Z')

function deps(over: Partial<ScoreDeps> = {}) {
  const inserted: ScoreRow[] = []
  const awarded: string[] = []
  const rateLimited: Jogador[] = []
  const d: ScoreDeps = {
    getUserId: async () => 'user-1',
    getRole: async () => 'desbravador',
    canPlay: async () => true,
    lastScoreAt: async (j) => {
      rateLimited.push(j)
      return null
    },
    insert: async (row) => {
      inserted.push(row)
      return { id: 'score-1', error: null }
    },
    award: async (id) => {
      awarded.push(id)
      return { awarded: true, xp: 1, gold: 1 }
    },
    now: () => AGORA,
    ...over,
  }
  return { d, inserted, awarded, rateLimited }
}

const semSessao = { getUserId: async () => null }

describe('POST pontuação — membros', () => {
  test('dados válidos → 201, grava com o user_id da sessão e dá o prémio', async () => {
    const { d, inserted, awarded } = deps()
    const res = await handleScorePost({ ...valido, user_id: 'outro-utilizador' }, d)
    expect(res.status).toBe(201)
    expect(res.body.recompensa).toEqual({ awarded: true, xp: 1, gold: 1 })
    expect(inserted).toEqual([
      { pack: 'abrantes', user_id: 'user-1', guest_id: null, guest_name: null, points: 1500, correct: 10, total: 15, max_combo: 5, duration_ms: 40_000 },
    ])
    expect(awarded).toEqual(['score-1'])
  })

  test('membro ignora dados de convidado no body', async () => {
    const { d, inserted } = deps()
    await handleScorePost(convidado, d)
    expect(inserted[0]).toMatchObject({ user_id: 'user-1', guest_id: null, guest_name: null })
  })

  test('se o prémio falhar, a pontuação fica gravada', async () => {
    const { d, inserted } = deps({ award: async () => Promise.reject(new Error('rpc')) })
    const res = await handleScorePost(valido, d)
    expect(res.status).toBe(201)
    expect(res.body.recompensa).toBeNull()
    expect(inserted).toHaveLength(1)
  })

  test('conta sem perfil do clube → 403', async () => {
    const { d, inserted } = deps({ getRole: async () => null })
    expect((await handleScorePost(valido, d)).status).toBe(403)
    expect(inserted).toHaveLength(0)
  })

  test('jogo desativado → 403', async () => {
    const { d } = deps({ canPlay: async () => false })
    expect((await handleScorePost(valido, d)).status).toBe(403)
  })
})

describe('POST pontuação — convidados', () => {
  test('com alcunha → 201, sem prémio e com a alcunha limpa', async () => {
    const { d, inserted, awarded, rateLimited } = deps(semSessao)
    const res = await handleScorePost(convidado, d)
    expect(res.status).toBe(201)
    expect(res.body.recompensa).toBeNull()
    expect(awarded).toHaveLength(0)
    expect(rateLimited).toEqual([{ guestId: GUEST_ID }])
    expect(inserted[0]).toMatchObject({ user_id: null, guest_id: GUEST_ID, guest_name: 'Leão Veloz' })
  })

  test('sem sessão nem alcunha → 401 e não grava nada', async () => {
    const { d, inserted } = deps(semSessao)
    expect((await handleScorePost(valido, d)).status).toBe(401)
    expect(inserted).toHaveLength(0)
  })

  test('alcunha ou id inválidos → 400', async () => {
    for (const c of [
      { id: GUEST_ID, nome: 'x' },
      { id: GUEST_ID, nome: 'http://spam.example/x' },
      { id: 'nao-e-uuid', nome: 'Ana' },
    ]) {
      const { d, inserted } = deps(semSessao)
      expect((await handleScorePost({ ...valido, convidado: c }, d)).status).toBe(400)
      expect(inserted).toHaveLength(0)
    }
  })

  test('jogo indisponível para convidados → 403', async () => {
    const { d } = deps({ ...semSessao, canPlay: async (role) => role !== null })
    expect((await handleScorePost(convidado, d)).status).toBe(403)
  })
})

describe('POST pontuação — validação', () => {
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
