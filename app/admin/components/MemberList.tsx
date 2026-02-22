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
import { Coins, Trophy, UserCheck, UserX } from 'lucide-react' // Correct icons
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface MemberListProps {
  members: any[]
  currentUserRole: string
}

export function MemberList({ members, currentUserRole }: MemberListProps) {
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [pointsOpen, setPointsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Form State
  const [amountXP, setAmountXP] = useState(0)
  const [amountGold, setAmountGold] = useState(0)
  const [description, setDescription] = useState('')


  const handleGivePoints = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error: logError } = await supabase
        .from('points_log')
        .insert({
          target_user_id: selectedMember.id,
          amount_xp: amountXP,
          amount_gold: amountGold,
          description: description,
        })
      
      if (logError) throw logError

      // Update Profile totals
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
            total_xp: (selectedMember.total_xp || 0) + amountXP,
            current_gold: (selectedMember.current_gold || 0) + amountGold
        })
        .eq('id', selectedMember.id)

      if (profileError) throw profileError

      toast.success(`Pontos atribuídos a ${selectedMember.full_name}!`)
      setPointsOpen(false)
      setAmountXP(0)
      setAmountGold(0)
      setDescription('')
      router.refresh()
    } catch (error) {
      console.error('Error giving points:', error)
      toast.error('Erro ao atribuir pontos.')
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
          console.error('Error updating status:', error)
          toast.error('Erro ao atualizar estado.')
      }
  }

  return (
    <div className="space-y-4">
      {members.map((member) => (
        <div key={member.id} className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
           <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10 border">
                    <AvatarImage src={member.avatar_url} />
                    <AvatarFallback>{member.full_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="font-medium text-gray-900">{member.full_name}</h3>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-indigo-600 font-medium">
                            <Trophy className="w-3 h-3" /> {member.total_xp} XP
                        </span>
                        <span className="flex items-center gap-1 text-yellow-600 font-medium">
                            <Coins className="w-3 h-3" /> {member.current_gold} Ouro
                        </span>
                    </div>
                </div>
           </div>

           <div className="flex items-center gap-4">
               <div className="flex flex-col items-end gap-1">
                   <Label htmlFor={`invested-${member.id}`} className="text-xs text-gray-500 cursor-pointer">Investido</Label>
                   <Switch 
                        id={`invested-${member.id}`}
                        checked={member.is_invested}
                        onCheckedChange={() => handleToggleInvested(member.id, member.is_invested)}
                   />
               </div>
               
               <Dialog open={pointsOpen && selectedMember?.id === member.id} onOpenChange={(open) => {
                   setPointsOpen(open)
                   if (open) setSelectedMember(member)
               }}>
                   <DialogTrigger asChild>
                       <Button size="sm" variant="outline" className="border-blue-600 text-blue-700 hover:bg-blue-50">
                           Dar Pontos
                       </Button>
                   </DialogTrigger>
                   <DialogContent className="sm:max-w-[425px]">
                       <DialogHeader>
                           <DialogTitle>Atribuir Pontos</DialogTitle>
                           <DialogDescription>
                               Dê XP e Gold para {member.full_name}.
                           </DialogDescription>
                       </DialogHeader>
                       <form onSubmit={handleGivePoints} className="grid gap-4 py-4">
                           <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                   <Label htmlFor="xp">XP (Experiência)</Label>
                                   <div className="relative">
                                       <Trophy className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                       <Input
                                          id="xp"
                                          type="number"
                                          className="pl-8"
                                          value={amountXP}
                                          onChange={(e) => setAmountXP(Number(e.target.value))}
                                       />
                                   </div>
                               </div>
                               <div className="space-y-2">
                                   <Label htmlFor="gold">Gold (Moedas)</Label>
                                   <div className="relative">
                                        <Coins className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="gold"
                                            type="number"
                                            className="pl-8"
                                            value={amountGold}
                                            onChange={(e) => setAmountGold(Number(e.target.value))}
                                        />
                                   </div>
                               </div>
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="reason">Motivo</Label>
                               <Input
                                   id="reason"
                                   placeholder="Ex: Bom comportamento, tarefa cumprida..."
                                   value={description}
                                   onChange={(e) => setDescription(e.target.value)}
                                   required
                               />
                           </div>
                           <DialogFooter>
                               <Button type="submit" className="bg-blue-800 hover:bg-blue-900" disabled={loading}>
                                   {loading ? 'Confirmando...' : 'Confirmar'}
                               </Button>
                           </DialogFooter>
                       </form>
                   </DialogContent>
               </Dialog>
           </div>
        </div>
      ))}

      {members.length === 0 && (
          <div className="text-center py-10 text-gray-500">
              Nenhum membro encontrado nesta secção.
          </div>
      )}
    </div>
  )
}
