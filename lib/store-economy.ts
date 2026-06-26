// Shared economy helpers for the store: turns real club data (member gold
// balances, finished-event rewards, XP levels) into fair price/level guidance.
// Used by the admin Overview panel and the product creation dialog.

export interface PriceTier {
  key: string
  label: string
  value: number
  dot: string
  text: string
}

export interface LevelBucket {
  lvl: number
  label: string
  count: number
  atOrAbove: number
}

export interface StoreEconomy {
  goldN: number
  totalGold: number
  avgGold: number
  medianGold: number
  richestGold: number
  avgGoldPerEvent: number
  monthlyIncome: number
  weeklyIncome: number
  percentileGold: (p: number) => number
  affordCount: (price: number) => number
  weeksToSave: (price: number) => number | null
  priceTiers: PriceTier[]
  levelOf: (xp: number) => number
  levelBuckets: LevelBucket[]
  atOrAboveLevel: (lvl: number) => number
  maxBucket: number
}

const LEVEL_CAP = 5

// Nível = 1000 XP por nível (igual à loja e ao perfil).
export const levelOf = (xp: number) => Math.floor((xp || 0) / 1000) + 1

export function computeStoreEconomy(members: any[], events: any[]): StoreEconomy {
  // Gold distribution (current balances) → suggests fair price points.
  const sortedGold = members.map(m => m.current_gold || 0).sort((a, b) => a - b)
  const goldN = sortedGold.length
  const totalGold = sortedGold.reduce((acc, g) => acc + g, 0)

  const percentileGold = (p: number) => {
    if (goldN === 0) return 0
    const idx = Math.min(goldN - 1, Math.max(0, Math.round((p / 100) * (goldN - 1))))
    return sortedGold[idx]
  }
  const avgGold = goldN > 0 ? Math.round(totalGold / goldN) : 0
  const medianGold = percentileGold(50)
  const richestGold = goldN > 0 ? sortedGold[goldN - 1] : 0
  const affordCount = (price: number) => sortedGold.filter(g => g >= price).length

  // Earning rate → how long it takes to save up for an item.
  const finishedEvents = events.filter(e => e.is_finished)
  const avgGoldPerEvent = finishedEvents.length > 0
    ? Math.round(finishedEvents.reduce((acc, e) => acc + (e.gold_reward || 0), 0) / finishedEvents.length)
    : 0
  const last30 = new Date(); last30.setDate(last30.getDate() - 30)
  const monthlyIncome = finishedEvents
    .filter(e => new Date(e.start_at) >= last30)
    .reduce((acc, e) => acc + (e.gold_reward || 0), 0)
  const weeklyIncome = monthlyIncome / 4
  const weeksToSave = (price: number) => (weeklyIncome > 0 ? Math.max(1, Math.ceil(price / weeklyIncome)) : null)

  // Suggested price tiers (priced at a percentile → that % roughly can't afford it).
  const priceTiers: PriceTier[] = [
    { key: 'acessivel', label: 'Acessível', value: percentileGold(25), dot: 'bg-emerald-500', text: 'text-emerald-600' },
    { key: 'equilibrado', label: 'Equilibrado', value: percentileGold(50), dot: 'bg-blue-500', text: 'text-blue-600' },
    { key: 'premium', label: 'Premium', value: percentileGold(75), dot: 'bg-amber-500', text: 'text-amber-600' },
    { key: 'exclusivo', label: 'Exclusivo', value: percentileGold(90), dot: 'bg-rose-500', text: 'text-rose-600' },
  ]

  // Level distribution → informs the "nível mínimo" of an item.
  const memberLevels = members.map(m => levelOf(m.total_xp))
  const atOrAboveLevel = (lvl: number) => memberLevels.filter(l => l >= lvl).length
  const levelBuckets: LevelBucket[] = Array.from({ length: LEVEL_CAP }, (_, i) => {
    const lvl = i + 1
    const isLast = lvl === LEVEL_CAP
    const count = memberLevels.filter(l => (isLast ? l >= lvl : l === lvl)).length
    return { lvl, label: isLast ? `${lvl}+` : `${lvl}`, count, atOrAbove: atOrAboveLevel(lvl) }
  })
  const maxBucket = Math.max(1, ...levelBuckets.map(b => b.count))

  return {
    goldN, totalGold, avgGold, medianGold, richestGold,
    avgGoldPerEvent, monthlyIncome, weeklyIncome,
    percentileGold, affordCount, weeksToSave, priceTiers,
    levelOf, levelBuckets, atOrAboveLevel, maxBucket,
  }
}
