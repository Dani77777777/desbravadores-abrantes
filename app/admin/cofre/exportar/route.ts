import { NextResponse, type NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/utils/supabase/server'
import { lisbonDateString } from '@/utils/vana-codigo/day'
import { KIND_LABELS, METHOD_LABELS, periodLabel } from '@/lib/cofre'
import { KIND_ORDER, loadCofreReport, parsePeriod } from '@/lib/cofre-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EUR = '#,##0.00 "€";[Red]-#,##0.00 "€"'
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172554' } }

// Exportação do Cofre para Excel (.xlsx): é assim que os registos chegam ao
// tesoureiro, que não tem conta na plataforma. Só coordenadores reais.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sem sessão.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'coordenador') return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const today = lisbonDateString()
  const { from, to } = parsePeriod(
    { from: request.nextUrl.searchParams.get('from') ?? undefined, to: request.nextUrl.searchParams.get('to') ?? undefined },
    today,
  )

  let report
  try {
    report = await loadCofreReport(supabase, from, to)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Não foi possível ler o Cofre.' }, { status: 500 })
  }

  const eur = (cents: number | null) => (cents === null ? null : cents / 100)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Desbravadores Abrantes · Cofre'
  wb.created = new Date()

  // ── 1. Resumo ─────────────────────────────────────────────────────────────
  const resumo = wb.addWorksheet('Resumo')
  resumo.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }]
  resumo.addRow(['Clube de Desbravadores de Abrantes — Cofre']).font = { bold: true, size: 14 }
  resumo.addRow([`Período: ${periodLabel(from, to)} (${from} a ${to})`])
  resumo.addRow([`Exportado a ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })} por ${profile.full_name || 'coordenação'}`])
  resumo.addRow(['Registo de controlo: não é a contabilidade. A conta do clube é a da igreja.']).font = { italic: true, color: { argb: 'FF6B7280' } }
  resumo.addRow([])

  const head = (ws: ExcelJS.Worksheet, values: string[]) => {
    const row = ws.addRow(values)
    row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEADER_FILL })
    return row
  }

  // Linha com euros nas colunas indicadas (1 = A).
  const money = (ws: ExcelJS.Worksheet, values: (string | number | null)[], cols: number[], bold = false) => {
    const row = ws.addRow(values)
    for (const c of cols) row.getCell(c).numFmt = EUR
    if (bold) row.font = { bold: true }
    return row
  }

  head(resumo, ['Tipo de movimento', 'N.º', 'Total'])
  for (const k of KIND_ORDER) {
    const n = report.movements.filter(m => m.kind === k).length
    if (n) money(resumo, [KIND_LABELS[k], n, eur(report.totals.byKind[k])], [3])
  }
  money(resumo, ['Entrou', null, eur(report.totals.inCents)], [3], true)
  money(resumo, ['Saiu', null, eur(-report.totals.outCents)], [3], true)
  money(resumo, ['Saldo do período', null, eur(report.totals.inCents - report.totals.outCents)], [3], true)
  resumo.addRow([])

  head(resumo, ['Quem tem dinheiro do clube (hoje)', 'Numerário', 'Na conta', 'Total'])
  for (const h of report.holders) money(resumo, [h.name, eur(h.cashCents), eur(h.accountCents), eur(h.totalCents)], [2, 3, 4])
  money(resumo, ['Total em mão', null, null, eur(report.inHandCents)], [4], true)

  // ── 2. Loja ───────────────────────────────────────────────────────────────
  const loja = wb.addWorksheet('Loja', { views: [{ state: 'frozen', ySplit: 1 }] })
  loja.columns = [
    { header: 'Artigo', key: 'name', width: 30 },
    { header: 'Unidades', key: 'units', width: 10 },
    { header: 'Valor de tabela', key: 'list', width: 16, style: { numFmt: EUR } },
    { header: 'Desconto Gold', key: 'gold', width: 15, style: { numFmt: EUR } },
    { header: 'Desconto quantidade', key: 'vol', width: 19, style: { numFmt: EUR } },
    { header: 'Recebido', key: 'recv', width: 14, style: { numFmt: EUR } },
    { header: 'Custo', key: 'cost', width: 14, style: { numFmt: EUR } },
    { header: 'Margem', key: 'margin', width: 14, style: { numFmt: EUR } },
  ]
  loja.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEADER_FILL })
  for (const r of report.store) {
    loja.addRow({
      name: r.productName, units: r.units, list: eur(r.listCents), gold: eur(-r.goldDiscountCents),
      vol: eur(-r.volumeDiscountCents), recv: eur(r.receivedCents), cost: eur(r.costCents), margin: eur(r.marginCents),
    })
  }
  if (report.store.length) {
    loja.autoFilter = { from: { row: 1, column: 1 }, to: { row: report.store.length + 1, column: 8 } }
    const t = report.storeTotals
    loja.addRow({
      name: 'Total', units: t.units, list: eur(t.listCents), gold: eur(-t.goldDiscountCents), vol: eur(-t.volumeDiscountCents),
      recv: eur(t.receivedCents), cost: eur(t.costCents), margin: eur(t.marginCents),
    }).font = { bold: true }
  }
  loja.addRow([])
  loja.addRow(['O desconto com Gold é pago pelo clube (dinheiro que não entra). Margem = recebido − custo (preço de custo atual). Artigos sem custo ficam em branco.']).font = { italic: true, color: { argb: 'FF6B7280' } }

  // ── 3. Movimentos ─────────────────────────────────────────────────────────
  const mov = wb.addWorksheet('Movimentos', { views: [{ state: 'frozen', ySplit: 1 }] })
  mov.columns = [
    { header: 'Data', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Tipo', key: 'kind', width: 17 },
    { header: 'Valor', key: 'amount', width: 13, style: { numFmt: EUR } },
    { header: 'Método', key: 'method', width: 14 },
    { header: 'Quem tem', key: 'holder', width: 22 },
    { header: 'Referência', key: 'ref', width: 11 },
    { header: 'Descrição', key: 'desc', width: 50 },
    { header: 'Estornado', key: 'reversed', width: 10 },
    { header: 'Registado por', key: 'by', width: 22 },
    { header: 'Registado a', key: 'at', width: 18, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
  ]
  mov.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEADER_FILL })
  // Datas "locais": o Excel não tem fuso, por isso escrevemos a hora de Lisboa como se fosse UTC.
  const lisbonWallClock = (iso: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
    const g = (t: string) => Number(parts.find(p => p.type === t)?.value)
    return new Date(Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')))
  }
  for (const m of report.movements) {
    mov.addRow({
      date: new Date(`${m.occurred_on}T00:00:00Z`),
      kind: KIND_LABELS[m.kind],
      amount: eur(m.signedCents),
      method: METHOD_LABELS[m.method],
      holder: m.holderName,
      ref: m.purchaseRef,
      desc: m.description,
      reversed: m.reversed ? 'Sim' : '',
      by: m.createdByName,
      at: lisbonWallClock(m.created_at),
    })
  }
  mov.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, report.movements.length + 1), column: 10 } }

  const buffer = await wb.xlsx.writeBuffer()
  const fileMonth = from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : `${from}_a_${to}`
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Cofre-Desbravadores-Abrantes-${fileMonth}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
