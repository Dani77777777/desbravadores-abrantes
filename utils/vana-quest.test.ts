import { describe, expect, test } from 'bun:test'
import { calcSessionRewards, MAX_SESSION_GOLD, MAX_SESSION_XP } from './vana-quest'

describe('calcSessionRewards', () => {
  test('o teto é de 150 Gold + 300 XP por sessão (XP = gold × 2)', () => {
    expect(MAX_SESSION_GOLD).toBe(150)
    expect(MAX_SESSION_XP).toBe(300)
    expect(MAX_SESSION_XP).toBe(MAX_SESSION_GOLD * 2)
  })

  test('abaixo do teto cada um recebe os seus pontos arredondados', () => {
    expect(calcSessionRewards(42.4, 120)).toEqual({ gold: 42, xp: 84 })
    expect(calcSessionRewards(15.5, 120)).toEqual({ gold: 16, xp: 32 })
    expect(calcSessionRewards(120, 120)).toEqual({ gold: 120, xp: 240 })
  })

  test('o 1.º exatamente no teto não reduz ninguém', () => {
    expect(calcSessionRewards(150, 150)).toEqual({ gold: 150, xp: 300 })
    expect(calcSessionRewards(75, 150)).toEqual({ gold: 75, xp: 150 })
  })

  test('se o 1.º passar o teto recebe o máximo e os outros descem na mesma proporção', () => {
    // 1.º com 300 pontos: tudo a metade.
    expect(calcSessionRewards(300, 300)).toEqual({ gold: MAX_SESSION_GOLD, xp: MAX_SESSION_XP })
    expect(calcSessionRewards(200, 300)).toEqual({ gold: 100, xp: 200 })
    expect(calcSessionRewards(30, 300)).toEqual({ gold: 15, xp: 30 })
    // 1.º com 600 pontos: tudo a um quarto.
    expect(calcSessionRewards(600, 600)).toEqual({ gold: 150, xp: 300 })
    expect(calcSessionRewards(100, 600)).toEqual({ gold: 25, xp: 50 })
  })

  test('ninguém recebe mais do que o teto, mesmo que o topo venha errado', () => {
    expect(calcSessionRewards(900, 0)).toEqual({ gold: 150, xp: 300 })
  })

  test('pontos a zero ou negativos não dão prémio', () => {
    expect(calcSessionRewards(0, 500)).toEqual({ gold: 0, xp: 0 })
    expect(calcSessionRewards(-20, 500)).toEqual({ gold: 0, xp: 0 })
  })
})
