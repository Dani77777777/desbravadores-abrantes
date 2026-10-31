import { describe, expect, test } from 'bun:test'
import { handleAnswerDelete, handleAnswerPost, type AnswerDeps, type AnswerRow, type MyAnswer } from './handler'

const Q = '11111111-1111-4111-8111-111111111111'
const GUEST = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const ANSWER = '22222222-2222-4222-8222-222222222222'
const AGORA = new Date('2026-10-20T12:00:00Z')
const aberta = { id: Q, opens_at: '2026-10-19T17:00:00Z', closes_at: '2026-10-26T18:00:00Z', allow_guests: true }

function deps(over: Partial<AnswerDeps> = {}, mine: MyAnswer[] = []) {
  const inserted: AnswerRow[] = []
  const awarded: string[] = []
  const deleted: string[] = []
  const d: AnswerDeps = {
    getUserId: async () => 'user-1',
    isMember: async () => true,
    getInviteToken: async () => 'k7Qm2xAb',
    getQuestion: async () => aberta,
    listMyAnswers: async () => mine,
    countRecent: async () => 0,
    countRecentByIp: async () => 0,
    ipHash: 'hash-ip',
    insert: async (row) => {
      inserted.push(row)
      return { id: ANSWER, error: null }
    },
    award: async (q) => {
      awarded.push(q)
      return { awarded: true, xp: 5 }
    },
    getAnswer: async () => ({ id: ANSWER, question_id: Q, profile_id: 'user-1', guest_id: null }),
    deleteAnswer: async (id) => {
      deleted.push(id)
      return true
    },
    now: () => AGORA,
    ...over,
  }
  return { d, inserted, awarded, deleted }
}

const semSessao = { getUserId: async () => null }
const convidado = { guest_id: GUEST, token: 'k7Qm2xAb' }
const resposta = (text: string, extra: object = {}) => ({ question_id: Q, text, ...extra })
const ja = (...texts: [string, string][]): MyAnswer[] => texts.map(([raw, norm], i) => ({ id: `a${i}`, raw_text: raw, normalized_text: norm }))

describe('POST resposta — membros', () => {
  test('1.ª resposta → 201, grava com o id da sessão e dá +5 XP', async () => {
    const { d, inserted, awarded } = deps()
    const res = await handleAnswerPost(resposta('  O Moisés ', { profile_id: 'outro' }), d)
    expect(res.status).toBe(201)
    expect(res.body.reward).toEqual({ xp: 5 })
    expect(inserted).toEqual([
      { question_id: Q, profile_id: 'user-1', guest_id: null, ip_hash: 'hash-ip', raw_text: 'O Moisés', normalized_text: 'moises' },
    ])
    expect(awarded).toEqual([Q])
  })

  test('2.ª resposta não pede o prémio outra vez', async () => {
    const { d, awarded } = deps({}, ja(['Moisés', 'moises']))
    const res = await handleAnswerPost(resposta('Arão'), d)
    expect(res.status).toBe(201)
    expect(res.body.reward).toBeNull()
    expect(awarded).toHaveLength(0)
  })

  test('a BD diz que já recebeu → sem prémio', async () => {
    const { d } = deps({ award: async () => ({ awarded: false }) })
    expect((await handleAnswerPost(resposta('Moisés'), d)).body.reward).toBeNull()
  })

  test('se o prémio falhar, a resposta fica gravada', async () => {
    const { d, inserted } = deps({ award: async () => Promise.reject(new Error('rpc')) })
    const res = await handleAnswerPost(resposta('Moisés'), d)
    expect(res.status).toBe(201)
    expect(inserted).toHaveLength(1)
  })

  test('membro ignora o token e o id de convidado do body', async () => {
    const { d, inserted } = deps()
    await handleAnswerPost(resposta('Moisés', convidado), d)
    expect(inserted[0]).toMatchObject({ profile_id: 'user-1', guest_id: null })
  })

  test('conta sem perfil do clube → 403', async () => {
    const { d, inserted } = deps({ isMember: async () => false })
    expect((await handleAnswerPost(resposta('Moisés'), d)).status).toBe(403)
    expect(inserted).toHaveLength(0)
  })
})

describe('POST resposta — regras', () => {
  test('"moises" depois de "Moisés" conta como repetida', async () => {
    const { d, inserted } = deps({}, ja(['Moisés', 'moises']))
    const res = await handleAnswerPost(resposta('moises!'), d)
    expect(res.status).toBe(409)
    expect(inserted).toHaveLength(0)
  })

  test('a 4.ª resposta é recusada', async () => {
    const { d, inserted } = deps({}, ja(['a', 'a'], ['b', 'b'], ['c', 'c']))
    const res = await handleAnswerPost(resposta('d'), d)
    expect(res.status).toBe(409)
    expect(String(res.body.error)).toContain('3 respostas')
    expect(inserted).toHaveLength(0)
  })

  test('o trigger da BD e a unique também dão 409', async () => {
    expect((await handleAnswerPost(resposta('x'), deps({ insert: async () => ({ id: null, error: 'limit' }) }).d)).status).toBe(409)
    expect((await handleAnswerPost(resposta('x'), deps({ insert: async () => ({ id: null, error: 'duplicate' }) }).d)).status).toBe(409)
  })

  test('resposta vazia, longa ou só com emojis → 400', async () => {
    for (const text of ['   ', 'a'.repeat(41), '🔥🔥']) {
      const { d, inserted } = deps()
      expect((await handleAnswerPost(resposta(text), d)).status).toBe(400)
      expect(inserted).toHaveLength(0)
    }
  })

  test('pergunta fechada, por abrir ou inexistente', async () => {
    const fechada = { ...aberta, closes_at: '2026-10-20T11:00:00Z' }
    const porAbrir = { ...aberta, opens_at: '2026-10-21T17:00:00Z' }
    const naFila = { ...aberta, opens_at: null, closes_at: null }
    expect((await handleAnswerPost(resposta('x'), deps({ getQuestion: async () => fechada }).d)).status).toBe(409)
    expect((await handleAnswerPost(resposta('x'), deps({ getQuestion: async () => porAbrir }).d)).status).toBe(409)
    expect((await handleAnswerPost(resposta('x'), deps({ getQuestion: async () => naFila }).d)).status).toBe(409)
    expect((await handleAnswerPost(resposta('x'), deps({ getQuestion: async () => null }).d)).status).toBe(404)
  })

  test('limite por pessoa e por IP → 429', async () => {
    expect((await handleAnswerPost(resposta('x'), deps({ countRecent: async () => 10 }).d)).status).toBe(429)
    expect((await handleAnswerPost(resposta('x'), deps({ countRecentByIp: async () => 30 }).d)).status).toBe(429)
    expect((await handleAnswerPost(resposta('x'), deps({ countRecent: async () => 9, countRecentByIp: async () => 29 }).d)).status).toBe(201)
  })

  test('body inválido → 400', async () => {
    for (const body of [null, {}, { question_id: 'nao-uuid', text: 'x' }, { question_id: Q, text: 42 }]) {
      expect((await handleAnswerPost(body, deps().d)).status).toBe(400)
    }
  })
})

describe('POST resposta — convidados', () => {
  test('com o link certo → 201, sem prémio', async () => {
    const { d, inserted, awarded } = deps(semSessao)
    const res = await handleAnswerPost(resposta('Tenda', convidado), d)
    expect(res.status).toBe(201)
    expect(res.body.reward).toBeNull()
    expect(awarded).toHaveLength(0)
    expect(inserted[0]).toMatchObject({ profile_id: null, guest_id: GUEST })
  })

  test('link antigo (depois de gerar um novo) → 403', async () => {
    const { d, inserted } = deps({ ...semSessao, getInviteToken: async () => 'novoToken' })
    expect((await handleAnswerPost(resposta('Tenda', convidado), d)).status).toBe(403)
    expect(inserted).toHaveLength(0)
  })

  test('sem link nem sessão → 401', async () => {
    expect((await handleAnswerPost(resposta('Tenda'), deps(semSessao).d)).status).toBe(401)
    expect((await handleAnswerPost(resposta('Tenda', { token: 'k7Qm2xAb' }), deps(semSessao).d)).status).toBe(401)
  })

  test('pergunta só para membros → 404 ao convidado', async () => {
    const { d } = deps({ ...semSessao, getQuestion: async () => ({ ...aberta, allow_guests: false }) })
    expect((await handleAnswerPost(resposta('Tenda', convidado), d)).status).toBe(404)
  })
})

describe('DELETE resposta', () => {
  const apagar = (extra: object = {}) => ({ answer_id: ANSWER, ...extra })

  test('o próprio apaga enquanto está aberta', async () => {
    const { d, deleted } = deps()
    expect((await handleAnswerDelete(apagar(), d)).status).toBe(200)
    expect(deleted).toEqual([ANSWER])
  })

  test('resposta de outra pessoa → 404', async () => {
    const { d, deleted } = deps({ getAnswer: async () => ({ id: ANSWER, question_id: Q, profile_id: 'outro', guest_id: null }) })
    expect((await handleAnswerDelete(apagar(), d)).status).toBe(404)
    expect(deleted).toHaveLength(0)
  })

  test('convidado apaga a sua, não a de outro convidado', async () => {
    const minha = deps({ ...semSessao, getAnswer: async () => ({ id: ANSWER, question_id: Q, profile_id: null, guest_id: GUEST }) })
    expect((await handleAnswerDelete(apagar(convidado), minha.d)).status).toBe(200)
    const outra = deps({
      ...semSessao,
      getAnswer: async () => ({ id: ANSWER, question_id: Q, profile_id: null, guest_id: '00000000-0000-4000-8000-000000000000' }),
    })
    expect((await handleAnswerDelete(apagar(convidado), outra.d)).status).toBe(404)
  })

  test('depois de fechar já não se apaga', async () => {
    const { d, deleted } = deps({ getQuestion: async () => ({ ...aberta, closes_at: '2026-10-20T11:00:00Z' }) })
    expect((await handleAnswerDelete(apagar(), d)).status).toBe(409)
    expect(deleted).toHaveLength(0)
  })
})
