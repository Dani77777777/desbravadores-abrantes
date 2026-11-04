// =============================================
// Cofre — registo do dinheiro do clube (docs/Cofre.md)
//
// Regra: os euros nunca se somam como floats. Tudo passa a CÊNTIMOS INTEIROS
// logo à entrada (o Supabase devolve numeric como string ou number) e só volta
// a euros para mostrar (formatCents) ou para enviar a uma RPC (centsToParam).
// =============================================

import { formatEur } from './store-economy'

export type PaymentMethod = 'numerario' | 'mbway' | 'transferencia'
export type CashMovementKind = 'venda' | 'reembolso' | 'entrada_outra' | 'despesa' | 'estorno' | 'abertura'

export interface CashMovement {
  id: string
  created_at: string
  occurred_on: string
  kind: CashMovementKind
  amount_eur: number | string
  method: PaymentMethod
  holder_id: string
  purchase_id: string | null
  description: string
  receipt_path: string | null
  created_by: string
  reverses_id: string | null
}

export interface HolderBalance {
  holder_id: string
  full_name: string | null
  avatar_url: string | null
  em_mao_eur: number | string
  em_numerario_eur: number | string
  na_conta_eur: number | string
  ultimo_movimento: string | null
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  numerario: 'Numerário',
  mbway: 'MB Way',
  transferencia: 'Transferência',
}

export const PAYMENT_METHODS: PaymentMethod[] = ['numerario', 'mbway', 'transferencia']

export const KIND_LABELS: Record<CashMovementKind, string> = {
  venda: 'Venda da loja',
  reembolso: 'Reembolso',
  entrada_outra: 'Outra entrada',
  despesa: 'Despesa',
  estorno: 'Estorno',
  abertura: 'Contagem inicial',
}

/** Euros (string ou number vindos da BD) → cêntimos inteiros. */
export function toCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Cêntimos → "12,50 €". */
export const formatCents = (cents: number) => formatEur(cents / 100)

/** Cêntimos → valor para enviar a uma RPC numeric ("12.50"), sem floats pelo meio. */
export function centsToParam(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * O que a pessoa escreve ("12,5", "12.50", "1 234,56 €") → cêntimos, ou null se não for
 * um valor válido maior que zero. Aceita vírgula ou ponto como separador decimal.
 */
export function parseEurInput(raw: string): number | null {
  let s = raw.replace(/[€\s]/g, '')
  if (!s) return null
  // "1.234,56" → separador decimal é o último , ou .
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  const decimalAt = Math.max(lastComma, lastDot)
  if (decimalAt >= 0 && s.length - decimalAt - 1 <= 2) {
    s = s.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + s.slice(decimalAt + 1)
  } else {
    s = s.replace(/[.,]/g, '')
  }
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const [int, dec = ''] = s.split('.')
  const cents = Number(int) * 100 + Number(dec.padEnd(2, '0'))
  return cents > 0 ? cents : null
}

/** Sinal de um movimento no "em mão" (igual a public.cofre_sign). */
export function movementSign(kind: CashMovementKind, reversedKind?: CashMovementKind | null): number {
  const base = (k: CashMovementKind | null | undefined) =>
    k === 'venda' || k === 'entrada_outra' || k === 'abertura' ? 1 : k === 'reembolso' || k === 'despesa' ? -1 : 0
  return kind === 'estorno' ? 0 - base(reversedKind) : base(kind)
}

/** Cêntimos com sinal de cada movimento (o estorno precisa do movimento que anula). */
export function signedCents(movement: CashMovement, byId: Map<string, CashMovement>): number {
  const reversed = movement.reverses_id ? byId.get(movement.reverses_id)?.kind : null
  return movementSign(movement.kind, reversed) * toCents(movement.amount_eur)
}

export interface CofreTotals {
  inCents: number
  outCents: number
  byKind: Record<CashMovementKind, number>
}

/** Entradas, saídas e totais por tipo (com sinal) de uma lista de movimentos. */
export function summarize(movements: CashMovement[], byId: Map<string, CashMovement>): CofreTotals {
  const byKind = { venda: 0, reembolso: 0, entrada_outra: 0, despesa: 0, estorno: 0, abertura: 0 } as Record<CashMovementKind, number>
  let inCents = 0
  let outCents = 0
  for (const m of movements) {
    const c = signedCents(m, byId)
    byKind[m.kind] += c
    if (c > 0) inCents += c
    else outCents += -c
  }
  return { inCents, outCents, byKind }
}

// ── Períodos (datas de Lisboa, YYYY-MM-DD) ──────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

/** Primeiro e último dia do mês de `date` (YYYY-MM-DD), com `offset` meses. */
export function monthRange(date: string, offset = 0): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + offset, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return { from: fmt(first), to: fmt(last) }
}

export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

/** "2026-11-04" → "04/11/2026" */
export const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Nome legível de um período: "novembro de 2026" ou "01/10/2026 a 15/11/2026". */
export function periodLabel(from: string, to: string): string {
  const whole = monthRange(from)
  if (whole.from === from && whole.to === to) {
    const [y, m] = from.split('-').map(Number)
    return `${MONTHS[m - 1]} de ${y}`
  }
  return `${formatDay(from)} a ${formatDay(to)}`
}

/** Há quantos dias (texto curto) a partir de um timestamp. */
export function sinceLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000))
  return days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`
}

// ── Comprovativos ───────────────────────────────────────────────────────────

export const RECEIPT_BUCKET = 'cofre-comprovativos'
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024
export const RECEIPT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}
