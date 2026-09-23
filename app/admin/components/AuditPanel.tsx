'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, CalendarCheck, ChevronLeft, ChevronRight,
  ClipboardList, Coins, Download, Gamepad2, Hand, History, ListChecks, MessageSquare, QrCode, Repeat,
  RotateCcw, Search, ShieldCheck, ShoppingBag, Trophy, Users, Wrench, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { SECTION_LABELS, helperLabel } from '@/utils/permissions'
import { ROLE_LABELS } from './member-constants'
import { PointsResetCard } from './PointsResetCard'

const PAGE_SIZE = 50
const LARGE_THRESHOLD = 500

type Period = '7d' | '30d' | '90d' | 'all'
type Direction = 'all' | 'in' | 'out'
type Currency = 'all' | 'xp' | 'gold'

const PERIODS: { id: Period; label: string; days: number | null }[] = [
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: '90d', label: '90 dias', days: 90 },
  { id: 'all', label: 'Tudo', days: null },
]

const CATEGORIES: Record<string, { label: string; icon: any }> = {
  manual:        { label: 'Atribuição manual', icon: Hand },
  auto:          { label: 'Auto-atribuição',   icon: ShieldCheck },
  tarefa:        { label: 'Tarefas',           icon: ListChecks },
  evento:        { label: 'Eventos',           icon: CalendarCheck },
  qr:            { label: 'QR / Questões',     icon: QrCode },
  sugestao:      { label: 'Sugestões',         icon: MessageSquare },
  inquerito:     { label: 'Inquéritos',        icon: ClipboardList },
  loja:          { label: 'Loja',              icon: ShoppingBag },
  transferencia: { label: 'Transferências',    icon: Repeat },
  jogo:          { label: 'Jogos',             icon: Gamepad2 },
  reset:         { label: 'Reset de época',    icon: RotateCcw },
  outro:         { label: 'Sem origem clara',  icon: Bot },
}

const nf = new Intl.NumberFormat('pt-PT')
const signed = (n: number) => (n > 0 ? `+${nf.format(n)}` : n < 0 ? `−${nf.format(Math.abs(n))}` : '0')
const fmtDate = (d: string) => new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })

function periodStart(period: Period) {
  const days = PERIODS.find((p) => p.id === period)?.days
  return days ? new Date(Date.now() - days * 86400000).toISOString() : null
}

interface Filters {
  period: Period
  search: string
  category: string
  memberId: string
  direction: Direction
  currency: Currency
  onlySuspicious: boolean
  onlyLarge: boolean
}

/** Cargo de quem atribuiu: Ajudantes aparecem como tal, não com o cargo efetivo (Dirigente/Coordenador). */
function awarderRoleLabel(role?: string, realRole?: string, helperRole?: string, helperSection?: string) {
  const helper = helperLabel({ helper_role: helperRole, helper_section: helperSection })
  if (helper) return helper
  const r = realRole || role
  return r ? ROLE_LABELS[r] || r : ''
}

/** Aplica os filtros à query da vista points_audit (usado na tabela e no CSV). */
function applyFilters(query: any, f: Filters) {
  const from = periodStart(f.period)
  if (from) query = query.gte('created_at', from)
  if (f.category !== 'all') query = query.eq('category', f.category)
  if (f.memberId !== 'all') query = query.or(`target_user_id.eq.${f.memberId},awarded_by_user_id.eq.${f.memberId}`)
  if (f.onlySuspicious) query = query.eq('is_suspicious', true)

  const q = f.search.trim().replace(/[,()*%]/g, ' ').trim()
  if (q) query = query.or(`target_name.ilike.*${q}*,awarded_by_name.ilike.*${q}*,description.ilike.*${q}*`)

  const col = f.currency === 'gold' ? 'amount_gold' : 'amount_xp'
  if (f.currency !== 'all') query = query.neq(col, 0)
  if (f.direction !== 'all') {
    const op = f.direction === 'in' ? 'gt' : 'lt'
    query = f.currency === 'all'
      ? query.or(`amount_xp.${op}.0,amount_gold.${op}.0`)
      : query[op](col, 0)
  }
  if (f.onlyLarge) {
    query = query.or(`amount_xp.gte.${LARGE_THRESHOLD},amount_xp.lte.-${LARGE_THRESHOLD},amount_gold.gte.${LARGE_THRESHOLD},amount_gold.lte.-${LARGE_THRESHOLD}`)
  }
  return query
}

export function AuditPanel({ members }: { members: any[] }) {
  const supabase = createClient()

  const [filters, setFilters] = useState<Filters>({
    period: '30d', search: '', category: 'all', memberId: 'all',
    direction: 'all', currency: 'all', onlySuspicious: false, onlyLarge: false,
  })
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const [view, setView] = useState<'movements' | 'changes'>('movements')

  const [overview, setOverview] = useState<any>(null)
  const [mismatches, setMismatches] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [changes, setChanges] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fixing, setFixing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(0)
  }

  // Pesquisa com debounce
  useEffect(() => {
    if (searchInput === filters.search) return
    const t = setTimeout(() => setFilter('search', searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resumo do período (recarrega também depois de corrigir totais)
  const [overviewKey, setOverviewKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const [{ data: ov, error }, { data: mm }] = await Promise.all([
        supabase.rpc('audit_points_overview', { p_from: periodStart(filters.period) }),
        supabase.rpc('audit_points_mismatches'),
      ])
      if (cancelled) return
      if (error) toast.error(error.message)
      setOverview(ov)
      setMismatches(mm || [])
    }
    run()
    return () => { cancelled = true }
  }, [filters.period, overviewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      if (view === 'movements') {
        const query = applyFilters(supabase.from('points_audit').select('*', { count: 'exact' }), filters)
        const { data, count: total, error } = await query
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        if (cancelled) return
        if (error) toast.error(error.message)
        setRows(data || [])
        setCount(total || 0)
      } else {
        let query = supabase.from('points_audit_events').select('*', { count: 'exact' })
        const from = periodStart(filters.period)
        if (from) query = query.gte('created_at', from)
        const { data, count: total, error } = await query
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        if (cancelled) return
        if (error) toast.error(error.message)
        setChanges(data || [])
        setCount(total || 0)
      }
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [filters, page, view, overviewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fixTotals = async () => {
    setFixing(true)
    const { data, error } = await supabase.rpc('audit_fix_totals')
    setFixing(false)
    if (error) return toast.error(error.message)
    toast.success(`${data} ${data === 1 ? 'perfil corrigido' : 'perfis corrigidos'}. A correção ficou registada.`)
    setOverviewKey((k) => k + 1)
  }

  const exportCsv = async () => {
    setExporting(true)
    const { data, error } = await applyFilters(supabase.from('points_audit').select('*'), filters)
      .order('created_at', { ascending: false })
      .limit(5000)
    setExporting(false)
    if (error) return toast.error(error.message)
    const header = ['Data', 'Membro', 'Classe', 'XP', 'Ouro', 'Origem', 'Descrição', 'Atribuído por', 'Cargo de quem atribuiu', 'Alerta']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = (data || []).map((r: any) => [
      new Date(r.created_at).toISOString(), r.target_name, SECTION_LABELS[r.target_section] || r.target_section,
      r.amount_xp, r.amount_gold, CATEGORIES[r.category]?.label || r.category, r.description,
      r.awarded_by_name, awarderRoleLabel(r.awarded_by_role, r.awarded_by_real_role, r.awarded_by_helper_role, r.awarded_by_helper_section),
      r.is_suspicious ? 'Suspeito' : r.category === 'auto' ? 'Auto-atribuição (coordenação)' : '',
    ].map(esc).join(';'))
    const blob = new Blob(['﻿' + [header.map(esc).join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria-pontos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totals = overview?.totals
  const byCategory: any[] = overview?.by_category || []
  const maxCategory = Math.max(1, ...byCategory.map((c) => c.movements))
  const hasActiveFilters = filters.search || filters.category !== 'all' || filters.memberId !== 'all'
    || filters.direction !== 'all' || filters.currency !== 'all' || filters.onlySuspicious || filters.onlyLarge
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-2xl border p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Auditoria de pontos</h2>
            <p className="text-sm text-slate-500">Todos os movimentos de XP e Ouro no site, quem os fez e de onde vieram.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 bg-slate-100 rounded-lg">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFilter('period', p.id)}
                  className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${
                    filters.period === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting} className="h-10">
              <Download className="w-4 h-4" /> {exporting ? 'A exportar...' : 'CSV'}
            </Button>
          </div>
        </div>

        {/* Alertas */}
        {(mismatches.length > 0 || totals?.suspicious > 0 || totals?.coord_self > 0) && (
          <div className="grid gap-2">
            {mismatches.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
                <AlertOctagon className="w-5 h-5 text-red-600 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-red-800">
                    Totais inconsistentes: {mismatches.length} {mismatches.length === 1 ? 'perfil tem' : 'perfis têm'} XP/Ouro diferente do histórico
                  </p>
                  <p className="text-xs text-red-700/80">
                    {mismatches.slice(0, 4).map((m) => `${m.full_name} (${nf.format(m.current_gold)} → ${nf.format(m.log_gold)} Ouro)`).join(' · ')}
                    {mismatches.length > 4 ? ' …' : ''}
                  </p>
                </div>
                <Button size="sm" onClick={fixTotals} disabled={fixing} className="bg-red-600 hover:bg-red-700">
                  <Wrench className="w-4 h-4" /> {fixing ? 'A corrigir...' : 'Corrigir totais'}
                </Button>
              </div>
            )}
            {totals?.suspicious > 0 && (
              <button
                type="button"
                onClick={() => { setView('movements'); setFilter('onlySuspicious', true) }}
                className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left hover:bg-amber-100/60"
              >
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-amber-900">
                    {totals.suspicious} {totals.suspicious === 1 ? 'movimento suspeito' : 'movimentos suspeitos'} neste período
                  </p>
                  <p className="text-xs text-amber-800/80">Pontos atribuídos a si próprio ou por alguém sem cargo de gestão. Carrega para ver.</p>
                </div>
              </button>
            )}
            {totals?.coord_self > 0 && (
              <button
                type="button"
                onClick={() => { setView('movements'); setFilter('category', 'auto') }}
                className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left hover:bg-blue-100/60"
              >
                <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-blue-950">
                    {totals.coord_self} {totals.coord_self === 1 ? 'auto-atribuição' : 'auto-atribuições'} da coordenação neste período
                  </p>
                  <p className="text-xs text-blue-900/70">Coordenadores que deram pontos a si próprios. É permitido, mas fica à vista. Carrega para ver.</p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Indicadores */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Movimentos" value={totals ? nf.format(totals.movements) : '—'} sub={totals ? `${totals.members} membros envolvidos` : ''} />
          <StatTile
            label="XP"
            icon={<Trophy className="w-4 h-4 text-indigo-600" />}
            value={totals ? `+${nf.format(totals.xp_in)}` : '—'}
            sub={totals ? `−${nf.format(totals.xp_out)} retirado` : ''}
          />
          <StatTile
            label="Ouro"
            icon={<Coins className="w-4 h-4 text-yellow-600" />}
            value={totals ? `+${nf.format(totals.gold_in)}` : '—'}
            sub={totals ? `−${nf.format(totals.gold_out)} gasto ou retirado` : ''}
          />
          <StatTile
            label="Alterações e eliminações"
            icon={<History className="w-4 h-4 text-slate-500" />}
            value={overview ? nf.format(overview.changes) : '—'}
            sub="movimentos editados, apagados ou corrigidos"
            onClick={() => { setView('changes'); setPage(0) }}
          />
        </div>
      </div>

      {/* Origem + tops */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border p-5">
          <h3 className="text-sm font-semibold text-slate-900">Movimentos por origem</h3>
          <p className="text-xs text-slate-500 mb-4">Carrega numa origem para filtrar a tabela.</p>
          {byCategory.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Sem movimentos neste período.</p>
          ) : (
            <ul className="space-y-2.5">
              {byCategory.map((c) => {
                const cfg = CATEGORIES[c.category] || CATEGORIES.outro
                const active = filters.category === c.category
                return (
                  <li key={c.category}>
                    <button
                      type="button"
                      onClick={() => { setView('movements'); setFilter('category', active ? 'all' : c.category) }}
                      title={`${cfg.label}: ${c.movements} movimentos · XP +${c.xp_in} / −${c.xp_out} · Ouro +${c.gold_in} / −${c.gold_out}`}
                      className={`group w-full grid grid-cols-[7.5rem_1fr_auto] sm:grid-cols-[9.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                    >
                      <span className="flex items-center gap-2 text-xs font-medium text-slate-700 truncate">
                        <cfg.icon className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {cfg.label}
                      </span>
                      <span className="h-2.5 rounded-r bg-slate-100 overflow-hidden">
                        <span
                          className="block h-full rounded-r bg-indigo-600 group-hover:bg-indigo-700 transition-all"
                          style={{ width: `${Math.max(2, (c.movements / maxCategory) * 100)}%` }}
                        />
                      </span>
                      <span className="text-xs tabular-nums text-slate-600 text-right sm:min-w-[8rem]">
                        <strong className="text-slate-900">{nf.format(c.movements)}</strong>
                        <span className="text-slate-400"> · {signed(c.xp_in - c.xp_out)} XP</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border p-5 space-y-5">
          <TopList
            title="Quem mais recebeu XP"
            items={(overview?.top_receivers || []).map((r: any) => ({
              id: r.user_id, name: r.name, avatar: r.avatar_url, value: `${signed(r.xp)} XP`,
            }))}
            onSelect={(id) => { setView('movements'); setFilter('memberId', id) }}
          />
          <TopList
            title="Quem mais atribuiu pontos"
            items={(overview?.top_awarders || []).map((r: any) => ({
              id: r.user_id, name: r.name || 'Sistema', value: `${r.movements} mov.`, sub: awarderRoleLabel(r.role, r.real_role, r.helper_role, r.helper_section),
            }))}
            onSelect={(id) => { setView('movements'); setFilter('memberId', id) }}
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-4 border-b">
          {([['movements', 'Movimentos'], ['changes', 'Alterações e correções']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setView(id); setPage(0) }}
              className={`px-3 pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                view === id ? 'border-blue-800 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'movements' && (
          <div className="p-4 space-y-3 border-b bg-slate-50/50">
            <div className="flex flex-col lg:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Pesquisar membro, quem atribuiu ou descrição..."
                  className="pl-9 h-10 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex gap-2">
                <Select value={filters.memberId} onValueChange={(v) => setFilter('memberId', v)}>
                  <SelectTrigger className="h-10 w-full lg:w-44 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os membros</SelectItem>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.category} onValueChange={(v) => setFilter('category', v)}>
                  <SelectTrigger className="h-10 w-full lg:w-44 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as origens</SelectItem>
                    {Object.entries(CATEGORIES).map(([id, c]) => <SelectItem key={id} value={id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.currency} onValueChange={(v) => setFilter('currency', v as Currency)}>
                  <SelectTrigger className="h-10 w-full lg:w-32 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">XP e Ouro</SelectItem>
                    <SelectItem value="xp">Só XP</SelectItem>
                    <SelectItem value="gold">Só Ouro</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.direction} onValueChange={(v) => setFilter('direction', v as Direction)}>
                  <SelectTrigger className="h-10 w-full lg:w-36 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Ganhos e perdas</SelectItem>
                    <SelectItem value="in">Só ganhos</SelectItem>
                    <SelectItem value="out">Só perdas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Toggle active={filters.onlySuspicious} onClick={() => setFilter('onlySuspicious', !filters.onlySuspicious)}>
                <AlertTriangle className="w-3.5 h-3.5" /> Só suspeitos
              </Toggle>
              <Toggle active={filters.onlyLarge} onClick={() => setFilter('onlyLarge', !filters.onlyLarge)}>
                Movimentos grandes (≥ {LARGE_THRESHOLD})
              </Toggle>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('')
                    setFilters((f) => ({ ...f, search: '', category: 'all', memberId: 'all', direction: 'all', currency: 'all', onlySuspicious: false, onlyLarge: false }))
                    setPage(0)
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
                >
                  <X className="w-3.5 h-3.5" /> Limpar filtros
                </button>
              )}
              <span className="ml-auto text-xs text-slate-500">{nf.format(count)} movimentos</span>
            </div>
          </div>
        )}

        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {view === 'movements' ? (
            <MovementsTable rows={rows} loading={loading} />
          ) : (
            <ChangesTable rows={changes} loading={loading} />
          )}
        </div>

        {count > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-slate-500">
            <span>Página {page + 1} de {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                Seguinte <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <PointsResetCard onDone={() => { setPage(0); setOverviewKey((k) => k + 1) }} />
    </div>
  )
}

// ── Componentes auxiliares ──

function StatTile({ label, value, sub, icon, onClick }: { label: string; value: string; sub?: string; icon?: React.ReactNode; onClick?: () => void }) {
  const Comp: any = onClick ? 'button' : 'div'
  return (
    <Comp
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`rounded-xl border bg-white p-4 text-left ${onClick ? 'hover:border-slate-300 hover:bg-slate-50 transition-colors' : ''}`}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{icon}{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </Comp>
  )
}

function TopList({ title, items, onSelect }: {
  title: string
  items: { id: string; name: string; avatar?: string; value: string; sub?: string }[]
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Sem dados neste período.</p>
      ) : (
        <ol className="space-y-1">
          {items.map((it, i) => (
            <li key={it.id || i}>
              <button
                type="button"
                disabled={!it.id}
                onClick={() => it.id && onSelect(it.id)}
                className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 disabled:hover:bg-transparent"
              >
                <span className="w-4 text-xs text-slate-400 tabular-nums">{i + 1}</span>
                <Avatar className="h-6 w-6">
                  <AvatarImage src={it.avatar} className="object-cover" />
                  <AvatarFallback className="text-[9px] font-bold bg-slate-200">{it.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 min-w-0 text-xs font-medium text-slate-800 truncate">
                  {it.name}{it.sub && <span className="text-slate-400 font-normal"> · {it.sub}</span>}
                </span>
                <span className="text-xs tabular-nums text-slate-600">{it.value}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold transition-colors ${
        active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function Amount({ value, unit }: { value: number; unit: 'XP' | 'Ouro' }) {
  if (!value) return <span className="text-slate-300">—</span>
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${value > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
      {value > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {signed(value)} <span className="text-[10px] font-medium text-slate-400 ml-0.5">{unit}</span>
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORIES[category] || CATEGORIES.outro
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5 whitespace-nowrap">
      <cfg.icon className="w-3 h-3" /> {cfg.label}
    </span>
  )
}

function MovementsTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (!loading && rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-14 text-slate-400">
        <Users className="w-8 h-8 mb-2" />
        <p className="text-sm">Nenhum movimento encontrado.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b bg-slate-50/50">
            <th className="px-4 py-2 font-semibold">Data</th>
            <th className="px-4 py-2 font-semibold">Membro</th>
            <th className="px-4 py-2 font-semibold text-right">XP</th>
            <th className="px-4 py-2 font-semibold text-right">Ouro</th>
            <th className="px-4 py-2 font-semibold">Origem</th>
            <th className="px-4 py-2 font-semibold min-w-[14rem]">Descrição</th>
            <th className="px-4 py-2 font-semibold">Atribuído por</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className={r.is_suspicious ? 'bg-amber-50/60' : r.category === 'auto' ? 'bg-blue-50/50' : 'hover:bg-slate-50/60'}>
              <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap tabular-nums">{fmtDate(r.created_at)}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-[10rem]">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={r.target_avatar} className="object-cover" />
                    <AvatarFallback className="text-[10px] font-bold bg-slate-200">{r.target_name?.charAt(0) || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{r.target_name || 'Conta apagada'}</p>
                    <p className="text-[11px] text-slate-400">{SECTION_LABELS[r.target_section] || ''}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap"><Amount value={r.amount_xp} unit="XP" /></td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap"><Amount value={r.amount_gold} unit="Ouro" /></td>
              <td className="px-4 py-2.5"><CategoryBadge category={r.category} /></td>
              <td className="px-4 py-2.5 text-xs text-slate-600">
                {r.is_suspicious && (
                  <span className="inline-flex items-center gap-1 mr-1.5 text-[10px] font-bold uppercase text-amber-700">
                    <AlertTriangle className="w-3 h-3" /> Suspeito
                  </span>
                )}
                {r.description}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap">
                <p className="text-xs font-medium text-slate-700">
                  {r.is_self ? 'O próprio' : r.awarded_by_name || 'Sistema'}
                </p>
                {!r.is_self && r.awarded_by_role && (
                  <p className="text-[11px] text-slate-400">
                    {awarderRoleLabel(r.awarded_by_role, r.awarded_by_real_role, r.awarded_by_helper_role, r.awarded_by_helper_section)}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ACTION_LABELS: Record<string, { label: string; className: string }> = {
  DELETE:     { label: 'Apagado',          className: 'bg-red-50 text-red-700 border-red-200' },
  UPDATE:     { label: 'Editado',          className: 'bg-amber-50 text-amber-800 border-amber-200' },
  TOTALS_FIX: { label: 'Totais corrigidos', className: 'bg-blue-50 text-blue-700 border-blue-200' },
}

function ChangesTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (!loading && rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-14 text-slate-400">
        <History className="w-8 h-8 mb-2" />
        <p className="text-sm">Nenhuma alteração neste período.</p>
        <p className="text-xs mt-1">Aqui aparecem movimentos apagados (ex.: reverter um evento), editados, e correções de totais.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b bg-slate-50/50">
            <th className="px-4 py-2 font-semibold">Data</th>
            <th className="px-4 py-2 font-semibold">Ação</th>
            <th className="px-4 py-2 font-semibold">Membro</th>
            <th className="px-4 py-2 font-semibold">Antes</th>
            <th className="px-4 py-2 font-semibold">Depois</th>
            <th className="px-4 py-2 font-semibold min-w-[14rem]">Detalhe</th>
            <th className="px-4 py-2 font-semibold">Feito por</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const action = ACTION_LABELS[r.action] || { label: r.action, className: 'bg-slate-50 text-slate-600 border-slate-200' }
            const isFix = r.action === 'TOTALS_FIX'
            return (
              <tr key={r.id}>
                <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap tabular-nums">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${action.className}`}>{action.label}</span>
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{r.target_name || 'Conta apagada'}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600 whitespace-nowrap">
                  {isFix ? `${nf.format(r.old_xp)} XP · ${nf.format(r.old_gold)} Ouro` : `${signed(r.old_xp)} XP · ${signed(r.old_gold)} Ouro`}
                </td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600 whitespace-nowrap">
                  {r.action === 'DELETE'
                    ? <span className="text-slate-400">removido</span>
                    : isFix ? `${nf.format(r.new_xp)} XP · ${nf.format(r.new_gold)} Ouro` : `${signed(r.new_xp)} XP · ${signed(r.new_gold)} Ouro`}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-600">{r.description}</td>
                <td className="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">{r.performed_by_name || 'Sistema'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
