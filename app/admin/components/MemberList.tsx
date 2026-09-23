'use client'

import { useState, useSyncExternalStore } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowDownUp, Cake, Coins, Download, LayoutGrid, List, Search, Settings2, ShieldCheck, Trophy, UserCheck, UserX,
  Users, X, Crown, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { HelperManager } from './HelperManager'
import { ManageMemberDialog } from './ManageMemberDialog'
import { DeleteMemberDialog } from './DeleteMemberDialog'
import { SectionSuggestions, type SectionSuggestion } from './SectionSuggestions'
import { SECTION_LABELS, helperLabel } from '@/utils/permissions'
import { ROLE_LABELS, SECTION_DOT, SECTION_RING } from './member-constants'
import { displayFont } from '@/components/landing/fonts'

const D = displayFont.className

interface MemberListProps {
  members: any[]
  currentUserRole: string
  adminProfile: any
  clubMembers?: any[]
  sectionSuggestions?: SectionSuggestion[]
}

type SortKey = 'name' | 'xp' | 'gold' | 'recent'
type StatusFilter = 'all' | 'invested' | 'pending'
type View = 'list' | 'grid'

const VIEW_KEY = 'admin-members-view'

// Pequena "store" da vista escolhida: localStorage quando disponível, memória como reserva
// (em modo privado o localStorage pode falhar e a troca de vista tem de funcionar na mesma).
let memoryView: View | null = null
const viewListeners = new Set<() => void>()
function subscribeView(cb: () => void) {
  viewListeners.add(cb)
  return () => { viewListeners.delete(cb) }
}
function getSavedView(): View {
  if (memoryView) return memoryView
  try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list' } catch { return 'list' }
}
function changeView(v: View) {
  memoryView = v
  try { localStorage.setItem(VIEW_KEY, v) } catch {}
  viewListeners.forEach((l) => l())
}

function ageOf(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  const t = new Date()
  let age = t.getFullYear() - b.getUTCFullYear()
  if (t.getMonth() < b.getUTCMonth() || (t.getMonth() === b.getUTCMonth() && t.getDate() < b.getUTCDate())) age--
  return age
}

const levelOf = (xp: number) => Math.floor((xp || 0) / 1000) + 1

export function MemberList({ members, currentUserRole, adminProfile, clubMembers = [], sectionSuggestions = [] }: MemberListProps) {
  const canAssignHelpers = currentUserRole === 'coordenador' || currentUserRole === 'dirigente'
  const router = useRouter()
  const supabase = createClient()

  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortKey>('name')
  // Vista (lista/grelha) lembrada neste browser; no servidor é sempre 'list'.
  const view = useSyncExternalStore(subscribeView, getSavedView, () => 'list' as View)

  const [manageId, setManageId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  // Atualização otimista do estado de investidura.
  const [investedOverride, setInvestedOverride] = useState<Record<string, boolean>>({})

  const isInvested = (m: any) => investedOverride[m.id] ?? !!m.is_invested

  const sectionsPresent = Object.keys(SECTION_LABELS).filter((s) => members.some((m) => m.section === s))

  const investedCount = members.filter(isInvested).length
  const stats = { total: members.length, invested: investedCount, pending: members.length - investedCount }
  const leadersCount = members.filter((m) => m.role !== 'desbravador' || m.helper_role).length
  const missingBirth = members.filter((m) => !m.birth_date).length

  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const q = normalize(search.trim())
  const filtered = members
    .filter((m) => {
      if (q) {
        if (!normalize(m.full_name || '').includes(q)) return false
      }
      if (sectionFilter !== 'all' && m.section !== sectionFilter) return false
      if (roleFilter !== 'all' && m.role !== roleFilter) return false
      if (statusFilter === 'invested' && !isInvested(m)) return false
      if (statusFilter === 'pending' && isInvested(m)) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'xp') return (b.total_xp ?? 0) - (a.total_xp ?? 0)
      if (sortBy === 'gold') return (b.current_gold ?? 0) - (a.current_gold ?? 0)
      if (sortBy === 'recent') return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      return (a.full_name || '').localeCompare(b.full_name || '', 'pt')
    })

  const hasFilters = search || sectionFilter !== 'all' || roleFilter !== 'all' || statusFilter !== 'all'
  const managedMember = members.find((m) => m.id === manageId) ?? null

  const clearFilters = () => {
    setSearch('')
    setSectionFilter('all')
    setRoleFilter('all')
    setStatusFilter('all')
  }

  const handleToggleInvested = async (member: any) => {
    const next = !isInvested(member)
    setInvestedOverride((prev) => ({ ...prev, [member.id]: next }))
    const { error } = await supabase.rpc('set_member_invested', { p_member_id: member.id, p_invested: next })
    if (error) {
      setInvestedOverride((prev) => ({ ...prev, [member.id]: !next }))
      toast.error(error.message || 'Erro ao atualizar investidura.')
      return
    }
    toast.success(next ? `${member.full_name} marcado como investido.` : `Investidura de ${member.full_name} removida.`)
    router.refresh()
  }

  /** Exporta a lista filtrada para CSV (abre no Excel: separador ';' e BOM para os acentos). */
  const exportCsv = () => {
    const header = ['Nome', 'Classe', 'Cargo', 'Investido', 'Nível', 'XP', 'Gold', 'Data de nascimento', 'Idade', 'Membro desde']
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = filtered.map((m) => [
      m.full_name,
      SECTION_LABELS[m.section] || m.section,
      m.helper_role ? helperLabel(m) : ROLE_LABELS[m.role] || m.role,
      isInvested(m) ? 'Sim' : 'Não',
      levelOf(m.total_xp),
      m.total_xp ?? 0,
      m.current_gold ?? 0,
      m.birth_date ? new Date(m.birth_date).toLocaleDateString('pt-PT', { timeZone: 'UTC' }) : '',
      ageOf(m.birth_date) ?? '',
      m.created_at ? new Date(m.created_at).toLocaleDateString('pt-PT') : '',
    ])
    const BOM = String.fromCharCode(0xfeff) // para o Excel reconhecer UTF-8 (acentos)
    const csv = BOM + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `membros-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${filtered.length} membros exportados.`)
  }

  const statusChips: { id: StatusFilter; label: string; count: number; icon: any; active: string }[] = [
    { id: 'all', label: 'Todos', count: stats.total, icon: Users, active: 'bg-blue-950 text-white ring-blue-950' },
    { id: 'invested', label: 'Investidos', count: stats.invested, icon: UserCheck, active: 'bg-emerald-600 text-white ring-emerald-600' },
    { id: 'pending', label: 'Por investir', count: stats.pending, icon: UserX, active: 'bg-orange-500 text-white ring-orange-500' },
  ]

  const summary = [
    { icon: Users, label: 'Membros', value: stats.total, tone: 'bg-blue-600' },
    { icon: ShieldCheck, label: 'Investidos', value: `${stats.total ? Math.round((stats.invested / stats.total) * 100) : 0}%`, tone: 'bg-emerald-500' },
    { icon: UserX, label: 'Por investir', value: stats.pending, tone: stats.pending ? 'bg-orange-500' : 'bg-stone-300' },
    { icon: Crown, label: 'Líderes e ajudantes', value: leadersCount, tone: 'bg-violet-500' },
  ]

  /** Selos de cargo/ajudante/"Tu" de um membro. */
  const renderBadges = (member: any) => (
    <>
      {member.id === adminProfile?.id && (
        <span className="rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-950">TU</span>
      )}
      {member.role !== 'desbravador' && (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-700">{ROLE_LABELS[member.role] || member.role}</span>
      )}
      {member.role === 'dirigente' && member.leadership_section && (
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-700 ring-1 ring-inset ring-blue-200">
          Líder {SECTION_LABELS[member.leadership_section] || member.leadership_section}
        </span>
      )}
      {member.helper_role && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 ring-1 ring-inset ring-amber-300">{helperLabel(member)}</span>
      )}
    </>
  )

  const renderInvestSwitch = (member: any) => {
    const invested = isInvested(member)
    return (
      <label className="flex cursor-pointer items-center gap-2">
        <Switch
          checked={invested}
          onCheckedChange={() => handleToggleInvested(member)}
          className="data-[state=checked]:bg-emerald-600"
          aria-label={`Investidura de ${member.full_name}`}
        />
        <span className={`w-[4.5rem] text-xs font-bold ${invested ? 'text-emerald-700' : 'text-stone-400'}`}>
          {invested ? 'Investido' : 'Por investir'}
        </span>
      </label>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ──────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className={`${D} text-3xl font-extrabold tracking-tight text-blue-950`}>Membros</h2>
          <p className="text-sm text-stone-500">Pesquisa, filtra e gere pontos, cargos, investiduras e contas.</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-blue-950 shadow-sm ring-1 ring-stone-200 transition-colors hover:bg-stone-50 disabled:opacity-50"
          title="Descarregar a lista (com os filtros atuais) para abrir no Excel"
        >
          <Download className="h-4 w-4" /> Exportar ({filtered.length})
        </button>
      </div>

      {/* ── Resumo ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className={`${D} text-2xl font-extrabold leading-none text-blue-950`}>{s.value}</p>
              <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-stone-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {missingBirth > 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-inset ring-sky-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span><b>{missingBirth}</b> {missingBirth === 1 ? 'membro não tem' : 'membros não têm'} data de nascimento — sem ela não há aniversários nem sugestões de classe.</span>
        </div>
      )}

      {canAssignHelpers && (
        <HelperManager adminProfile={adminProfile} clubMembers={clubMembers} />
      )}

      {currentUserRole === 'coordenador' && <SectionSuggestions suggestions={sectionSuggestions} />}

      {/* ── Filtros ────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-[1.5rem] bg-white p-3 shadow-sm ring-1 ring-stone-200 sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar membro..."
              className="h-11 rounded-xl border-stone-200 bg-stone-50 pl-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-700"
                aria-label="Limpar pesquisa"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-11 w-full rounded-xl bg-white lg:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cargos</SelectItem>
                {Object.entries(ROLE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-11 w-full rounded-xl bg-white lg:w-40">
                <ArrowDownUp className="h-3.5 w-3.5 text-stone-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nome (A-Z)</SelectItem>
                <SelectItem value="xp">Mais XP</SelectItem>
                <SelectItem value="gold">Mais ouro</SelectItem>
                <SelectItem value="recent">Mais recentes</SelectItem>
              </SelectContent>
            </Select>
            <div className="col-span-2 flex rounded-xl bg-stone-100 p-1 sm:col-span-1">
              {([['list', List, 'Lista'], ['grid', LayoutGrid, 'Grelha']] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeView(v)}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors ${
                    view === v ? 'bg-white text-blue-950 shadow-sm' : 'text-stone-500 hover:text-blue-950'
                  }`}
                  aria-pressed={view === v}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Classes */}
        {sectionsPresent.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSectionFilter('all')}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset transition-colors ${
                sectionFilter === 'all' ? 'bg-blue-950 text-white ring-blue-950' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
              }`}
            >
              Todas as classes
            </button>
            {sectionsPresent.map((s) => {
              const count = members.filter((m) => m.section === s).length
              const active = sectionFilter === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSectionFilter(active ? 'all' : s)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset transition-colors ${
                    active ? `${SECTION_DOT[s]} text-white ring-transparent` : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {!active && <span className={`h-2 w-2 rounded-full ${SECTION_DOT[s]}`} />}
                  {SECTION_LABELS[s]}
                  <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/25' : 'bg-stone-100'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          {statusChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-bold ring-1 ring-inset transition-colors ${
                statusFilter === chip.id ? chip.active : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
              }`}
            >
              <chip.icon className="h-3.5 w-3.5" /> {chip.label}
              <span className={`rounded-full px-1.5 text-[10px] ${statusFilter === chip.id ? 'bg-white/25' : 'bg-stone-100'}`}>{chip.count}</span>
            </button>
          ))}
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="ml-1 cursor-pointer text-xs font-bold text-stone-500 underline-offset-2 hover:text-blue-950 hover:underline">
              Limpar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-stone-400">
            {filtered.length} de {members.length} membros
          </span>
        </div>
      </div>

      {/* ── Lista ──────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-stone-200 bg-white px-4 py-12 text-center text-stone-500">
          <Users className="mb-2 h-10 w-10 text-stone-300" />
          <p className="font-bold text-blue-950">{members.length === 0 ? 'Nenhum membro encontrado.' : 'Nenhum membro corresponde aos filtros.'}</p>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="mt-1 cursor-pointer text-sm font-bold text-blue-700 hover:underline">Limpar filtros</button>
          )}
        </div>
      ) : view === 'list' ? (
        <div className="divide-y divide-stone-100 overflow-hidden rounded-[1.5rem] bg-white shadow-sm ring-1 ring-stone-200">
          {filtered.map((member) => {
            const age = ageOf(member.birth_date)
            return (
              <div
                key={member.id}
                className="group flex flex-col gap-3 p-3 transition-colors hover:bg-stone-50/80 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
              >
                <button
                  type="button"
                  onClick={() => setManageId(member.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                >
                  <Avatar className={`h-11 w-11 shrink-0 ring-2 ring-offset-2 ${SECTION_RING[member.section] || 'ring-stone-200'}`}>
                    <AvatarImage src={member.avatar_url} className="object-cover" />
                    <AvatarFallback className="bg-stone-200 font-bold text-stone-500">{member.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate font-bold text-blue-950 group-hover:text-blue-700">{member.full_name}</h3>
                      {renderBadges(member)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-stone-500">
                        <span className={`h-2 w-2 rounded-full ${SECTION_DOT[member.section] || 'bg-stone-300'}`} />
                        {SECTION_LABELS[member.section] || member.section}
                      </span>
                      {age !== null && (
                        <span className="inline-flex items-center gap-1 text-stone-400"><Cake className="h-3 w-3" /> {age} anos</span>
                      )}
                      <span className="rounded-full bg-indigo-50 px-1.5 text-[10px] font-extrabold text-indigo-600">Nv {levelOf(member.total_xp)}</span>
                      <span className="inline-flex items-center gap-1 font-bold tabular-nums text-indigo-700">
                        <Trophy className="h-3 w-3" /> {member.total_xp ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1 font-bold tabular-nums text-amber-600">
                        <Coins className="h-3 w-3" /> {member.current_gold ?? 0}
                      </span>
                    </div>
                  </div>
                </button>

                <div className="flex items-center justify-between gap-4 pl-14 sm:justify-end sm:pl-0">
                  {renderInvestSwitch(member)}
                  <button
                    type="button"
                    onClick={() => setManageId(member.id)}
                    className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-blue-800 ring-1 ring-inset ring-blue-200 transition-colors hover:bg-blue-50"
                  >
                    <Settings2 className="h-4 w-4" /> Gerir
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => {
            const age = ageOf(member.birth_date)
            return (
              <article key={member.id} className="flex flex-col rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-stone-200 transition-shadow hover:shadow-md">
                <button type="button" onClick={() => setManageId(member.id)} className="flex cursor-pointer items-center gap-3 text-left">
                  <Avatar className={`h-14 w-14 shrink-0 ring-2 ring-offset-2 ${SECTION_RING[member.section] || 'ring-stone-200'}`}>
                    <AvatarImage src={member.avatar_url} className="object-cover" />
                    <AvatarFallback className="bg-stone-200 text-lg font-bold text-stone-500">{member.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-blue-950">{member.full_name}</h3>
                    <p className="flex items-center gap-1.5 text-xs text-stone-500">
                      <span className={`h-2 w-2 rounded-full ${SECTION_DOT[member.section] || 'bg-stone-300'}`} />
                      {SECTION_LABELS[member.section] || member.section}
                      {age !== null && <span className="text-stone-400">· {age} anos</span>}
                    </p>
                  </div>
                </button>
                <div className="mt-3 flex min-h-5 flex-wrap gap-1.5">{renderBadges(member)}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-indigo-50 py-2">
                    <p className={`${D} text-lg font-extrabold leading-none text-indigo-700`}>{levelOf(member.total_xp)}</p>
                    <p className="text-[10px] font-bold uppercase text-indigo-400">Nível</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 py-2">
                    <p className={`${D} text-lg font-extrabold leading-none text-blue-950`}>{member.total_xp ?? 0}</p>
                    <p className="text-[10px] font-bold uppercase text-stone-400">XP</p>
                  </div>
                  <div className="rounded-xl bg-yellow-50 py-2">
                    <p className={`${D} text-lg font-extrabold leading-none text-amber-600`}>{member.current_gold ?? 0}</p>
                    <p className="text-[10px] font-bold uppercase text-amber-500">Gold</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone-100 pt-3">
                  {renderInvestSwitch(member)}
                  <button
                    type="button"
                    onClick={() => setManageId(member.id)}
                    className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-blue-800 ring-1 ring-inset ring-blue-200 transition-colors hover:bg-blue-50"
                  >
                    <Settings2 className="h-4 w-4" /> Gerir
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ManageMemberDialog
        member={managedMember}
        open={!!managedMember}
        onOpenChange={(open) => !open && setManageId(null)}
        adminProfile={adminProfile}
        currentUserRole={currentUserRole}
        suggestion={sectionSuggestions.find((s) => s.id === managedMember?.id) ?? null}
        coordinatorCount={members.filter((m) => m.role === 'coordenador').length}
        onRequestDelete={(m) => {
          setManageId(null)
          setDeleteTarget(m)
        }}
      />

      <DeleteMemberDialog
        member={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  )
}
