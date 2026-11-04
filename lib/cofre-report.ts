// =============================================
// Cofre — dados do relatório (página de impressão e exportação para Excel).
// Só no servidor, com o cliente da sessão: a RLS e as funções só deixam passar
// a coordenação real. Valores em cêntimos inteiros (ver lib/cofre.ts).
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isIsoDate, monthRange, signedCents, summarize, toCents,
  type CashMovement, type CashMovementKind, type CofreTotals, type HolderBalance,
} from './cofre'

export interface StoreSummaryRow {
  productName: string
  units: number
  listCents: number
  goldDiscountCents: number
  volumeDiscountCents: number
  receivedCents: number
  costCents: number | null
  marginCents: number | null
}

export interface ReportMovement extends CashMovement {
  signedCents: number
  reversed: boolean
  holderName: string
  createdByName: string
  purchaseRef: string | null
}

export interface CofreReport {
  from: string
  to: string
  movements: ReportMovement[]
  totals: CofreTotals
  store: StoreSummaryRow[]
  storeTotals: Omit<StoreSummaryRow, 'productName' | 'costCents' | 'marginCents'> & { costCents: number; marginCents: number; withoutCost: number }
  holders: { name: string; totalCents: number; cashCents: number; accountCents: number }[]
  inHandCents: number
}

/** Período pedido na URL (?from=&to=), ou o mês atual de Lisboa. */
export function parsePeriod(params: { from?: string; to?: string }, today: string): { from: string; to: string } {
  const month = monthRange(today)
  let from = isIsoDate(params.from) ? params.from : month.from
  let to = isIsoDate(params.to) ? params.to : month.to
  if (from > to) [from, to] = [to, from]
  return { from, to }
}

export async function loadCofreReport(supabase: SupabaseClient, from: string, to: string): Promise<CofreReport> {
  // Todos os movimentos (precisamos dos originais dos estornos para o sinal).
  const all: CashMovement[] = []
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase
      .from('club_cash_movements')
      .select('*')
      .order('occurred_on', { ascending: true })
      .order('created_at', { ascending: true })
      .range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(error.message)
    all.push(...(data as CashMovement[]))
    if (!data || data.length < 1000) break
  }
  const byId = new Map(all.map(m => [m.id, m]))
  const reversedIds = new Set(all.filter(m => m.reverses_id).map(m => m.reverses_id!))

  const [{ data: people }, { data: balances, error: balErr }, { data: summary, error: sumErr }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'coordenador'),
    supabase.from('cofre_em_mao').select('*'),
    supabase.rpc('cofre_store_summary', { p_from: from, p_to: to }),
  ])
  if (balErr) throw new Error(balErr.message)
  if (sumErr) throw new Error(sumErr.message)

  const names = new Map<string, string>((people || []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name || 'Coordenador']))
  const nameOf = (id: string | null) => (id ? names.get(id) || 'Coordenador' : '—')

  const inPeriod = all.filter(m => m.occurred_on >= from && m.occurred_on <= to)
  const movements: ReportMovement[] = inPeriod.map(m => ({
    ...m,
    signedCents: signedCents(m, byId),
    reversed: reversedIds.has(m.id),
    holderName: nameOf(m.holder_id),
    createdByName: nameOf(m.created_by),
    purchaseRef: /^DA-\d+/.exec(m.description)?.[0] ?? null,
  }))

  const store: StoreSummaryRow[] = (summary || []).map((r: any) => ({
    productName: r.product_name,
    units: Number(r.units) || 0,
    listCents: toCents(r.list_eur),
    goldDiscountCents: toCents(r.gold_discount_eur),
    volumeDiscountCents: toCents(r.volume_discount_eur),
    receivedCents: toCents(r.received_eur),
    costCents: r.cost_eur === null ? null : toCents(r.cost_eur),
    marginCents: r.margin_eur === null ? null : toCents(r.margin_eur),
  }))
  const sum = (f: (r: StoreSummaryRow) => number) => store.reduce((acc, r) => acc + f(r), 0)
  const storeTotals = {
    units: sum(r => r.units),
    listCents: sum(r => r.listCents),
    goldDiscountCents: sum(r => r.goldDiscountCents),
    volumeDiscountCents: sum(r => r.volumeDiscountCents),
    receivedCents: sum(r => r.receivedCents),
    costCents: sum(r => r.costCents ?? 0),
    marginCents: sum(r => r.marginCents ?? 0),
    withoutCost: store.filter(r => r.costCents === null).length,
  }

  const holders = ((balances as HolderBalance[]) || [])
    .map(b => ({ name: b.full_name || 'Coordenador', totalCents: toCents(b.em_mao_eur), cashCents: toCents(b.em_numerario_eur), accountCents: toCents(b.na_conta_eur) }))
    .filter(h => h.totalCents !== 0 || h.cashCents !== 0 || h.accountCents !== 0)
    .sort((a, b) => b.totalCents - a.totalCents)

  return {
    from,
    to,
    movements,
    totals: summarize(inPeriod, byId),
    store,
    storeTotals,
    holders,
    inHandCents: holders.reduce((acc, h) => acc + h.totalCents, 0),
  }
}

export const KIND_ORDER: CashMovementKind[] = ['abertura', 'venda', 'entrada_outra', 'reembolso', 'despesa', 'estorno']
