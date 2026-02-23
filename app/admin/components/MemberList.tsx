'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Coins, Trophy, UserCheck, UserX, Shield, AlertTriangle, PlusCircle, MinusCircle, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { triggerResetPassword } from '../actions'

interface MemberListProps {
  members: any[]
  currentUserRole: string
  adminProfile: any
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

export function MemberList({ members, currentUserRole, adminProfile }: MemberListProps) {
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [pointsOpen, setPointsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Form State
  const [amountXP, setAmountXP] = useState(0)
  const [amountGold, setAmountGold] = useState(0)
  const [description, setDescription] = useState('')
  const [tempRole, setTempRole] = useState('')
  const [tempSection, setTempSection] = useState('')
  const [tempLeadership, setTempLeadership] = useState('none')
  const [isPenalty, setIsPenalty] = useState(false)

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const finalXP = isPenalty ? -Math.abs(amountXP) : Math.abs(amountXP)
      const finalGold = isPenalty ? -Math.abs(amountGold) : Math.abs(amountGold)

      if (finalXP !== 0 || finalGold !== 0) {
        const { error: logError } = await supabase
          .from('points_log')
          .insert({
            target_user_id: selectedMember.id,
            awarded_by_user_id: adminProfile.id,
            amount_xp: finalXP,
            amount_gold: finalGold,
            description: description || (isPenalty ? 'Penalização disciplinar' : 'Prémio de mérito'),
          })
        if (logError) throw logError
      }

      if (currentUserRole === 'coordenador') {
          const updateData: any = {
              role: tempRole,
              section: tempSection,
              leadership_section: tempLeadership === 'none' ? null : tempLeadership
          }

          const { error: profileError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', selectedMember.id)

          if (profileError) throw profileError
      }

      toast.success(isPenalty ? `Penalização aplicada!` : `Atualizado com sucesso!`)
      setPointsOpen(false)
      setAmountXP(0)
      setAmountGold(0)
      setDescription('')
      setIsPenalty(false)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar membro.')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleInvested = async (memberId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_invested: !currentStatus })
        .eq('id', memberId)
      if (error) throw error
      toast.success('Estado de investidura atualizado!')
      router.refresh()
    } catch (error) {
      toast.error('Erro ao atualizar estado.')
    }
  }

  const handleResetPassword = async (memberId: string) => {
    if (!confirm('Tem a certeza que deseja enviar um email de recuperação de password para este membro?')) return

    setLoading(true)
    try {
      const result = await triggerResetPassword(memberId)
      if (result.success) {
        toast.success('Email de recuperação enviado com sucesso!')
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar email de recuperação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {members.map((member) => (
        <div key={member.id} className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
           <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10 border">
                    <AvatarImage src={member.avatar_url} />
                    <AvatarFallback>{member.full_name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{member.full_name}</h3>
                      <Badge variant="secondary" className="text-[10px] h-4 bg-slate-100 text-slate-600 border-none capitalize">
                        {member.role === 'desbravador' ? 'Membro' : member.role}
                      </Badge>
                      {member.role === 'dirigente' && member.leadership_section && (
                        <Badge variant="outline" className="text-[10px] h-4 border-blue-200 text-blue-700 bg-blue-50">
                          Líder {SECTION_LABELS[member.leadership_section] || member.leadership_section}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-indigo-600 font-medium">
                            <Trophy className="w-3 h-3" /> {member.total_xp} XP
                        </span>
                        <span className="flex items-center gap-1 text-yellow-600 font-medium">
                            <Coins className="w-3 h-3" /> {member.current_gold} Ouro
                        </span>
                        <span className="text-gray-300">|</span>
                        <span className="capitalize">{SECTION_LABELS[member.section] || member.section}</span>
                    </div>
                </div>
           </div>

           <div className="flex items-center gap-4">
               <div className="flex flex-col items-end gap-1">
                   <Label htmlFor={`invested-${member.id}`} className="text-xs text-gray-500 cursor-pointer text-[10px] uppercase font-bold">Investido</Label>
                   <Switch 
                        id={`invested-${member.id}`}
                        checked={member.is_invested}
                        onCheckedChange={() => handleToggleInvested(member.id, member.is_invested)}
                   />
               </div>
               
                <Dialog open={pointsOpen && selectedMember?.id === member.id} onOpenChange={(open) => {
                   setPointsOpen(open)
                   if (open) {
                       setSelectedMember(member)
                       setTempRole(member.role)
                       setTempSection(member.section)
                       setTempLeadership(member.leadership_section || 'none')
                       setIsPenalty(false)
                   }
                }}>
                   <DialogTrigger asChild>
                       <Button size="sm" variant="outline" className="border-blue-600 text-blue-700 hover:bg-blue-50">
                           Gerir
                       </Button>
                   </DialogTrigger>
                   <DialogContent className="sm:max-w-[450px]">
                       <DialogHeader>
                           <DialogTitle>Gerir Membro: {member.full_name}</DialogTitle>
                           <DialogDescription>
                               Ajuste os pontos ou altere os cargos deste membro.
                           </DialogDescription>
                       </DialogHeader>
                       
                       <Tabs defaultValue="reward" value={isPenalty ? "penalty" : "reward"} onValueChange={(v: string) => setIsPenalty(v === "penalty")} className="w-full">
                         <TabsList className="grid w-full grid-cols-2 h-10">
                           <TabsTrigger value="reward" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                             <PlusCircle className="w-4 h-4 mr-2" /> Prémio
                           </TabsTrigger>
                           <TabsTrigger value="penalty" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                             <MinusCircle className="w-4 h-4 mr-2" /> Penalização
                           </TabsTrigger>
                         </TabsList>
                       </Tabs>

                       <form onSubmit={handleUpdateMember} className="space-y-6 pt-2">
                           {/* Points Section */}
                           <div className={`grid grid-cols-2 gap-4 border p-4 rounded-xl transition-colors ${isPenalty ? 'bg-red-50/50 border-red-100' : 'bg-blue-50/50 border-blue-100'}`}>
                               <div className="space-y-2">
                                   <Label htmlFor="xp" className="text-xs font-bold flex items-center gap-1">
                                     {isPenalty ? <><AlertTriangle className="w-3 h-3 text-red-600" /> Retirar XP</> : <><Trophy className="w-3 h-3 text-blue-600" /> Dar XP</>}
                                   </Label>
                                   <Input id="xp" type="number" min={0} value={amountXP} onChange={(e) => setAmountXP(Number(e.target.value))} className={`bg-white ${isPenalty ? 'border-red-200 focus-visible:ring-red-500' : 'border-blue-200 focus-visible:ring-blue-500'}`} />
                               </div>
                               <div className="space-y-2">
                                   <Label htmlFor="gold" className="text-xs font-bold flex items-center gap-1">
                                     {isPenalty ? <><AlertTriangle className="w-3 h-3 text-red-600" /> Retirar Ouro</> : <><Coins className="w-3 h-3 text-yellow-600" /> Dar Ouro</>}
                                   </Label>
                                   <Input id="gold" type="number" min={0} value={amountGold} onChange={(e) => setAmountGold(Number(e.target.value))} className={`bg-white ${isPenalty ? 'border-red-200 focus-visible:ring-red-500' : 'border-blue-200 focus-visible:ring-blue-500'}`} />
                               </div>
                           </div>

                           {currentUserRole === 'coordenador' && (
                             <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="flex items-center gap-2 mb-1 text-xs font-bold text-slate-600">
                                   <Shield className="w-3 h-3" /> Painel do Coordenador
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500">Cargo</Label>
                                    <Select value={tempRole} onValueChange={setTempRole}>
                                      <SelectTrigger className="h-9 text-xs bg-white"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="desbravador">Membro</SelectItem>
                                        <SelectItem value="dirigente">Dirigente</SelectItem>
                                        <SelectItem value="coordenador">Coordenador</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500">Classe Pessoal</Label>
                                    <Select value={tempSection} onValueChange={setTempSection}>
                                      <SelectTrigger className="h-9 text-xs bg-white"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {Object.entries(SECTION_LABELS).map(([val, label]) => (
                                          <SelectItem key={val} value={val}>{label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                
                                {tempRole === 'dirigente' && (
                                  <div className="space-y-1 mt-2">
                                    <Label className="text-[10px] uppercase text-blue-700 font-bold">Responsável por (Liderança)</Label>
                                    <Select value={tempLeadership} onValueChange={setTempLeadership}>
                                      <SelectTrigger className="h-9 text-xs border-blue-200 bg-white"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">Nenhuma</SelectItem>
                                        {Object.entries(SECTION_LABELS).map(([val, label]) => (
                                          <SelectItem key={val} value={val}>{label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                             </div>
                           )}

                           <div className="space-y-2 px-1">
                               <Label htmlFor="reason" className="text-xs font-bold text-slate-600 text-[10px] uppercase">Motivo / Explicação</Label>
                               <Input 
                                 id="reason" 
                                 placeholder={isPenalty ? "Ex: Má conduta..." : "Ex: Bom trabalho..."} 
                                 value={description} 
                                 onChange={(e) => setDescription(e.target.value)} 
                                 className="h-9"
                               />
                           </div>

                           <div className="pt-2 border-t">
                               <Button 
                                 type="button"
                                 variant="outline"
                                 className="w-full flex items-center gap-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                                 onClick={() => handleResetPassword(member.id)}
                                 disabled={loading}
                               >
                                 <KeyRound className="w-4 h-4" /> Enviar Reset Password
                               </Button>
                               <p className="text-[10px] text-gray-500 text-center mt-1">
                                 Um email será enviado para o membro com instruções de recuperação.
                               </p>
                           </div>
                           
                           <div className="flex flex-col gap-3 pt-2">
                               <Button 
                                 type="submit" 
                                 className={`w-full h-11 text-base font-bold transition-all shadow-md ${isPenalty ? 'bg-red-600 hover:bg-red-700 hover:shadow-red-200' : 'bg-blue-800 hover:bg-blue-900 hover:shadow-blue-200'}`} 
                                 disabled={loading}
                               >
                                   {loading ? 'Processando...' : (isPenalty ? 'Aplicar Penalização' : 'Atribuir Prémio')}
                               </Button>
                               {isPenalty && (
                                 <div className="flex items-center justify-center gap-1.5 p-2 bg-red-50 rounded-lg border border-red-100">
                                   <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                   <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider">
                                     Valores serão subtraídos ao saldo do membro
                                   </p>
                                 </div>
                               )}
                           </div>
                       </form>
                   </DialogContent>
                </Dialog>
           </div>
        </div>
      ))}

      {members.length === 0 && (
          <div className="text-center py-10 text-gray-500">
              Nenhum membro encontrado.
          </div>
      )}
    </div>
  )
}
