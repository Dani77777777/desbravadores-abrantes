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
//
// O custo (cost_price) não chega ao browser: a página da Loja (servidor) calcula
// com computePurchasePricing e manda só as cotações por quantidade
// (withPriceQuotes); os componentes usam pricingFor.
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
  // Vêm do servidor em vez do custo (ver withPriceQuotes).
  volume_eligible?: boolean
  price_quotes?: PriceQuote[]
}

// Arredonda a cêntimos (o EPSILON evita 2.675 → 2.67 por erros de vírgula flutuante).
export const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const hasCostPrice = (product: PricedProduct) =>
  product.cost_price !== null && product.cost_price !== undefined && product.cost_price !== '' &&
  Number.isFinite(Number(product.cost_price))

const isVolumeEligible = (product: PricedProduct) =>
  product.type !== 'digital' && (product.volume_eligible ?? hasCostPrice(product))

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

// Cotação de uma quantidade sem nada que revele o custo nem dependa do utilizador.
export type PriceQuote = Omit<PurchasePricing, 'costTotal' | 'userGoldMaxEur'>

const toQuote = (p: PurchasePricing): PriceQuote => ({
  baseEur: p.baseEur,
  volumePercent: p.volumePercent,
  volumeEur: p.volumeEur,
  priceAfterVolume: p.priceAfterVolume,
  goldCapEur: p.goldCapEur,
  goldLimitedByCost: p.goldLimitedByCost,
})

// Servidor: troca cost_price pelas cotações de 1 até ao máximo de unidades
// (price_quotes[qty - 1]) e pela indicação de desconto por quantidade.
export function withPriceQuotes<T extends PricedProduct>(product: T): Omit<T, 'cost_price'> & { volume_eligible: boolean; price_quotes: PriceQuote[] } {
  const rest: Omit<T, 'cost_price'> & { cost_price?: unknown } = { ...product }
  delete rest.cost_price
  const maxQty = product.type === 'digital' ? 1 : MAX_QTY_PER_ORDER
  return {
    ...rest,
    volume_eligible: isVolumeEligible(product),
    price_quotes: Array.from({ length: maxQty }, (_, i) => toQuote(computePurchasePricing(product, i + 1, null, 1))),
  }
}

// Browser: preço de uma quantidade a partir das cotações do servidor (ou do custo,
// se o produto o tiver, como nos testes e na gestão).
export function pricingFor(
  product: PricedProduct,
  quantity: number,
  userGold: number | null,
  goldPerEuro: number,
): Omit<PurchasePricing, 'costTotal'> {
  const quotes = product.price_quotes
  if (!quotes?.length) {
    const pricing = computePurchasePricing(product, quantity, userGold, goldPerEuro)
    return { ...toQuote(pricing), userGoldMaxEur: pricing.userGoldMaxEur }
  }
  const qty = Math.min(quotes.length, Math.max(1, Math.floor(quantity || 1)))
  const quote = quotes[qty - 1]
  const affordable = userGold === null ? 0 : Math.floor(((userGold || 0) / (goldPerEuro || 1)) * 100) / 100
  return { ...quote, userGoldMaxEur: Math.max(0, Math.min(quote.goldCapEur, affordable)) }
}

// Total a pagar em dinheiro para um desconto Gold escolhido (cortado ao teto).
export const amountDueFor = (pricing: Pick<PurchasePricing, 'priceAfterVolume' | 'goldCapEur'>, goldDiscountEur: number) =>
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
