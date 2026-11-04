'use client'

// Cofre: quem tem dinheiro do clube, movimentos, despesas, entradas e estornos.
// Só coordenação real (a página não carrega isto para mais ninguém e a RLS idem).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Vault, Wallet, ArrowDownLeft, ArrowUpRight, Plus, Minus, ClipboardCheck, FileSpreadsheet, Printer,
  Paperclip, Undo2, AlertTriangle, ChevronRight, Banknote, Smartphone, Info,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { displayFont } from '@/components/landing/fonts'
import {
  KIND_LABELS, METHOD_LABELS, RECEIPT_BUCKET, formatCents, formatDay, monthRange, periodLabel, signedCents,
  sinceLabel, summarize, toCents, type CashMovement, type CashMovementKind, type HolderBalance,
} from '@/lib/cofre'
import { MovementDialog, type ManualKind } from './MovementDialog'
import { ReverseDialog } from './ReverseDialog'
import { coordinatorName, type Coordinator } from './fields'

const D = displayFont.className

type Period = 'this' | 'last' | 'all' | 'custom'

const KIND_STYLES: Record<CashMovementKind, string> = {
  venda: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  entrada_outra: 'bg-teal-50 text-teal-700 ring-teal-200',
  abertura: 'bg-blue-50 text-blue-700 ring-blue-200',
  despesa: 'bg-rose-50 text-rose-700 ring-rose-200',
  reembolso: 'bg-orange-50 text-orange-700 ring-orange-200',
  estorno: 'bg-stone-100 text-stone-600 ring-stone-200',
}

const REVERSIBLE: CashMovementKind[] = ['despesa', 'entrada_outra', 'abertura']

interface CofrePanelProps {
  movements: CashMovement[]
  balances: HolderBalance[]
  coordinators: Coordinator[]
  currentUserId: string
  today: string
  unregisteredPaidCount: number
}

export function CofrePanel({ movements, balances, coordinators, currentUserId, today, unregisteredPaidCount }: CofrePanelProps) {
  const supabase = createClient()
  const [dialog, setDialog] = useState<ManualKind | null>(null)
  const [reversing, setReversing] = useState<CashMovement | null>(null)
  const [period, setPeriod] = useState<Period>('this')
  const [customFrom, setCustomFrom] = useState(monthRange(today).from)
  const [customTo, setCustomTo] = useState(today)
  const [kindFilter, setKindFilter] = useState<CashMovementKind | 'all'>('all')
  const [holderFilter, setHolderFilter] = useState<string>('all')
  const [now] = useState(() => Date.now())

  const byId = useMemo(() => new Map(movements.map(m => [m.id, m])), [movements])
  const reversalOf = useMemo(() => {
    const map = new Map<string, CashMovement>()
    for (const m of movements) if (m.reverses_id) map.set(m.reverses_id, m)
    return map
  }, [movements])

  const name = (id: string) => coordinatorName(coordinators, id)

  // ── Saldos ────────────────────────────────────────────────────────────────
  const holders = balances
    .map(b => ({ ...b, total: toCents(b.em_mao_eur), cash: toCents(b.em_numerario_eur), account: toCents(b.na_conta_eur) }))
    .filter(b => b.total !== 0 || b.cash !== 0 || b.account !== 0)
    .sort((a, b) => Number(b.holder_id === currentUserId) - Number(a.holder_id === currentUserId) || b.total - a.total)
  const totalInHand = holders.reduce((acc, h) => acc + h.total, 0)

  const thisMonth = monthRange(today)
  const monthTotals = summarize(movements.filter(m => m.occurred_on >= thisMonth.from && m.occurred_on <= thisMonth.to), byId)

  const hasOpening = movements.some(m => m.kind === 'abertura' && m.holder_id === currentUserId && !reversalOf.has(m.id))

  // ── Filtros ───────────────────────────────────────────────────────────────
  const earliest = movements.reduce((min, m) => (m.occurred_on < min ? m.occurred_on : min), today)
  const range = period === 'this' ? thisMonth
    : period === 'last' ? monthRange(today, -1)
    : period === 'all' ? { from: earliest, to: today }
    : { from: customFrom <= customTo ? customFrom : customTo, to: customFrom <= customTo ? customTo : customFrom }

  const filtered = movements
    .filter(m => m.occurred_on >= range.from && m.occurred_on <= range.to)
    .filter(m => kindFilter === 'all' || m.kind === kindFilter)
    .filter(m => holderFilter === 'all' || m.holder_id === holderFilter)
  const filteredIds = new Set(filtered.map(m => m.id))
  // Um estorno aparece por baixo do movimento que anula (se este estiver na lista).
  const rows = filtered
    .filter(m => !(m.reverses_id && filteredIds.has(m.reverses_id)))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at))
  const periodTotals = summarize(filtered, byId)

  const query = `from=${range.from}&to=${range.to}`

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 120)
    if (error || !data?.signedUrl) return toast.error('Não foi possível abrir o comprovativo.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const holderOptions = Array.from(new Set(movements.map(m => m.holder_id)))

  return (
    <div className="space-y-6 pb-24 sm:pb-0">
      {/* ── Cabeçalho ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[2rem] bg-blue-950 p-5 text-white shadow-xl shadow-blue-950/20 sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(45% 70% at 100% 0%, rgba(16,185,129,.22), transparent 70%), radial-gradient(40% 60% at 0% 100%, rgba(20,184,166,.25), transparent 70%)' }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-300">
              <Vault className="h-4 w-4" /> Cofre
            </p>
            <h2 className={`${D} mt-1 text-3xl font-extrabold leading-none sm:text-4xl`}>Dinheiro do clube</h2>
            <p className="mt-2 max-w-xl text-sm text-blue-100/70">
              Quem tem dinheiro do clube na mão, de onde veio e para onde foi. Nada se apaga: os enganos corrigem-se com um estorno.
            </p>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HeaderStat icon={Wallet} tone="from-emerald-500 to-teal-700" label="Em mão (total)" value={formatCents(totalInHand)}
            sub={holders.length ? `${holders.length} ${holders.length === 1 ? 'coordenador' : 'coordenadores'}` : 'ninguém tem dinheiro do clube'} />
          <HeaderStat icon={ArrowDownLeft} tone="from-sky-500 to-blue-700" label="Entrou este mês" value={formatCents(monthTotals.inCents)}
            sub={`vendas ${formatCents(monthTotals.byKind.venda)}`} />
          <HeaderStat icon={ArrowUpRight} tone="from-rose-500 to-pink-700" label="Saiu este mês" value={formatCents(monthTotals.outCents)}
            sub={`despesas ${formatCents(-monthTotals.byKind.despesa)} · reembolsos ${formatCents(-monthTotals.byKind.reembolso)}`} />
        </div>
      </section>

      {/* ── Avisos ──────────────────────────────────────────────── */}
      {(unregisteredPaidCount > 0 || !hasOpening) && (
        <div className="grid gap-3 md:grid-cols-2">
          {unregisteredPaidCount > 0 && (
            <Link href="/admin?tab=store" className="group flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {unregisteredPaidCount} {unregisteredPaidCount === 1 ? 'encomenda paga' : 'encomendas pagas'} sem registo de quem recebeu
                </p>
                <p className="text-sm text-amber-800/80">Foram pagas antes do Cofre. Na Loja, indica quem recebeu o dinheiro e se ainda o tem.</p>
              </div>
              <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
          {!hasOpening && (
            <div className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4 text-blue-950 ring-1 ring-inset ring-blue-200">
              <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Ainda não fizeste a tua contagem inicial</p>
                <p className="text-sm text-blue-900/70">Se já tens dinheiro do clube contigo, conta-o e regista-o uma vez para o Cofre começar certo.</p>
                <Button size="sm" className="mt-2 h-8 bg-blue-950 hover:bg-blue-900" onClick={() => setDialog('abertura')}>
                  Fazer a contagem
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Ações ───────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 backdrop-blur sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2">
          <Button onClick={() => setDialog('despesa')} className="h-10 flex-1 gap-1.5 bg-rose-600 hover:bg-rose-700 sm:flex-none">
            <Minus className="h-4 w-4" /> Despesa
          </Button>
          <Button onClick={() => setDialog('entrada_outra')} className="h-10 flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 sm:flex-none">
            <Plus className="h-4 w-4" /> Outra entrada
          </Button>
          <Button asChild variant="outline" className="h-10 gap-1.5">
            <Link href={`/admin/cofre/relatorio?${query}`}><Printer className="h-4 w-4" /> <span className="hidden sm:inline">Relatório</span></Link>
          </Button>
          <Button asChild variant="outline" className="h-10 gap-1.5">
            <a href={`/admin/cofre/exportar?${query}`}><FileSpreadsheet className="h-4 w-4" /> <span className="hidden sm:inline">Exportar Excel</span></a>
          </Button>
        </div>
      </div>

      {/* ── Quem tem dinheiro do clube ──────────────────────────── */}
      <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
        <SectionTitle icon={Wallet} iconClass="bg-emerald-600" title="Quem tem dinheiro do clube"
          subtitle="Em numerário ou na conta pessoal. O dinheiro sai daqui com despesas e reembolsos." />
        {holders.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">Ninguém tem dinheiro do clube registado no Cofre.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {holders.map(h => {
              const mine = h.holder_id === currentUserId
              return (
                <div key={h.holder_id} className={`rounded-2xl p-4 ring-1 ring-inset ${mine ? 'bg-emerald-50/60 ring-emerald-300' : 'bg-stone-50 ring-stone-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-blue-950">{h.full_name || 'Coordenador'}{mine && <span className="ml-1.5 text-xs font-extrabold text-emerald-700">(eu)</span>}</p>
                      <p className="text-[11px] text-stone-500">Último movimento {sinceLabel(h.ultimo_movimento, now)}</p>
                    </div>
                    <p className={`${D} shrink-0 text-2xl font-extrabold ${h.total < 0 ? 'text-rose-600' : 'text-blue-950'}`}>{formatCents(h.total)}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-2 ring-1 ring-inset ring-stone-200">
                      <Banknote className="h-3.5 w-3.5 text-stone-400" />
                      <span className="text-stone-500">Numerário</span>
                      <span className="ml-auto font-bold text-blue-950">{formatCents(h.cash)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-2 ring-1 ring-inset ring-stone-200">
                      <Smartphone className="h-3.5 w-3.5 text-stone-400" />
                      <span className="text-stone-500">Na conta</span>
                      <span className="ml-auto font-bold text-blue-950">{formatCents(h.account)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-4 flex items-start gap-1.5 text-[11px] text-stone-400">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          As entregas ao tesoureiro da igreja ainda não estão no Cofre: a direção está a avaliar como vão funcionar.
        </p>
      </section>

      {/* ── Movimentos ──────────────────────────────────────────── */}
      <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
        <SectionTitle icon={Vault} iconClass="bg-blue-950" title="Movimentos" subtitle={`${periodLabel(range.from, range.to)} · entrou ${formatCents(periodTotals.inCents)} · saiu ${formatCents(periodTotals.outCents)}`} />

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex rounded-xl bg-stone-100 p-1">
            {([['this', 'Este mês'], ['last', 'Mês passado'], ['all', 'Tudo'], ['custom', 'Outro']] as [Period, string][]).map(([p, label]) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${period === p ? 'bg-white text-blue-950 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label="Desde" value={customFrom} max={today} onChange={e => setCustomFrom(e.target.value || customFrom)} className="h-9 w-auto" />
              <span className="text-xs text-stone-400">a</span>
              <Input type="date" aria-label="Até" value={customTo} max={today} onChange={e => setCustomTo(e.target.value || customTo)} className="h-9 w-auto" />
            </div>
          )}
          <select
            aria-label="Tipo de movimento"
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as CashMovementKind | 'all')}
            className="h-9 rounded-md border border-input bg-white px-2 text-xs font-bold text-stone-700"
          >
            <option value="all">Todos os tipos</option>
            {(Object.keys(KIND_LABELS) as CashMovementKind[]).map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
          {holderOptions.length > 1 && (
            <select
              aria-label="Coordenador"
              value={holderFilter}
              onChange={e => setHolderFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-white px-2 text-xs font-bold text-stone-700"
            >
              <option value="all">Todos</option>
              {holderOptions.map(id => <option key={id} value={id}>{name(id)}</option>)}
            </select>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">Não há movimentos neste período.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map(m => {
              const reversal = reversalOf.get(m.id)
              return (
                <li key={m.id} className="py-3">
                  <MovementRow
                    m={m}
                    cents={signedCents(m, byId)}
                    reversed={!!reversal}
                    holder={name(m.holder_id)}
                    createdBy={name(m.created_by)}
                    onReceipt={openReceipt}
                    onReverse={REVERSIBLE.includes(m.kind) && !reversal ? () => setReversing(m) : undefined}
                  />
                  {reversal && filteredIds.has(reversal.id) && (
                    <div className="ml-4 mt-2 border-l-2 border-stone-200 pl-3">
                      <MovementRow
                        m={reversal}
                        cents={signedCents(reversal, byId)}
                        reversed={false}
                        holder={name(reversal.holder_id)}
                        createdBy={name(reversal.created_by)}
                        onReceipt={openReceipt}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {dialog && (
        <MovementDialog
          key={dialog}
          kind={dialog}
          onClose={() => setDialog(null)}
          coordinators={coordinators}
          currentUserId={currentUserId}
          today={today}
        />
      )}
      <ReverseDialog movement={reversing} onClose={() => setReversing(null)} />
    </div>
  )
}

function MovementRow({ m, cents, reversed, holder, createdBy, onReceipt, onReverse }: {
  m: CashMovement
  cents: number
  reversed: boolean
  holder: string
  createdBy: string
  onReceipt: (path: string) => void
  onReverse?: () => void
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
      <div className="w-12 shrink-0 pt-0.5 text-[11px] font-bold leading-tight text-stone-400">{formatDay(m.occurred_on).slice(0, 5)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ring-1 ring-inset ${KIND_STYLES[m.kind]}`}>{KIND_LABELS[m.kind]}</span>
          <span className="text-[11px] font-bold text-stone-500">{holder} · {METHOD_LABELS[m.method]}</span>
        </div>
        <p className={`mt-1 text-sm text-gray-800 ${reversed ? 'line-through decoration-stone-400' : ''}`}>{m.description}</p>
        <p className="text-[10px] text-stone-400">Registado por {createdBy} · {new Date(m.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' })}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`font-extrabold tabular-nums ${reversed ? 'text-stone-400 line-through' : cents > 0 ? 'text-emerald-700' : cents < 0 ? 'text-rose-600' : 'text-stone-500'}`}>
          {cents > 0 ? '+' : cents < 0 ? '−' : ''}{formatCents(Math.abs(cents))}
        </span>
        <div className="flex gap-1">
          {m.receipt_path && (
            <button type="button" onClick={() => onReceipt(m.receipt_path!)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50">
              <Paperclip className="h-3 w-3" /> Comprovativo
            </button>
          )}
          {onReverse && (
            <button type="button" onClick={onReverse} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-stone-400 hover:bg-red-50 hover:text-red-600">
              <Undo2 className="h-3 w-3" /> Estornar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function HeaderStat({ icon: Icon, tone, label, value, sub }: { icon: React.ElementType; tone: string; label: string; value: string; sub: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/[0.07] p-4 ring-1 ring-inset ring-white/10">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-[11px] font-extrabold uppercase tracking-wider text-blue-100/70">{label}</p>
      <p className={`${D} text-2xl font-extrabold leading-tight sm:text-3xl`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-blue-100/60" title={sub}>{sub}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, iconClass, title, subtitle }: { icon: React.ElementType; iconClass: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex min-w-0 items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h3 className={`${D} text-lg font-extrabold leading-tight text-blue-950 sm:text-xl`}>{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
      </div>
    </div>
  )
}
