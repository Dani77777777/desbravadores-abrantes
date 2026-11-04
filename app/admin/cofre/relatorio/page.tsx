import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { lisbonDateString } from '@/utils/vana-codigo/day'
import { KIND_LABELS, METHOD_LABELS, formatCents, formatDay, monthRange, periodLabel } from '@/lib/cofre'
import { KIND_ORDER, loadCofreReport, parsePeriod } from '@/lib/cofre-report'
import { PrintButton } from './PrintButton'

export const metadata = { title: 'Relatório do Cofre' }

// Relatório do Cofre para o tesoureiro e a comissão: ecrã + versão para imprimir.
// Só coordenadores reais (a RLS e as funções também o garantem).
export default async function CofreReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/cofre/relatorio')

  const { data: profile } = await supabase.from('profiles').select('id, role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'coordenador') redirect('/admin')

  const today = lisbonDateString()
  const { from, to } = parsePeriod(await searchParams, today)

  let report
  try {
    report = await loadCofreReport(supabase, from, to)
  } catch {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="font-bold text-amber-800">Não foi possível ler o Cofre. A migração supabase-migration-cofre.sql já foi corrida?</p>
        <Link href="/admin?tab=cofre" className="text-sm font-bold text-blue-700 hover:underline">Voltar ao Cofre</Link>
      </main>
    )
  }

  const { movements, totals, store, storeTotals, holders, inHandCents } = report
  const thisMonth = monthRange(today)
  const lastMonth = monthRange(today, -1)
  const query = `from=${from}&to=${to}`
  const generatedAt = new Date().toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Lisbon' })

  return (
    <main className="mx-auto max-w-5xl space-y-8 bg-white p-4 text-sm text-gray-900 sm:p-8 print:max-w-none print:p-0 print:text-[11px]">
      {/* Controlos (não se imprimem) */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200 print:hidden">
        <Link href="/admin?tab=cofre" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Cofre
        </Link>
        <form className="flex flex-wrap items-end gap-2" action="/admin/cofre/relatorio">
          <label className="text-xs font-bold text-stone-500">Desde
            <input type="date" name="from" defaultValue={from} max={today} className="mt-1 block h-9 rounded-md border border-stone-300 bg-white px-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-stone-500">Até
            <input type="date" name="to" defaultValue={to} max={today} className="mt-1 block h-9 rounded-md border border-stone-300 bg-white px-2 text-sm" />
          </label>
          <button type="submit" className="h-9 rounded-md bg-blue-950 px-3 text-sm font-bold text-white hover:bg-blue-900">Ver</button>
          <Link href={`/admin/cofre/relatorio?from=${thisMonth.from}&to=${thisMonth.to}`} className="h-9 rounded-md px-3 text-sm font-bold leading-9 text-stone-600 hover:bg-stone-200">Este mês</Link>
          <Link href={`/admin/cofre/relatorio?from=${lastMonth.from}&to=${lastMonth.to}`} className="h-9 rounded-md px-3 text-sm font-bold leading-9 text-stone-600 hover:bg-stone-200">Mês passado</Link>
        </form>
        <div className="flex gap-2">
          <a href={`/admin/cofre/exportar?${query}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700 hover:bg-stone-100">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Cabeçalho */}
      <header className="border-b-2 border-blue-950 pb-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700">Clube de Desbravadores de Abrantes · Cofre</p>
        <h1 className="mt-1 text-3xl font-extrabold text-blue-950 print:text-2xl">Relatório de {periodLabel(from, to)}</h1>
        <p className="mt-1 text-xs text-stone-500">
          Registo de controlo do dinheiro que passou pelo clube. Não é a contabilidade: a conta do clube é a da igreja.
          Gerado a {generatedAt} por {profile.full_name || 'coordenação'}.
        </p>
      </header>

      {/* Resumo */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
        <Stat label="Entrou" value={formatCents(totals.inCents)} />
        <Stat label="Saiu" value={formatCents(totals.outCents)} />
        <Stat label="Saldo do período" value={formatCents(totals.inCents - totals.outCents)} />
        <Stat label="Em mão hoje" value={formatCents(inHandCents)} />
      </section>

      {/* Loja */}
      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-extrabold text-blue-950">Loja</h2>
        <p className="text-xs text-stone-500">Compras pagas no período e não reembolsadas.</p>
        {store.length === 0 ? (
          <p className="text-stone-400">Não houve vendas pagas neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-right">
              <thead>
                <tr className="border-b border-stone-300 text-[10px] uppercase tracking-wide text-stone-500">
                  <th className="py-2 text-left">Artigo</th>
                  <th className="py-2">Unid.</th>
                  <th className="py-2">Valor de tabela</th>
                  <th className="py-2">Desc. Gold</th>
                  <th className="py-2">Desc. quantidade</th>
                  <th className="py-2">Recebido</th>
                  <th className="py-2">Custo</th>
                  <th className="py-2">Margem</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {store.map((r, i) => (
                  <tr key={`${r.productName}-${i}`} className="border-b border-stone-100">
                    <td className="py-1.5 text-left font-bold">{r.productName}</td>
                    <td>{r.units}</td>
                    <td>{formatCents(r.listCents)}</td>
                    <td>{r.goldDiscountCents ? `−${formatCents(r.goldDiscountCents)}` : '—'}</td>
                    <td>{r.volumeDiscountCents ? `−${formatCents(r.volumeDiscountCents)}` : '—'}</td>
                    <td className="font-bold">{formatCents(r.receivedCents)}</td>
                    <td>{r.costCents === null ? '—' : formatCents(r.costCents)}</td>
                    <td className={r.marginCents !== null && r.marginCents < 0 ? 'text-rose-600' : ''}>{r.marginCents === null ? '—' : formatCents(r.marginCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="tabular-nums">
                <tr className="border-t-2 border-stone-400 font-extrabold">
                  <td className="py-2 text-left">Total</td>
                  <td>{storeTotals.units}</td>
                  <td>{formatCents(storeTotals.listCents)}</td>
                  <td>{storeTotals.goldDiscountCents ? `−${formatCents(storeTotals.goldDiscountCents)}` : '—'}</td>
                  <td>{storeTotals.volumeDiscountCents ? `−${formatCents(storeTotals.volumeDiscountCents)}` : '—'}</td>
                  <td>{formatCents(storeTotals.receivedCents)}</td>
                  <td>{formatCents(storeTotals.costCents)}{storeTotals.withoutCost > 0 && '*'}</td>
                  <td>{formatCents(storeTotals.marginCents)}{storeTotals.withoutCost > 0 && '*'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-[11px] text-stone-500">
          O <strong>desconto com Gold</strong> é pago pelo clube: é dinheiro que não entra, por isso o recebido é menor do que o valor de tabela.
          A margem é o recebido menos o custo (preço de custo atual do artigo).
          {storeTotals.withoutCost > 0 && ` * ${storeTotals.withoutCost} ${storeTotals.withoutCost === 1 ? 'artigo não tem' : 'artigos não têm'} preço de custo e não ${storeTotals.withoutCost === 1 ? 'entra' : 'entram'} no custo nem na margem.`}
        </p>
      </section>

      {/* Totais por tipo */}
      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-extrabold text-blue-950">Movimentos por tipo</h2>
        <table className="w-full max-w-md border-collapse text-right tabular-nums">
          <tbody>
            {KIND_ORDER.filter(k => movements.some(m => m.kind === k)).map(k => (
              <tr key={k} className="border-b border-stone-100">
                <td className="py-1.5 text-left">{KIND_LABELS[k]}</td>
                <td className="text-stone-500">{movements.filter(m => m.kind === k).length}</td>
                <td className="font-bold">{formatCents(totals.byKind[k])}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr><td className="py-1.5 text-left text-stone-400">Sem movimentos neste período.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Situação */}
      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-extrabold text-blue-950">Quem tem dinheiro do clube (hoje)</h2>
        {holders.length === 0 ? (
          <p className="text-stone-400">Ninguém tem dinheiro do clube registado.</p>
        ) : (
          <table className="w-full max-w-xl border-collapse text-right tabular-nums">
            <thead>
              <tr className="border-b border-stone-300 text-[10px] uppercase tracking-wide text-stone-500">
                <th className="py-2 text-left">Coordenador</th>
                <th className="py-2">Numerário</th>
                <th className="py-2">Na conta</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {holders.map(h => (
                <tr key={h.name} className="border-b border-stone-100">
                  <td className="py-1.5 text-left font-bold">{h.name}</td>
                  <td>{formatCents(h.cashCents)}</td>
                  <td>{formatCents(h.accountCents)}</td>
                  <td className="font-bold">{formatCents(h.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Lista de movimentos */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold text-blue-950">Movimentos ({movements.length})</h2>
        {movements.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-stone-300 text-[10px] uppercase tracking-wide text-stone-500">
                  <th className="py-2">Data</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Quem tem</th>
                  <th className="py-2">Método</th>
                  <th className="py-2">Descrição</th>
                  <th className="py-2">Registado por</th>
                  <th className="py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id} className={`border-b border-stone-100 align-top ${m.reversed ? 'text-stone-400' : ''}`}>
                    <td className="whitespace-nowrap py-1.5 pr-2">{formatDay(m.occurred_on)}</td>
                    <td className="whitespace-nowrap pr-2">{KIND_LABELS[m.kind]}</td>
                    <td className="pr-2">{m.holderName}</td>
                    <td className="whitespace-nowrap pr-2">{METHOD_LABELS[m.method]}</td>
                    <td className={`pr-2 ${m.reversed ? 'line-through' : ''}`}>{m.description}{m.reversed && <span className="ml-1 no-underline">(estornado)</span>}</td>
                    <td className="pr-2">{m.createdByName}</td>
                    <td className={`whitespace-nowrap text-right font-bold tabular-nums ${m.signedCents < 0 ? 'text-rose-700' : ''}`}>
                      {m.signedCents > 0 ? '+' : m.signedCents < 0 ? '−' : ''}{formatCents(Math.abs(m.signedCents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200 print:bg-white">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500">{label}</p>
      <p className="text-xl font-extrabold text-blue-950 tabular-nums">{value}</p>
    </div>
  )
}
