import { describe, expect, test } from 'bun:test'
import {
  VANATRILHA_MILAGRE_GOLD,
  VANATRILHA_PERFECT_BONUS_GOLD,
  VANATRILHA_PERFECT_BONUS_XP,
  VANATRILHA_REWARD_GOLD,
  VANATRILHA_REWARD_XP,
} from '@/types/vana-trilha'
import { dailyRewards, isPerfect } from './vana-trilha'

// Os valores têm de coincidir com public.award_vanatrilha_daily_rewards
// (supabase-migration-points-rebalance.sql), que é quem paga de facto.
describe('prémios do VanaTrilha', () => {
  test('valores do reequilíbrio: 10 pela etapa, +5 pela Jornada Perfeita, +10 Gold do Milagre', () => {
    expect(VANATRILHA_REWARD_XP).toBe(10)
    expect(VANATRILHA_REWARD_GOLD).toBe(10)
    expect(VANATRILHA_PERFECT_BONUS_XP).toBe(5)
    expect(VANATRILHA_PERFECT_BONUS_GOLD).toBe(5)
    expect(VANATRILHA_MILAGRE_GOLD).toBe(10)
  })

  test('etapa completa com erros: 10 XP + 10 Gold', () => {
    expect(dailyRewards('completed', 2, 0)).toEqual({ xp: 10, gold: 10, perfect: false, bonus_gold: 0 })
  })

  test('Jornada Perfeita (sem erros): 15 XP + 15 Gold', () => {
    expect(isPerfect('completed', 0)).toBe(true)
    expect(dailyRewards('completed', 0, 0)).toEqual({ xp: 15, gold: 15, perfect: true, bonus_gold: 0 })
  })

  test('o Milagre soma só ao Gold', () => {
    expect(dailyRewards('completed', 1, VANATRILHA_MILAGRE_GOLD)).toEqual({ xp: 10, gold: 20, perfect: false, bonus_gold: 10 })
    expect(dailyRewards('completed', 0, VANATRILHA_MILAGRE_GOLD)).toEqual({ xp: 15, gold: 25, perfect: true, bonus_gold: 10 })
  })

  test('etapa falhada ou a meio não paga nada, nem o Milagre', () => {
    expect(dailyRewards('failed', 0, VANATRILHA_MILAGRE_GOLD)).toEqual({ xp: 0, gold: 0, perfect: false, bonus_gold: 0 })
    expect(dailyRewards('in_progress', 0, 0)).toEqual({ xp: 0, gold: 0, perfect: false, bonus_gold: 0 })
    expect(isPerfect('failed', 0)).toBe(false)
  })
})
