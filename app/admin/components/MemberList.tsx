'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowDownUp, Coins, Search, Settings2, Trophy, UserCheck, UserX, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { HelperManager } from './HelperManager'
import { ManageMemberDialog } from './ManageMemberDialog'
import { DeleteMemberDialog } from './DeleteMemberDialog'
import { SECTION_LABELS, helperLabel } from '@/utils/permissions'
import { ROLE_LABELS, SECTION_DOT, SECTION_RING } from './member-constants'

interface MemberListProps {
  members: any[]
  currentUserRole: string
  adminProfile: any
  clubMembers?: any[]
}

type SortKey = 'name' | 'xp' | 'gold'
type StatusFilter = 'all' | 'invested' | 'pending'

export function MemberList({ members, currentUserRole, adminProfile, clubMembers = [] }: MemberListProps) {
  const canAssignHelpers = currentUserRole === 'coordenador' || currentUserRole === 'dirigente'
  const router = useRouter()
  const supabase = createClient()

  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortKey>('name')

  const [manageId, setManageId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  // Atualização otimista do estado de investidura.
  const [investedOverride, setInvestedOverride] = useState<Record<string, boolean>>({})

  const isInvested = (m: any) => investedOverride[m.id] ?? !!m.is_invested

  const sectionsPresent = Object.keys(SECTION_LABELS).filter((s) => members.some((m) => m.section === s))

  const investedCount = members.filter(isInvested).length
  const stats = { total: members.length, invested: investedCount, pending: members.length - investedCount }

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
    const { error } = await supabase.from('profiles').update({ is_invested: next }).eq('id', member.id)
    if (error) {
      setInvestedOverride((prev) => ({ ...prev, [member.id]: !next }))
      toast.error('Erro ao atualizar investidura.')
      return
    }
    toast.success(next ? `${member.full_name} marcado como investido.` : `Investidura de ${member.full_name} removida.`)
    router.refresh()
  }

  const statusChips: { id: StatusFilter; label: string; count: number; icon: any; active: string }[] = [
    { id: 'all', label: 'Todos', count: stats.total, icon: Users, active: 'bg-blue-900 text-white border-blue-900' },
    { id: 'invested', label: 'Investidos', count: stats.invested, icon: UserCheck, active: 'bg-emerald-600 text-white border-emerald-600' },
    { id: 'pending', label: 'Por investir', count: stats.pending, icon: UserX, active: 'bg-orange-500 text-white border-orange-500' },
  ]

  return (
    <div className="space-y-5">
      {canAssignHelpers && (
        <HelperManager adminProfile={adminProfile} clubMembers={clubMembers} />
      )}

      {/* Barra de filtros */}
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar membro..."
              className="pl-9 h-10 bg-white"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700"
                aria-label="Limpar pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex gap-2">
            {sectionsPresent.length > 1 && (
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger className="h-10 w-full lg:w-44 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as classes</SelectItem>
                  {sectionsPresent.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className={`h-2 w-2 rounded-full ${SECTION_DOT[s]}`} /> {SECTION_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-10 w-full lg:w-40 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cargos</SelectItem>
                {Object.entries(ROLE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-10 w-full lg:w-40 bg-white col-span-2 sm:col-span-1">
                <ArrowDownUp className="w-3.5 h-3.5 text-slate-400" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nome (A-Z)</SelectItem>
                <SelectItem value="xp">Mais XP</SelectItem>
                <SelectItem value="gold">Mais ouro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {statusChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold transition-colors ${
                statusFilter === chip.id ? chip.active : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <chip.icon className="w-3.5 h-3.5" /> {chip.label}
              <span className={`rounded-full px-1.5 text-[10px] ${statusFilter === chip.id ? 'bg-white/25' : 'bg-slate-100'}`}>{chip.count}</span>
            </button>
          ))}
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline ml-1">
              Limpar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {filtered.length} de {members.length} membros
          </span>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-xl border bg-white divide-y overflow-hidden">
        {filtered.map((member) => {
          const invested = isInvested(member)
          return (
            <div
              key={member.id}
              className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:px-4 hover:bg-slate-50/80 transition-colors"
            >
              <button
                type="button"
                onClick={() => setManageId(member.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <Avatar className={`h-11 w-11 shrink-0 ring-2 ring-offset-2 ${SECTION_RING[member.section] || 'ring-slate-200'}`}>
                  <AvatarImage src={member.avatar_url} className="object-cover" />
                  <AvatarFallback className="bg-slate-200 text-slate-500 font-bold">{member.full_name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-semibold text-slate-900 truncate group-hover:text-blue-800">{member.full_name}</h3>
                    {member.id === adminProfile?.id && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-slate-300 text-slate-500">Tu</Badge>
                    )}
                    {member.role !== 'desbravador' && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-slate-100 text-slate-600 border-none font-bold">
                        {ROLE_LABELS[member.role] || member.role}
                      </Badge>
                    )}
                    {member.role === 'dirigente' && member.leadership_section && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-200 text-blue-700 bg-blue-50 font-bold">
                        Líder {SECTION_LABELS[member.leadership_section] || member.leadership_section}
                      </Badge>
                    )}
                    {member.helper_role && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-300 text-amber-700 bg-amber-50 font-bold">
                        {helperLabel(member)}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${SECTION_DOT[member.section] || 'bg-slate-300'}`} />
                      {SECTION_LABELS[member.section] || member.section}
                    </span>
                    <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold tabular-nums">
                      <Trophy className="w-3 h-3" /> {member.total_xp ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1 text-yellow-700 font-semibold tabular-nums">
                      <Coins className="w-3 h-3" /> {member.current_gold ?? 0}
                    </span>
                  </div>
                </div>
              </button>

              <div className="flex items-center justify-between sm:justify-end gap-4 pl-14 sm:pl-0">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`invested-${member.id}`}
                    checked={invested}
                    onCheckedChange={() => handleToggleInvested(member)}
                    className="data-[state=checked]:bg-emerald-600"
                  />
                  <Label
                    htmlFor={`invested-${member.id}`}
                    className={`text-xs font-semibold cursor-pointer w-20 ${invested ? 'text-emerald-700' : 'text-slate-400'}`}
                  >
                    {invested ? 'Investido' : 'Por investir'}
                  </Label>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setManageId(member.id)}
                  className="border-blue-200 text-blue-800 hover:bg-blue-50 hover:border-blue-400"
                >
                  <Settings2 className="w-4 h-4" /> Gerir
                </Button>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4 text-slate-500">
            <Users className="w-10 h-10 text-slate-300 mb-2" />
            <p className="font-medium">{members.length === 0 ? 'Nenhum membro encontrado.' : 'Nenhum membro corresponde aos filtros.'}</p>
            {hasFilters && (
              <Button variant="link" size="sm" onClick={clearFilters}>Limpar filtros</Button>
            )}
          </div>
        )}
      </div>

      <ManageMemberDialog
        member={managedMember}
        open={!!managedMember}
        onOpenChange={(open) => !open && setManageId(null)}
        adminProfile={adminProfile}
        currentUserRole={currentUserRole}
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
