'use client'

// Estorno de um movimento manual (cofre_reverse): nada se apaga, cria-se o contrário.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { KIND_LABELS, formatCents, toCents, type CashMovement } from '@/lib/cofre'

export function ReverseDialog({ movement, onClose }: { movement: CashMovement | null; onClose: () => void }) {
  const supabase = createClient()
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const close = () => { setReason(''); setSaving(false); onClose() }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!movement) return
    if (!reason.trim()) return toast.error('Diz porque estás a estornar.')
    setSaving(true)
    const { error } = await supabase.rpc('cofre_reverse', { p_movement_id: movement.id, p_reason: reason.trim() })
    if (error) {
      toast.error(error.message || 'Não foi possível estornar.')
      setSaving(false)
      return
    }
    toast.success('Movimento estornado.')
    close()
    router.refresh()
  }

  return (
    <Dialog open={movement !== null} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Estornar movimento</DialogTitle>
            <DialogDescription>
              Os movimentos do Cofre não se apagam nem se editam. O estorno cria um movimento com o valor contrário, e
              os dois ficam no histórico.
            </DialogDescription>
          </DialogHeader>
          {movement && (
            <div className="rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-inset ring-stone-200">
              <p className="font-bold text-blue-950">{KIND_LABELS[movement.kind]} · {formatCents(toCents(movement.amount_eur))}</p>
              <p className="text-stone-600">{movement.description}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cofre-reason">Motivo</Label>
            <Textarea
              id="cofre-reason"
              rows={2}
              maxLength={300}
              placeholder="Ex.: enganei-me no valor, eram 12,50 €"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={saving || !reason.trim()}>
              {saving ? 'A estornar...' : 'Estornar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
