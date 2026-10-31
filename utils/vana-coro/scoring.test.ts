// Testes das regras do Family Feud (§3.3). Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import {
  applyEvent,
  playerReward,
  replayRound,
  roundMultiplier,
  teamScores,
  type BoardEntryRef,
  type RoundEvent,
} from './scoring'

// Quadro 33·24·19·14·10
const board: BoardEntryRef[] = [
  { id: 'e1', rank: 1, points: 33 },
  { id: 'e2', rank: 2, points: 24 },
  { id: 'e3', rank: 3, points: 19 },
  { id: 'e4', rank: 4, points: 14 },
  { id: 'e5', rank: 5, points: 10 },
]
const reveal = (entryId: string): RoundEvent => ({ kind: 'reveal', entryId })
const strike: RoundEvent = { kind: 'strike' }

describe('roundMultiplier', () => {
  test('a última ronda vale ×2', () => {
    expect([1, 2, 3, 4, 5].map((r) => roundMultiplier(r, 5))).toEqual([1, 1, 1, 1, 2])
  })
})

describe('duelo', () => {
  test('o primeiro a carregar ganha; o segundo é ignorado', () => {
    const s = replayRound([{ kind: 'start' }, { kind: 'buzz', team: 'b' }, { kind: 'buzz', team: 'a' }], board, 1)
    expect(s.buzzedTeam).toBe('b')
  })

  test('não se carrega antes do duelo', () => {
    expect(applyEvent(replayRound([], board, 1), { kind: 'buzz', team: 'a' }, board, 1)).toBeTypeOf('string')
  })

  test('a resposta do duelo vai para o pote; o ❌ do duelo não conta para as 3 falhas', () => {
    const s = replayRound([{ kind: 'start' }, { kind: 'buzz', team: 'a' }, strike, reveal('e2')], board, 1)
    expect(s.pot).toBe(24)
    expect(s.strikes).toBe(0)
    expect(s.strikeSeq).toBe(1)
    expect(s.phase).toBe('faceoff')
  })

  test('dar o controlo passa a jogar', () => {
    const s = replayRound([{ kind: 'start' }, reveal('e1'), { kind: 'control', team: 'a' }], board, 1)
    expect(s.phase).toBe('playing')
    expect(s.controlTeam).toBe('a')
  })
})

describe('a jogar', () => {
  const opening: RoundEvent[] = [{ kind: 'start' }, { kind: 'buzz', team: 'a' }, reveal('e1'), { kind: 'control', team: 'a' }]

  test('quadro limpo: a equipa com o controlo ganha o pote', () => {
    const s = replayRound([...opening, reveal('e2'), strike, reveal('e3'), reveal('e4'), reveal('e5')], board, 1)
    expect(s.winner).toBe('a')
    expect(s.banked).toBe(100)
    expect(s.phase).toBe('round_end')
    expect(s.strikes).toBe(1)
  })

  test('3 falhas abrem o roubo', () => {
    const s = replayRound([...opening, reveal('e3'), strike, strike, strike], board, 1)
    expect(s.phase).toBe('steal')
    expect(s.pot).toBe(52)
  })

  test('não se revela a mesma resposta duas vezes', () => {
    const s = replayRound([...opening], board, 1)
    expect(applyEvent(s, reveal('e1'), board, 1)).toBeTypeOf('string')
  })
})

describe('roubo', () => {
  const toSteal: RoundEvent[] = [
    { kind: 'start' }, { kind: 'buzz', team: 'a' }, reveal('e1'), { kind: 'control', team: 'a' },
    reveal('e3'), strike, strike, strike,
  ]

  test('roubo certo: a outra equipa leva o pote mais a resposta', () => {
    const s = replayRound([...toSteal, { kind: 'steal_result', success: true, entryId: 'e2' }], board, 1)
    expect(s.winner).toBe('b')
    expect(s.banked).toBe(33 + 19 + 24)
    expect(s.phase).toBe('reveal_rest')
  })

  test('roubo errado: o pote fica com quem tinha o controlo', () => {
    const s = replayRound([...toSteal, { kind: 'steal_result', success: false }], board, 1)
    expect(s.winner).toBe('a')
    expect(s.banked).toBe(52)
    expect(s.strikeSeq).toBe(4)
  })

  test('roubo certo sem escolher a resposta é recusado', () => {
    const s = replayRound(toSteal, board, 1)
    expect(applyEvent(s, { kind: 'steal_result', success: true }, board, 1)).toBeTypeOf('string')
  })

  test('na ronda ×2 o pote vale o dobro', () => {
    const s = replayRound([...toSteal, { kind: 'steal_result', success: false }], board, 2)
    expect(s.banked).toBe(104)
  })
})

describe('revelar o resto', () => {
  const decided: RoundEvent[] = [
    { kind: 'start' }, reveal('e1'), { kind: 'control', team: 'b' },
    strike, strike, strike, { kind: 'steal_result', success: false },
  ]

  test('revela sem pontos e fecha sozinha quando acaba', () => {
    const s = replayRound([...decided, reveal('e2'), reveal('e3'), reveal('e4'), reveal('e5')], board, 1)
    expect(s.banked).toBe(33)
    expect(s.pot).toBe(33)
    expect(s.revealed.e2).toEqual({ points: 24, scored: false })
    expect(s.phase).toBe('round_end')
  })

  test('ou fecha-se antes de revelar tudo', () => {
    expect(replayRound([...decided, { kind: 'finish' }], board, 1).phase).toBe('round_end')
  })
})

describe('desfazer = repetir o registo sem a última ação', () => {
  test('depois de uma revelação', () => {
    const events: RoundEvent[] = [{ kind: 'start' }, reveal('e1'), { kind: 'control', team: 'a' }, reveal('e2')]
    const undone = replayRound(events.slice(0, -1), board, 1)
    expect(undone.pot).toBe(33)
    expect(undone.revealed.e2).toBeUndefined()
  })

  test('depois de uma falha (inclusive a 3.ª, que abriu o roubo)', () => {
    const events: RoundEvent[] = [{ kind: 'start' }, reveal('e1'), { kind: 'control', team: 'a' }, strike, strike, strike]
    const undone = replayRound(events.slice(0, -1), board, 1)
    expect(undone.strikes).toBe(2)
    expect(undone.phase).toBe('playing')
  })
})

describe('jogo completo de 5 rondas', () => {
  test('totais certos com duelo, falhas, roubo certo e errado, quadro limpo e ×2', () => {
    const rounds = [
      // 1. A limpa o quadro → A +100
      replayRound([{ kind: 'start' }, reveal('e1'), { kind: 'control', team: 'a' }, reveal('e2'), reveal('e3'), reveal('e4'), reveal('e5')], board, 1),
      // 2. B tem o controlo, 3 falhas, A rouba com e3 → A +(33+24+19)=76
      replayRound([{ kind: 'start' }, reveal('e1'), { kind: 'control', team: 'b' }, reveal('e2'), strike, strike, strike, { kind: 'steal_result', success: true, entryId: 'e3' }], board, 1),
      // 3. A tem o controlo, 3 falhas, B falha o roubo → A +24
      replayRound([{ kind: 'start' }, reveal('e2'), { kind: 'control', team: 'a' }, strike, strike, strike, { kind: 'steal_result', success: false }], board, 1),
      // 4. B limpa → B +100
      replayRound([{ kind: 'start' }, reveal('e5'), { kind: 'control', team: 'b' }, reveal('e1'), reveal('e2'), reveal('e3'), reveal('e4')], board, 1),
      // 5. ×2: B tem o controlo, 3 falhas, B fica com o pote → B +(33+14)×2=94
      replayRound([{ kind: 'start' }, reveal('e1'), { kind: 'control', team: 'b' }, reveal('e4'), strike, strike, strike, { kind: 'steal_result', success: false }], board, roundMultiplier(5, 5)),
    ]
    const scores = teamScores(rounds)
    expect(scores).toEqual({ a: 200, b: 194 })
    expect(playerReward('a', scores)).toEqual({ xp: 60, gold: 30 })
    expect(playerReward('b', scores)).toEqual({ xp: 30, gold: 15 })
  })

  test('empate: as duas equipas recebem como vencedoras', () => {
    expect(playerReward('b', { a: 100, b: 100 })).toEqual({ xp: 60, gold: 30 })
    expect(playerReward(null, { a: 100, b: 100 })).toBeNull()
  })
})
