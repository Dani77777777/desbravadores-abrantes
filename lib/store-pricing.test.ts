import { expect, test } from 'bun:test'
import {
  amountDueFor,
  computePurchasePricing,
  nextVolumeTier,
  pricingFor,
  volumeTiersLabel,
  withPriceQuotes,
} from './store-pricing'

// Anilha: 5,00 €, custo 2,50 €, Gold até 50%. Taxa 10 🪙 por €.
const anilha = { type: 'physical', price_eur: 5, cost_price: 2.5, max_discount_percent: 50, stock: 50 }
const RATE = 10
const RICH = 100_000

test('exemplo da anilha: 10 unidades → mínimo a pagar = custo', () => {
  const p = computePurchasePricing(anilha, 10, RICH, RATE)
  expect(p.baseEur).toBe(50)
  expect(p.volumePercent).toBe(10)
  expect(p.volumeEur).toBe(5)
  expect(p.priceAfterVolume).toBe(45)
  expect(p.goldCapEur).toBe(20)
  expect(p.goldLimitedByCost).toBe(true)
  expect(p.userGoldMaxEur).toBe(20)
  expect(amountDueFor(p, p.userGoldMaxEur)).toBe(25)
})

test('sem Gold (convidado): só o desconto por quantidade', () => {
  const p = computePurchasePricing(anilha, 5, null, RATE)
  expect(p.baseEur).toBe(25)
  expect(p.volumePercent).toBe(5)
  expect(p.volumeEur).toBe(1.25)
  expect(p.userGoldMaxEur).toBe(0)
  expect(amountDueFor(p, 0)).toBe(23.75)
})

test('menos de 5 unidades: sem desconto por quantidade', () => {
  const p = computePurchasePricing(anilha, 4, RICH, RATE)
  expect(p.volumePercent).toBe(0)
  expect(p.volumeEur).toBe(0)
  expect(p.priceAfterVolume).toBe(20)
  // 50% de 20 = 10, mas 20 − custo 10 = 10 → igual.
  expect(p.goldCapEur).toBe(10)
})

test('5 unidades com Gold máximo', () => {
  const p = computePurchasePricing(anilha, 5, RICH, RATE)
  // base 25 → 23,75; Gold = min(12,50; 23,75 − 12,50 = 11,25) = 11,25
  expect(p.goldCapEur).toBe(11.25)
  expect(amountDueFor(p, p.userGoldMaxEur)).toBe(12.5)
})

test('Gold parcial: limitado pelo Gold que o membro tem', () => {
  const p = computePurchasePricing(anilha, 10, 75, RATE) // 75 🪙 = 7,50 €
  expect(p.userGoldMaxEur).toBe(7.5)
  expect(amountDueFor(p, 7.5)).toBe(37.5)
  expect(amountDueFor(p, 3)).toBe(42)
})

test('Gold pedido acima do teto é cortado no total', () => {
  const p = computePurchasePricing(anilha, 10, RICH, RATE)
  expect(amountDueFor(p, 999)).toBe(25)
})

test('artigo sem custo: sem desconto por quantidade, Gold como antes', () => {
  const semCusto = { ...anilha, cost_price: null }
  const p = computePurchasePricing(semCusto, 10, RICH, RATE)
  expect(p.volumePercent).toBe(0)
  expect(p.volumeEur).toBe(0)
  expect(p.costTotal).toBeNull()
  expect(p.goldCapEur).toBe(25) // 50% de 50 €
  expect(p.goldLimitedByCost).toBe(false)
  expect(amountDueFor(p, p.userGoldMaxEur)).toBe(25)
  expect(volumeTiersLabel(semCusto)).toBeNull()
  expect(nextVolumeTier(semCusto, 3)).toBeNull()
})

test('artigo digital: nunca tem desconto por quantidade, mas o custo limita o Gold', () => {
  const digital = { type: 'digital', price_eur: 10, cost_price: 8, max_discount_percent: 50 }
  const p = computePurchasePricing(digital, 1, RICH, RATE)
  expect(p.volumePercent).toBe(0)
  expect(p.goldCapEur).toBe(2)
  expect(volumeTiersLabel(digital)).toBeNull()
  // Mesmo que chegasse com 10 unidades, não há desconto por quantidade.
  expect(computePurchasePricing(digital, 10, RICH, RATE).volumeEur).toBe(0)
})

test('custo perto do preço: o desconto por quantidade é cortado ao custo', () => {
  const caro = { type: 'physical', price_eur: 5, cost_price: 4.8, max_discount_percent: 50, stock: 20 }
  const p = computePurchasePricing(caro, 10, RICH, RATE)
  expect(p.volumeEur).toBe(2) // 10% seria 5 €, mas só há 2 € de margem
  expect(p.priceAfterVolume).toBe(48)
  expect(p.goldCapEur).toBe(0)
})

test('custo acima do preço: sem descontos', () => {
  const p = computePurchasePricing({ ...anilha, cost_price: 6 }, 10, RICH, RATE)
  expect(p.volumeEur).toBe(0)
  expect(p.volumePercent).toBe(0)
  expect(p.goldCapEur).toBe(0)
})

test('o total nunca fica abaixo do custo (varrimento)', () => {
  for (let price = 0.5; price <= 20; price += 0.35) {
    for (let cost = 0; cost <= price * 1.1; cost += 0.27) {
      for (const pct of [0, 10, 25, 50, 100]) {
        for (let qty = 1; qty <= 10; qty++) {
          const product = { type: 'physical', price_eur: Math.round(price * 100) / 100, cost_price: Math.round(cost * 100) / 100, max_discount_percent: pct, stock: 10 }
          const p = computePurchasePricing(product, qty, RICH, RATE)
          const due = amountDueFor(p, p.userGoldMaxEur)
          const minimum = Math.min(p.baseEur, p.costTotal!)
          expect(due).toBeGreaterThanOrEqual(minimum - 1e-9)
          // Tudo em cêntimos certos.
          for (const v of [p.volumeEur, p.priceAfterVolume, p.goldCapEur, due]) {
            expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-6)
          }
        }
      }
    }
  }
})

test('dica do próximo escalão só quando falta pouco e cabe no stock', () => {
  expect(nextVolumeTier(anilha, 2)).toBeNull()
  expect(nextVolumeTier(anilha, 3)).toEqual({ unitsMissing: 2, percent: 5 })
  expect(nextVolumeTier(anilha, 4)).toEqual({ unitsMissing: 1, percent: 5 })
  expect(nextVolumeTier(anilha, 5)).toBeNull()
  expect(nextVolumeTier(anilha, 8)).toEqual({ unitsMissing: 2, percent: 10 })
  expect(nextVolumeTier(anilha, 10)).toBeNull()
  // Só 6 em stock: nunca chega aos 10.
  expect(nextVolumeTier({ ...anilha, stock: 6 }, 8)).toBeNull()
})

test('etiqueta do cartão', () => {
  expect(volumeTiersLabel(anilha)).toBe('5+ un.: −5% · 10 un.: −10%')
  expect(volumeTiersLabel({ ...anilha, stock: 7 })).toBe('5+ un.: −5%')
  expect(volumeTiersLabel({ ...anilha, stock: 3 })).toBeNull()
  expect(volumeTiersLabel({ ...anilha, stock: 0, is_preorder: true })).toBe('5+ un.: −5% · 10 un.: −10%')
})

// O browser não recebe o custo: a página calcula as cotações no servidor.
test('cotações do servidor = cálculo com o custo, sem o custo', () => {
  const products = [
    anilha,
    { ...anilha, cost_price: null },
    { ...anilha, cost_price: 4.8 },
    { type: 'physical', price_eur: 3, cost_price: 1, max_discount_percent: 100, stock: 0, is_preorder: true },
    { type: 'digital', price_eur: 10, cost_price: 8, max_discount_percent: 50 },
  ]
  for (const product of products) {
    const quoted = withPriceQuotes(product)
    expect('cost_price' in quoted).toBe(false)
    expect(JSON.stringify(quoted)).not.toContain('costTotal')
    for (let qty = 1; qty <= quoted.price_quotes.length; qty++) {
      for (const gold of [null, 0, 15, 75, RICH]) {
        const expected: Record<string, unknown> = { ...computePurchasePricing(product, qty, gold, RATE) }
        delete expected.costTotal
        expect(pricingFor(quoted, qty, gold, RATE) as Record<string, unknown>).toEqual(expected)
      }
    }
    // Dicas e etiquetas continuam iguais sem o custo.
    expect(volumeTiersLabel(quoted)).toBe(volumeTiersLabel(product))
    for (let qty = 1; qty <= 10; qty++) expect(nextVolumeTier(quoted, qty)).toEqual(nextVolumeTier(product, qty))
  }
})

test('digitais: só a cotação de 1 unidade', () => {
  expect(withPriceQuotes({ type: 'digital', price_eur: 10, cost_price: 8, max_discount_percent: 50 }).price_quotes).toHaveLength(1)
  expect(withPriceQuotes(anilha).price_quotes).toHaveLength(10)
})
