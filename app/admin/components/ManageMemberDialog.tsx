'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertTriangle, ArrowRight, Coins, GraduationCap, History, KeyRound, MinusCircle, PlusCircle, Shield, Trash2, Trophy, UserCog, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { triggerResetPassword } from '../actions'
import { SECTION_LABELS, helperLabel } from '@/utils/permissions'
import { ROLE_LABELS, SECTION_DOT } from './member-constants'
import type { SectionSuggestion } from './SectionSuggestions'
import { detectGender } from '@/utils/name-gender'

const PRESETS = [5, 10, 25, 50, 100]

interface ManageMemberDialogProps {
  member: any | null
  open: boolean
  onOpenChange: (open: boolean) => void
  adminProfile: any
  currentUserRole: string
  suggestion?: SectionSuggestion | null
  coordinatorCount?: number
  onRequestDelete: (member: any) => void
}

export function ManageMemberDialog({
  member, open, onOpenChange, adminProfile, currentUserRole, suggestion, coordinatorCount = 0, onRequestDelete,
}: ManageMemberDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const isCoordenador = currentUserRole === 'coordenador'
  const isSelf = member?.id === adminProfile?.id
  // Só o coordenador REAL pode dar pontos a si próprio (fica destacado na Auditoria).
  const isRealCoordenador = adminProfile?.role === 'coordenador' && !adminProfile?.helper_role
  const selfAwardBlocked = isSelf && !isRealCoordenador
  const canDelete = isCoordenador && !isSelf && member?.role !== 'coordenador'

  const [tab, setTab] = useState('points')
  const [isPenalty, setIsPenalty] = useState(false)
  const [amountXP, setAmountXP] = useState(0)
  const [amountGold, setAmountGold] = useState(0)
  const [description, setDescription] = useState('')
  const [tempRole, setTempRole] = useState('')
  const [tempSection, setTempSection] = useState('')
  const [tempLeadership, setTempLeadership] = useState('none')
  const [savingPoints, setSavingPoints] = useState(false)
  const [savingRole, setSavingRole] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const [resetInvestiture, setResetInvestiture] = useState(true)
  const [notifyMember, setNotifyMember] = useState(true)
  const [sectionHistory, setSectionHistory] = useState<any[]>([])
  const [gender, setGender] = useState<string | null>(null)
  const [savingGender, setSavingGender] = useState(false)

  // Repõe o formulário sempre que se abre para um membro.
  useEffect(() => {
    if (!open || !member) return
    setTab('points')
    setIsPenalty(false)
    setAmountXP(0)
    setAmountGold(0)
    setDescription('')
    setTempRole(member.role)
    setTempSection(member.section)
    setTempLeadership(member.leadership_section || 'none')
    setConfirmReset(false)
    setResetInvestiture(true)
    setNotifyMember(true)
    setSectionHistory([])
    setGender(member.gender ?? null)
  }, [open, member?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Histórico de classes (só a coordenação gere classes).
  useEffect(() => {
    if (!open || !member || !isCoordenador) return
    let cancelled = false
    supabase
      .from('section_changes')
      .select('id, from_section, to_section, reason, investiture_reset, created_at, changer:profiles!section_changes_changed_by_fkey(full_name)')
      .eq('user_id', member.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (!cancelled) setSectionHistory(data || []) })
    return () => { cancelled = true }
  }, [open, member?.id, isCoordenador]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!member) return null

  const sign = isPenalty ? -1 : 1
  const deltaXP = sign * Math.abs(amountXP || 0)
  const deltaGold = sign * Math.abs(amountGold || 0)
  const hasPoints = deltaXP !== 0 || deltaGold !== 0
  const nextXP = (member.total_xp ?? 0) + deltaXP
  const nextGold = (member.current_gold ?? 0) + deltaGold

  const sectionChanged = tempSection !== member.section
  const onlyRoleChanged =
    tempRole !== member.role ||
    (tempRole === 'dirigente' ? tempLeadership : 'none') !== (member.leadership_section || 'none')
  const roleChanged = sectionChanged || onlyRoleChanged
  // O clube nunca pode ficar sem coordenador (a BD também o impede).
  const removesLastCoordinator = member.role === 'coordenador' && tempRole !== 'coordenador' && coordinatorCount <= 1
  const promotesHelper = !!member.helper_role && tempRole !== 'desbravador'

  const handleGender = async (g: 'm' | 'f') => {
    const prev = gender
    setGender(g)
    setSavingGender(true)
    const { error } = await supabase.from('profiles').update({ gender: g }).eq('id', member.id)
    setSavingGender(false)
    if (error) {
      setGender(prev)
      toast.error('Não foi possível guardar o sexo.')
      return
    }
    router.refresh()
  }

  const handlePoints = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasPoints) return
    setSavingPoints(true)
    try {
      const { error } = await supabase.from('points_log').insert({
        target_user_id: member.id,
        awarded_by_user_id: adminProfile.id,
        amount_xp: deltaXP,
        amount_gold: deltaGold,
        description: description.trim() || (isPenalty ? 'Penalização disciplinar' : 'Prémio de mérito'),
      })
      if (error) throw error
      toast.success(isPenalty ? 'Penalização aplicada.' : 'Prémio atribuído!')
      onOpenChange(false)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar pontos.')
    } finally {
      setSavingPoints(false)
    }
  }

  const handleRole = async () => {
    setSavingRole(true)
    try {
      if (sectionChanged) {
        const { error } = await supabase.rpc('change_member_section', {
          p_member_id: member.id,
          p_section: tempSection,
          p_reset_investiture: resetInvestiture,
          p_notify: notifyMember,
        })
        if (error) throw error
      }
      if (onlyRoleChanged) {
        const { error } = await supabase
          .from('profiles')
          .update({
            role: tempRole,
            leadership_section: tempRole === 'dirigente' && tempLeadership !== 'none' ? tempLeadership : null,
          })
          .eq('id', member.id)
        if (error) throw error
      }
      toast.success(sectionChanged ? `${member.full_name} passou para os ${SECTION_LABELS[tempSection]}.` : 'Cargo atualizado!')
      onOpenChange(false)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar cargo.')
    } finally {
      setSavingRole(false)
    }
  }

  const handleResetPassword = async () => {
    setSendingReset(true)
    try {
      await triggerResetPassword(member.id)
      toast.success('Email de recuperação enviado!')
      setConfirmReset(false)
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar email de recuperação.')
    } finally {
      setSendingReset(false)
    }
  }

  const accent = isPenalty
    ? { box: 'bg-red-50/60 border-red-100', ring: 'border-red-200 focus-visible:ring-red-500', chip: 'hover:bg-red-100 text-red-700 border-red-200' }
    : { box: 'bg-blue-50/60 border-blue-100', ring: 'border-blue-200 focus-visible:ring-blue-500', chip: 'hover:bg-blue-100 text-blue-700 border-blue-200' }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 max-h-[92vh] overflow-y-auto">
        {/* Cabeçalho com resumo do membro */}
        <DialogHeader className="p-5 pb-4 border-b bg-slate-50/70 text-left">
          <div className="flex items-center gap-3 pr-6">
            <Avatar className="h-14 w-14 border-2 border-white shadow-sm shrink-0">
              <AvatarImage src={member.avatar_url} className="object-cover" />
              <AvatarFallback className="bg-slate-200 text-slate-600 font-bold">{member.full_name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="text-lg leading-tight truncate">{member.full_name}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <Badge variant="secondary" className="text-[10px] h-5 bg-white border-slate-200 text-slate-600">
                    {ROLE_LABELS[member.role] || member.role}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <span className={`h-2 w-2 rounded-full ${SECTION_DOT[member.section] || 'bg-slate-400'}`} />
                    {SECTION_LABELS[member.section] || member.section}
                  </span>
                  {member.helper_role && (
                    <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-700 bg-amber-50">
                      {helperLabel(member)}
                    </Badge>
                  )}
                </div>
              </DialogDescription>
            </div>
          </div>
          {isCoordenador && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Sexo</span>
              {(['m', 'f'] as const).map((g) => {
                const current = gender === 'm' || gender === 'f' ? gender : null
                const guess = current ? null : detectGender(member.full_name || '')
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => handleGender(g)}
                    disabled={savingGender}
                    className={`h-7 rounded-md px-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                      current === g
                        ? g === 'm' ? 'bg-sky-600 text-white' : 'bg-pink-600 text-white'
                        : guess === g
                          ? 'border border-dashed border-slate-400 bg-white text-slate-600'
                          : 'border bg-white text-slate-400 hover:text-slate-700'
                    }`}
                    title={guess === g ? 'Palpite pelo nome — carrega para guardar' : undefined}
                  >
                    {g === 'm' ? '♂ Masculino' : '♀ Feminino'}
                  </button>
                )
              })}
              {gender !== 'm' && gender !== 'f' && <span className="text-[11px] text-slate-400">não indicado</span>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="rounded-lg bg-white border px-3 py-2">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">XP</p>
              <p className="font-bold text-indigo-700 flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />{member.total_xp ?? 0}</p>
            </div>
            <div className="rounded-lg bg-white border px-3 py-2">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Ouro</p>
              <p className="font-bold text-yellow-700 flex items-center gap-1"><Coins className="w-3.5 h-3.5" />{member.current_gold ?? 0}</p>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="p-5 pt-4 gap-4">
          <TabsList className="grid w-full grid-cols-3 h-10">
            <TabsTrigger value="points"><Wallet /> Pontos</TabsTrigger>
            <TabsTrigger value="role" disabled={!isCoordenador}><UserCog /> Cargo</TabsTrigger>
            <TabsTrigger value="account"><Shield /> Conta</TabsTrigger>
          </TabsList>

          {/* ─── Pontos ─── */}
          <TabsContent value="points">
            <form onSubmit={handlePoints} className="space-y-4">
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setIsPenalty(false)}
                  className={`flex items-center justify-center gap-2 h-9 rounded-md text-sm font-semibold transition-all ${!isPenalty ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <PlusCircle className="w-4 h-4" /> Prémio
                </button>
                <button
                  type="button"
                  onClick={() => setIsPenalty(true)}
                  className={`flex items-center justify-center gap-2 h-9 rounded-md text-sm font-semibold transition-all ${isPenalty ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <MinusCircle className="w-4 h-4" /> Penalização
                </button>
              </div>

              <div className={`space-y-3 border p-4 rounded-xl transition-colors ${accent.box}`}>
                {([
                  { id: 'xp', label: isPenalty ? 'Retirar XP' : 'Dar XP', icon: <Trophy className="w-3.5 h-3.5 text-indigo-600" />, value: amountXP, set: setAmountXP },
                  { id: 'gold', label: isPenalty ? 'Retirar Ouro' : 'Dar Ouro', icon: <Coins className="w-3.5 h-3.5 text-yellow-600" />, value: amountGold, set: setAmountGold },
                ]).map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label htmlFor={field.id} className="text-xs font-bold flex items-center gap-1">{field.icon} {field.label}</Label>
                    <div className="flex gap-2">
                      <Input
                        id={field.id}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={field.value === 0 ? '' : field.value}
                        placeholder="0"
                        onChange={(e) => field.set(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                        className={`bg-white w-24 shrink-0 ${accent.ring}`}
                      />
                      <div className="flex flex-wrap gap-1">
                        {PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => field.set(field.value + p)}
                            className={`h-9 px-2.5 rounded-md border bg-white text-xs font-semibold transition-colors ${accent.chip}`}
                          >
                            +{p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reason" className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Motivo</Label>
                <Input
                  id="reason"
                  placeholder={isPenalty ? 'Ex: Má conduta na reunião' : 'Ex: Ajudou a montar o acampamento'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {hasPoints && (
                <div className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-600 space-y-1">
                  {deltaXP !== 0 && (
                    <p className="flex items-center gap-2">
                      <Trophy className="w-3 h-3 text-indigo-500" /> {member.total_xp ?? 0}
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="font-bold text-slate-900">{nextXP} XP</span>
                    </p>
                  )}
                  {deltaGold !== 0 && (
                    <p className="flex items-center gap-2">
                      <Coins className="w-3 h-3 text-yellow-500" /> {member.current_gold ?? 0}
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className={`font-bold ${nextGold < 0 ? 'text-red-600' : 'text-slate-900'}`}>{nextGold} Ouro</span>
                    </p>
                  )}
                  {(nextGold < 0 || nextXP < 0) && (
                    <p className="flex items-center gap-1 text-red-600 font-semibold pt-1">
                      <AlertTriangle className="w-3 h-3" /> O saldo ficará negativo.
                    </p>
                  )}
                </div>
              )}

              {selfAwardBlocked && (
                <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Não podes atribuir pontos a ti próprio. Pede a um coordenador.
                </p>
              )}
              {isSelf && !selfAwardBlocked && (
                <p className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Shield className="w-4 h-4 shrink-0" />
                  Estás a dar pontos a ti próprio. É permitido à coordenação, mas fica registado na Auditoria como auto-atribuição.
                </p>
              )}

              <Button
                type="submit"
                disabled={!hasPoints || savingPoints || selfAwardBlocked}
                className={`w-full h-11 font-bold ${isPenalty ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-800 hover:bg-blue-900'}`}
              >
                {savingPoints ? 'A processar...' : isPenalty ? 'Aplicar penalização' : 'Atribuir prémio'}
              </Button>
            </form>
          </TabsContent>

          {/* ─── Cargo (só coordenador) ─── */}
          {isCoordenador && (
            <TabsContent value="role" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Cargo</Label>
                  <Select value={tempRole} onValueChange={setTempRole}>
                    <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Classe pessoal</Label>
                  <Select value={tempSection} onValueChange={setTempSection}>
                    <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SECTION_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          <span className={`h-2 w-2 rounded-full ${SECTION_DOT[val]}`} /> {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {suggestion && tempSection !== suggestion.suggested_section && (
                <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                  <GraduationCap className="w-4 h-4 shrink-0" />
                  <span className="flex-1">
                    Pela idade ({suggestion.age} anos) devia estar nos <strong>{SECTION_LABELS[suggestion.suggested_section]}</strong>.
                  </span>
                  <button type="button" onClick={() => setTempSection(suggestion.suggested_section)} className="font-semibold text-indigo-700 hover:underline">
                    Usar
                  </button>
                </div>
              )}

              {sectionChanged && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <p className="flex items-center gap-2 text-sm font-semibold text-blue-950">
                    <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${SECTION_DOT[member.section]}`} />{SECTION_LABELS[member.section]}</span>
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                    <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${SECTION_DOT[tempSection]}`} />{SECTION_LABELS[tempSection]}</span>
                  </p>
                  <ul className="text-xs text-blue-900/80 space-y-1 list-disc pl-4">
                    <li>Passa a ver as tarefas e eventos dos {SECTION_LABELS[tempSection]}.</li>
                    <li>Os comunicados que já recebeu continuam visíveis; os novos da classe antiga deixam de chegar.</li>
                    <li>XP, ouro e histórico de pontos mantêm-se.</li>
                  </ul>
                  <div className="flex flex-col gap-1.5 pt-1 text-xs text-slate-700">
                    {member.is_invested && (
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={resetInvestiture} onChange={(e) => setResetInvestiture(e.target.checked)} className="h-4 w-4 accent-blue-700" />
                        Reiniciar investidura (terá de ser investido na nova classe)
                      </label>
                    )}
                    {tempRole === 'desbravador' && (
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={notifyMember} onChange={(e) => setNotifyMember(e.target.checked)} className="h-4 w-4 accent-blue-700" />
                        Enviar comunicado ao membro a avisar da mudança
                      </label>
                    )}
                  </div>
                </div>
              )}

              {tempRole === 'dirigente' && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">Responsável pela classe</Label>
                  <Select value={tempLeadership} onValueChange={setTempLeadership}>
                    <SelectTrigger className="w-full bg-white border-blue-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {Object.entries(SECTION_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {removesLastCoordinator ? (
                <p className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {isSelf ? 'És o único coordenador.' : 'Este é o único coordenador.'} Promove primeiro outra pessoa a Coordenador; depois já é possível mudar este cargo.
                </p>
              ) : isSelf && member.role === 'coordenador' && tempRole !== 'coordenador' && (
                <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Estás a retirar o teu próprio cargo de coordenador. Vais perder acesso a esta área assim que guardares.
                </p>
              )}

              {promotesHelper && (
                <p className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Shield className="w-4 h-4 shrink-0" />
                  Este membro é {helperLabel(member)}. Ao passar a {ROLE_LABELS[tempRole]}, deixa de ser ajudante e sai do ranking.
                </p>
              )}

              <Button onClick={handleRole} disabled={!roleChanged || savingRole || removesLastCoordinator} className="w-full h-11 font-bold bg-blue-800 hover:bg-blue-900">
                {savingRole ? 'A guardar...' : sectionChanged ? `Mudar para ${SECTION_LABELS[tempSection]}` : 'Guardar cargo'}
              </Button>

              {sectionHistory.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <History className="w-3 h-3" /> Histórico de classes
                  </p>
                  <ul className="space-y-1.5">
                    {sectionHistory.map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                        <span className="text-slate-400 tabular-nums">{new Date(h.created_at).toLocaleDateString('pt-PT')}</span>
                        <span className="font-medium text-slate-800">
                          {h.from_section ? SECTION_LABELS[h.from_section] : '—'} → {SECTION_LABELS[h.to_section]}
                        </span>
                        <span className="text-slate-400">
                          {h.reason === 'idade' ? 'pela idade' : h.reason === 'onboarding' ? 'no registo' : 'manual'}
                          {h.changer?.full_name ? ` · ${h.changer.full_name}` : ''}
                          {h.investiture_reset ? ' · investidura reiniciada' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>
          )}

          {/* ─── Conta ─── */}
          <TabsContent value="account" className="space-y-3">
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-900">Recuperar password</p>
                  <p className="text-xs text-slate-500">Envia ao membro um email com um link para definir nova password.</p>
                </div>
              </div>
              {confirmReset ? (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setConfirmReset(false)} disabled={sendingReset}>Cancelar</Button>
                  <Button className="flex-1 bg-blue-800 hover:bg-blue-900" onClick={handleResetPassword} disabled={sendingReset}>
                    {sendingReset ? 'A enviar...' : 'Confirmar envio'}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setConfirmReset(true)}>
                  Enviar email de recuperação
                </Button>
              )}
            </div>

            {isCoordenador && (
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-red-700">Apagar conta</p>
                    <p className="text-xs text-red-600/80">
                      {isSelf
                        ? 'Para apagar a tua conta usa a página de Perfil.'
                        : member.role === 'coordenador'
                          ? 'Não é possível apagar um coordenador. Altera primeiro o cargo.'
                          : 'Remove permanentemente o perfil, XP, ouro, compras e histórico.'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled={!canDelete}
                  onClick={() => onRequestDelete(member)}
                  className="w-full border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                >
                  Apagar conta de {member.full_name?.split(' ')[0]}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
