'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { deleteMemberAccount } from '../actions'

const CONFIRM_WORD = 'APAGAR'

interface DeleteMemberDialogProps {
  member: any | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteMemberDialog({ member, open, onOpenChange }: DeleteMemberDialogProps) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open) setConfirmText('')
  }, [open])

  if (!member) return null

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const result = await deleteMemberAccount(member.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Conta de ${member.full_name} apagada.`)
      onOpenChange(false)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao apagar conta.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="mx-auto sm:mx-0 h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-1">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <DialogTitle>Apagar conta?</DialogTitle>
          <DialogDescription>Esta ação é permanente e não pode ser desfeita.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-xl border bg-slate-50 p-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={member.avatar_url} className="object-cover" />
            <AvatarFallback className="bg-slate-200 font-bold text-slate-600">{member.full_name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{member.full_name}</p>
            <p className="text-xs text-slate-500">{member.total_xp ?? 0} XP · {member.current_gold ?? 0} Ouro</p>
          </div>
        </div>

        <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
          <li>O membro deixa de conseguir entrar no site.</li>
          <li>Perde XP, ouro, histórico de pontos e compras.</li>
          <li>Desaparece do ranking e das classes.</li>
        </ul>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete" className="text-xs text-slate-600">
            Escreve <span className="font-mono font-bold text-red-600">{CONFIRM_WORD}</span> para confirmar
          </Label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            className="font-mono uppercase focus-visible:ring-red-500"
            placeholder={CONFIRM_WORD}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>Cancelar</Button>
          <Button
            onClick={handleDelete}
            disabled={confirmText.trim().toUpperCase() !== CONFIRM_WORD || deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? 'A apagar...' : 'Apagar definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
