'use client'

// Dinheiro das encomendas da Loja, ligado ao Cofre:
//   pay      → "Pago" / "Pago + Entregue": como foi pago e quem recebeu (mark_purchase_paid)
//   register → encomenda paga antes do Cofre: quem recebeu e se ainda o tem (set_purchase_receiver)
//   correct  → engano em quem recebeu / como foi pago (correct_purchase_payment)
//   refund   → reembolso de uma compra paga: sai do "em mão" de quem devolve (refund_purchase)

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatCents, toCents, type PaymentMethod } from '@/lib/cofre'
import { CoordinatorSelect, MethodPicker, type Coordinator } from './fields'

export type MoneyAction =
  | { mode: 'pay'; order: any; deliver: boolean }
  | { mode: 'register'; order: any }
  | { mode: 'correct'; order: any }
  | { mode: 'refund'; order: any }

interface Props {
  action: MoneyAction
  onClose: () => void
  coordinators: Coordinator[]
  currentUserId: string
}

const TITLES = {
  pay: 'Confirmar pagamento',
  register: 'Quem recebeu o dinheiro?',
  correct: 'Corrigir pagamento',
  refund: 'Reembolsar compra',
}

export function PurchaseMoneyDialog({ action, onClose, coordinators, currentUserId }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { mode, order } = action
  const [method, setMethod] = useState<PaymentMethod>(mode === 'correct' && order.payment_method ? order.payment_method : 'numerario')
  const [receiver, setReceiver] = useState<string>(
    mode === 'correct' && order.received_by ? order.received_by : currentUserId,
  )
  const [stillHeld, setStillHeld] = useState<boolean | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const cents = toCents(order.amount_due_eur)
  const product = `${order.store_products?.name || 'Artigo'}${(order.quantity || 1) > 1 ? ` × ${order.quantity}` : ''}`
  const buyer = order.profiles?.full_name || order.buyer_name || 'Comprador'
  const receiverIsMe = receiver === currentUserId

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'register' && stillHeld === null) return toast.error('Diz se o dinheiro ainda está com essa pessoa.')
    if (mode === 'correct' && !reason.trim()) return toast.error('Diz porque estás a corrigir.')
    setSaving(true)
    const call =
      mode === 'pay'
        ? supabase.rpc('mark_purchase_paid', { p_purchase_id: order.id, p_deliver: action.deliver, p_method: method, p_received_by: receiver })
        : mode === 'register'
          ? supabase.rpc('set_purchase_receiver', { p_purchase_id: order.id, p_received_by: receiver, p_method: method, p_still_held: stillHeld })
          : mode === 'correct'
            ? supabase.rpc('correct_purchase_payment', { p_purchase_id: order.id, p_received_by: receiver, p_method: method, p_reason: reason.trim() })
            : supabase.rpc('refund_purchase', { p_purchase_id: order.id, p_method: method })
    const { error } = await call
    if (error) {
      toast.error(error.message || 'Não foi possível guardar.')
      setSaving(false)
      return
    }
    toast.success(
      mode === 'pay' ? (action.deliver ? 'Pagamento e entrega confirmados!' : 'Pagamento confirmado!')
        : mode === 'register' ? 'Registado quem recebeu.'
          : mode === 'correct' ? 'Pagamento corrigido.'
            : 'Compra reembolsada!',
    )
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{TITLES[mode]}</DialogTitle>
            <DialogDescription>
              {mode === 'register'
                ? 'Esta encomenda foi paga antes de haver Cofre. Diz quem recebeu o dinheiro.'
                : mode === 'correct'
                  ? 'A venda errada fica estornada no Cofre e é registada a certa.'
                  : mode === 'refund'
                    ? 'O Gold do desconto volta ao membro e as unidades voltam ao stock. O dinheiro devolvido sai do teu "em mão" no Cofre.'
                    : 'O dinheiro fica no "em mão" de quem o recebeu, no Cofre.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200">
            <div className="min-w-0">
              <p className="truncate font-bold text-blue-950">{product}</p>
              <p className="truncate text-xs text-stone-500">{order.payment_ref && <span className="font-mono font-bold">{order.payment_ref} · </span>}{buyer}</p>
            </div>
            <p className="shrink-0 text-lg font-black text-green-800">{formatCents(cents)}</p>
          </div>

          {mode !== 'refund' && (
            <CoordinatorSelect
              id="money-receiver"
              label="Quem recebeu?"
              value={receiver}
              onChange={setReceiver}
              coordinators={coordinators}
              currentUserId={currentUserId}
            />
          )}

          <MethodPicker
            label={mode === 'refund' ? 'Como devolveste?' : 'Como foi pago?'}
            value={method}
            onChange={setMethod}
            hint={mode === 'refund'
              ? (method === 'numerario' ? 'Em dinheiro vivo.' : 'Da tua conta pessoal.')
              : method === 'numerario'
                ? 'Em dinheiro vivo.'
                : `Para a conta pessoal de ${receiverIsMe ? 'quem recebeu (tu)' : 'quem recebeu'}, com a referência ${order.payment_ref || ''} na descrição.`}
          />

          {mode === 'register' && (
            <div className="space-y-1.5">
              <Label>{receiverIsMe ? 'Esse dinheiro ainda está contigo?' : 'Esse dinheiro ainda está com essa pessoa?'}</Label>
              <div className="grid grid-cols-2 gap-2">
                {([[true, 'Sim, ainda está', 'Entra no "em mão" no Cofre.'], [false, 'Não, já saiu', 'Já foi entregue ou gasto. Fica só o registo.']] as [boolean, string, string][]).map(([v, label, sub]) => (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={stillHeld === v}
                    onClick={() => setStillHeld(v)}
                    className={`rounded-xl p-2.5 text-left ring-1 ring-inset transition-colors ${stillHeld === v ? 'bg-blue-950 text-white ring-blue-950' : 'bg-white text-stone-700 ring-stone-200 hover:bg-stone-50'}`}
                  >
                    <span className="block text-sm font-bold">{label}</span>
                    <span className={`block text-[11px] ${stillHeld === v ? 'text-blue-100/80' : 'text-stone-500'}`}>{sub}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-500">Se essa pessoa já contou este dinheiro na contagem inicial do Cofre, escolhe «Não, já saiu» para não contar duas vezes.</p>
            </div>
          )}

          {mode === 'correct' && (
            <div className="space-y-1.5">
              <Label htmlFor="money-reason">Motivo</Label>
              <Textarea id="money-reason" rows={2} maxLength={200} placeholder="Ex.: foi o Bruno que recebeu, não eu" value={reason} onChange={e => setReason(e.target.value)} />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button
              type="submit"
              disabled={saving || (mode === 'register' && stillHeld === null) || (mode === 'correct' && !reason.trim())}
              variant={mode === 'refund' ? 'destructive' : 'default'}
              className={mode === 'refund' ? '' : 'bg-green-600 hover:bg-green-700'}
            >
              {saving ? 'A guardar...'
                : mode === 'pay' ? (action.deliver ? 'Pago + Entregue' : 'Confirmar pagamento')
                  : mode === 'register' ? 'Guardar'
                    : mode === 'correct' ? 'Corrigir'
                      : `Reembolsar ${formatCents(cents)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
