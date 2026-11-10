// Testes das regras puras do VanaCamp: Infiltrados. Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import {
  assignRoles,
  checkWinCondition,
  resolveNight,
  rolesDistribution,
  tallyVotes,
  validateRoleConfig,
} from './vana-camp'
import type { VanaCampNightAction, VanaCampVote } from '@/types/vana-camp'

function action(
  phase: VanaCampNightAction['phase'],
  actor: string,
  target: string,
  at = '2026-01-01T00:00:00Z',
): VanaCampNightAction {
  return {
    id: `${phase}-${actor}`,
    session_id: 's',
    day_number: 1,
    phase,
    actor_player_id: actor,
    target_player_id: target,
    result: null,
    created_at: at,
  }
}

function vote(voter: string, target: string): VanaCampVote {
  return {
    id: voter,
    session_id: 's',
    day_number: 1,
    vote_type: 'day_expulsion',
    voter_player_id: voter,
    target_player_id: target,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('rolesDistribution', () => {
  test('soma sempre o número de jogadores e passa na validação', () => {
    for (let n = 4; n <= 25; n++) {
      const c = rolesDistribution(n)
      expect(c.infiltrators + c.seer + c.guardian + c.villagers).toBe(n)
      expect(validateRoleConfig(c, n)).toBeNull()
    }
  })

  test('menos de 4 jogadores não é possível', () => {
    expect(() => rolesDistribution(3)).toThrow()
  })
})

describe('assignRoles', () => {
  test('respeita as contagens', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const roles = [...assignRoles(ids, rolesDistribution(7), 42).values()]
    expect(roles.filter((r) => r === 'infiltrator').length).toBe(2)
    expect(roles.filter((r) => r === 'seer').length).toBe(1)
    expect(roles.filter((r) => r === 'guardian').length).toBe(1)
  })
})

describe('resolveNight', () => {
  test('o mais votado pelos infiltrados vai para casa', () => {
    const r = resolveNight([
      action('infiltrators', 'i1', 'x'),
      action('infiltrators', 'i2', 'x'),
      action('infiltrators', 'i3', 'y'),
    ])
    expect(r.killed_player_id).toBe('x')
    expect(r.saved).toBe(false)
  })

  test('em empate vale o voto mais antigo', () => {
    const r = resolveNight([
      action('infiltrators', 'i1', 'x', '2026-01-01T00:00:05Z'),
      action('infiltrators', 'i2', 'y', '2026-01-01T00:00:01Z'),
    ])
    expect(r.killed_player_id).toBe('y')
  })

  test('o Conselheiro salva o alvo', () => {
    const r = resolveNight([action('infiltrators', 'i1', 'x'), action('guardian', 'g1', 'x')])
    expect(r.saved).toBe(true)
    expect(r.killed_player_id).toBeNull()
  })

  test('com dois Conselheiros basta um proteger o alvo', () => {
    const r = resolveNight([
      action('infiltrators', 'i1', 'x'),
      action('guardian', 'g1', 'y'),
      action('guardian', 'g2', 'x'),
    ])
    expect(r.saved).toBe(true)
    expect(r.killed_player_id).toBeNull()
    expect(r.guardian_target_id).toBe('x')
  })

  test('sem votos ninguém vai para casa', () => {
    const r = resolveNight([action('guardian', 'g1', 'x')])
    expect(r.sabotage_target_id).toBeNull()
    expect(r.killed_player_id).toBeNull()
    expect(r.saved).toBe(false)
  })
})

describe('tallyVotes', () => {
  test('maioria simples', () => {
    const r = tallyVotes([vote('a', 'x'), vote('b', 'x'), vote('c', 'y')], null)
    expect(r.winner_id).toBe('x')
    expect(r.mayor_tiebreak_used).toBe(false)
  })

  test('empate sem Diretor: ninguém sai', () => {
    expect(tallyVotes([vote('a', 'x'), vote('b', 'y')], null).winner_id).toBeNull()
  })

  test('o Diretor desempata se votou num dos empatados', () => {
    const r = tallyVotes([vote('a', 'x'), vote('m', 'y')], 'm')
    expect(r.winner_id).toBe('y')
    expect(r.mayor_tiebreak_used).toBe(true)
  })
})

describe('checkWinCondition', () => {
  const p = (id: string, role: 'infiltrator' | 'villager', is_alive = true) => ({ id, role, is_alive })

  test('sem infiltrados vivos ganham os desbravadores', () => {
    expect(checkWinCondition([p('i', 'infiltrator', false), p('a', 'villager')])).toBe('desbravadores')
  })

  test('infiltrados em igualdade ganham', () => {
    expect(checkWinCondition([p('i', 'infiltrator'), p('a', 'villager'), p('b', 'villager', false)])).toBe('infiltrators')
  })

  test('caso contrário o jogo continua', () => {
    expect(checkWinCondition([p('i', 'infiltrator'), p('a', 'villager'), p('b', 'villager')])).toBeNull()
  })
})
