// ---------------------------------------------------------------------------
// Loja — preço de uma encomenda: desconto por quantidade + desconto Gold.
// Esta função só serve a pré-visualização no browser; o valor que conta é o
// do servidor (RPC process_purchase em supabase-migration-store-volume-discount.sql),
// que repete estas regras.
//
// 1. base = preço unitário × quantidade
// 2. desconto por quantidade (só artigos físicos com custo definido)
// 3. Gold até min(teto% × base, preço com volume − custo total)
// 4. o total nunca fica abaixo do custo total
// Sem custo definido: sem desconto por quantidade e o Gold funciona como antes.
// ---------------------------------------------------------------------------

// Escalões do desconto por quantidade (por encomenda, unidades do mesmo artigo).
// ATENÇÃO: manter igual a public.store_volume_discount_percent no Supabase.
export const VOLUME_DISCOUNT_TIERS: readonly { minQty: number; percent: number }[] = [
  { minQty: 5, percent: 5 },
  { minQty: 10, percent: 10 },
]

// Mostrar a dica "Mais N unidades para X%" quando faltam no máximo estas unidades.
export const VOLUME_HINT_UNITS = 2

// Limite de unidades por encomenda (igual ao do servidor).
export const MAX_QTY_PER_ORDER = 10

type PricedProduct = {
  type?: string
  price_eur?: number | string | null
  cost_price?: number | string | null
  max_discount_percent?: number | null
  is_preorder?: boolean | null
  stock?: number | null
}

// Arredonda a cêntimos (o EPSILON evita 2.675 → 2.67 por erros de vírgula flutuante).
export const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const hasCostPrice = (product: PricedProduct) =>
  product.cost_price !== null && product.cost_price !== undefined && product.cost_price !== '' &&
  Number.isFinite(Number(product.cost_price))

const isVolumeEligible = (product: PricedProduct) => product.type !== 'digital' && hasCostPrice(product)

// Máximo de unidades numa encomenda: até 10, cortado pelo stock; por encomenda sem stock; digitais sempre 1.
export const maxQuantityFor = (product: PricedProduct) => {
  if (product.type === 'digital') return 1
  if (product.type === 'physical' && product.is_preorder) return MAX_QTY_PER_ORDER
  return Math.max(1, Math.min(MAX_QTY_PER_ORDER, product.stock || 0))
}

// % do escalão para esta quantidade (0 abaixo do primeiro escalão).
export const volumeTierPercent = (quantity: number) =>
  VOLUME_DISCOUNT_TIERS.reduce((pct, tier) => (quantity >= tier.minQty ? Math.max(pct, tier.percent) : pct), 0)

export interface PurchasePricing {
  baseEur: number
  volumePercent: number
  volumeEur: number
  priceAfterVolume: number
  costTotal: number | null
  // Teto do Gold para o artigo (sem contar com o Gold do utilizador).
  goldCapEur: number
  // O teto ficou mais baixo por causa do custo.
  goldLimitedByCost: boolean
  // Máximo que este utilizador pode descontar (0 para convidados).
  userGoldMaxEur: number
}

export function computePurchasePricing(
  product: PricedProduct,
  quantity: number,
  // null = convidado (sem Gold)
  userGold: number | null,
  goldPerEuro: number,
): PurchasePricing {
  const qty = Math.max(1, Math.floor(quantity || 1))
  const baseEur = toCents(Number(product.price_eur || 0) * qty)
  const costTotal = hasCostPrice(product) ? toCents(Number(product.cost_price) * qty) : null

  let volumePercent = isVolumeEligible(product) ? volumeTierPercent(qty) : 0
  let volumeEur = toCents(baseEur * volumePercent / 100)
  // O desconto por quantidade também não pode levar o preço abaixo do custo.
  if (costTotal !== null) volumeEur = Math.min(volumeEur, Math.max(0, toCents(baseEur - costTotal)))
  if (volumeEur <= 0) {
    volumeEur = 0
    volumePercent = 0
  }
  const priceAfterVolume = toCents(baseEur - volumeEur)

  const percentCap = toCents(baseEur * (product.max_discount_percent || 0) / 100)
  const costCap = costTotal === null ? Infinity : Math.max(0, toCents(priceAfterVolume - costTotal))
  const goldCapEur = Math.min(percentCap, costCap)

  const affordable = userGold === null ? 0 : Math.floor(((userGold || 0) / (goldPerEuro || 1)) * 100) / 100
  const userGoldMaxEur = Math.max(0, Math.min(goldCapEur, affordable))

  return {
    baseEur,
    volumePercent,
    volumeEur,
    priceAfterVolume,
    costTotal,
    goldCapEur,
    goldLimitedByCost: costCap < percentCap,
    userGoldMaxEur,
  }
}

// Total a pagar em dinheiro para um desconto Gold escolhido (cortado ao teto).
export const amountDueFor = (pricing: PurchasePricing, goldDiscountEur: number) =>
  Math.max(0, toCents(pricing.priceAfterVolume - Math.min(Math.max(0, goldDiscountEur || 0), pricing.goldCapEur)))

// Próximo escalão, se estiver perto (≤ VOLUME_HINT_UNITS) e couber no máximo de unidades.
export function nextVolumeTier(product: PricedProduct, quantity: number) {
  if (!isVolumeEligible(product)) return null
  const current = volumeTierPercent(quantity)
  const next = VOLUME_DISCOUNT_TIERS
    .filter(t => t.minQty > quantity && t.percent > current && t.minQty <= maxQuantityFor(product))
    .sort((a, b) => a.minQty - b.minQty)[0]
  if (!next) return null
  const unitsMissing = next.minQty - quantity
  return unitsMissing <= VOLUME_HINT_UNITS ? { unitsMissing, percent: next.percent } : null
}

// Etiqueta do cartão, ex.: "5+ un.: −5% · 10 un.: −10%" (só escalões possíveis com o stock atual).
export function volumeTiersLabel(product: PricedProduct) {
  if (!isVolumeEligible(product)) return null
  const maxQty = maxQuantityFor(product)
  const parts = VOLUME_DISCOUNT_TIERS
    .filter(t => t.minQty <= maxQty)
    .map(t => `${t.minQty}${t.minQty < MAX_QTY_PER_ORDER ? '+' : ''} un.: −${t.percent}%`)
  return parts.length ? parts.join(' · ') : null
}
