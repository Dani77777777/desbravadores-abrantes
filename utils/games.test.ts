// Testes das regras puras do multiplicador de pontos. Correr com `bun test`.

import { describe, expect, test } from 'bun:test'
import {
  GAMES,
  defaultGameSetting,
  formatMultiplier,
  multiplierStatus,
  normalizeGameSetting,
  type GameSetting,
} from './games'

const NOW = new Date('2026-09-20T12:00:00Z')
const hours = (n: number) => new Date(NOW.getTime() + n * 3600_000).toISOString()

function setting(patch: Partial<GameSetting>): GameSetting {
  return { ...defaultGameSetting('vana-trilha'), ...patch }
}

describe('multiplierStatus', () => {
  test('sem campanha configurada os pontos são normais', () => {
    const s = multiplierStatus(setting({}), NOW)
    expect(s.state).toBe('off')
    expect(s.multiplier).toBe(1)
  })

  test('dentro da janela multiplica', () => {
    const s = multiplierStatus(
      setting({ points_multiplier: 2, multiplier_starts_at: hours(-1), multiplier_ends_at: hours(5) }),
      NOW,
    )
    expect(s.state).toBe('active')
    expect(s.multiplier).toBe(2)
  })

  test('antes de começar ainda não multiplica', () => {
    const s = multiplierStatus(
      setting({ points_multiplier: 3, multiplier_starts_at: hours(2), multiplier_ends_at: hours(5) }),
      NOW,
    )
    expect(s.state).toBe('scheduled')
    expect(s.multiplier).toBe(1)
    expect(s.configured).toBe(3)
  })

  test('acabada a janela volta ao normal sem ninguém desligar', () => {
    const s = multiplierStatus(
      setting({ points_multiplier: 2, multiplier_starts_at: hours(-5), multiplier_ends_at: hours(-1) }),
      NOW,
    )
    expect(s.state).toBe('expired')
    expect(s.multiplier).toBe(1)
  })

  test('janela sem fim marcado continua a valer', () => {
    const s = multiplierStatus(
      setting({ points_multiplier: 1.5, multiplier_starts_at: hours(-48), multiplier_ends_at: null }),
      NOW,
    )
    expect(s.state).toBe('active')
    expect(s.multiplier).toBe(1.5)
  })

  test('configuração em falta (migração por correr) não rebenta', () => {
    expect(multiplierStatus(undefined, NOW).multiplier).toBe(1)
    expect(multiplierStatus(null, NOW).state).toBe('off')
  })
})

describe('normalizeGameSetting', () => {
  test('linha sem as colunas do multiplicador conta como pontuação normal', () => {
    const s = normalizeGameSetting('vantur', { enabled: true, allowed_roles: ['desbravador'] })
    expect(s.points_multiplier).toBe(1)
    expect(s.multiplier_ends_at).toBeNull()
  })

  test('valores fora do intervalo são cortados', () => {
    expect(normalizeGameSetting('vantur', { points_multiplier: 99 }).points_multiplier).toBe(3)
    expect(normalizeGameSetting('vantur', { points_multiplier: 0.1 }).points_multiplier).toBe(1)
  })
})

describe('registo dos jogos', () => {
  test('formatMultiplier escreve como em português', () => {
    expect(formatMultiplier(2)).toBe('2')
    expect(formatMultiplier(1.5)).toBe('1,5')
  })

  test('os jogos ao vivo não contam como de um jogador', () => {
    const live = ['vana-quest', 'vana-words', 'vana-camp', 'vana-espada', 'vana-sketch']
    for (const id of live) {
      expect(GAMES.find((g) => g.id === id)?.singlePlayer).toBe(false)
    }
  })
})
