'use client'

// Despesa, outra entrada ou contagem inicial (cofre_register), com comprovativo opcional.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Paperclip, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  RECEIPT_BUCKET, RECEIPT_MAX_BYTES, RECEIPT_TYPES, centsToParam, formatCents, parseEurInput,
  type PaymentMethod,
} from '@/lib/cofre'
import { CoordinatorSelect, MethodPicker, type Coordinator } from './fields'

export type ManualKind = 'despesa' | 'entrada_outra' | 'abertura'

const COPY: Record<ManualKind, { title: string; description: string; holder: string; method: string; placeholder: string; submit: string }> = {
  despesa: {
    title: 'Registar despesa',
    description: 'Material ou outra coisa paga com dinheiro do clube que um coordenador tinha. Junta a foto da fatura ou do talão.',
    holder: 'De quem saiu o dinheiro?',
    method: 'Saiu de onde?',
    placeholder: 'Ex.: Cordas para a especialidade de nós (Decathlon)',
    submit: 'Registar despesa',
  },
  entrada_outra: {
    title: 'Registar outra entrada',
    description: 'Dinheiro do clube que não vem da loja: quotas, donativos, rifas, inscrições…',
    holder: 'Quem recebeu?',
    method: 'Como entrou?',
    placeholder: 'Ex.: Inscrições do acampamento (4 × 15 €)',
    submit: 'Registar entrada',
  },
  abertura: {
    title: 'Contagem inicial',
    description: 'Conta o dinheiro do clube que tens contigo hoje (em numerário e na tua conta) e regista-o uma vez. Não contes as encomendas da loja que marcaste como "ainda está comigo": essas já entram sozinhas.',
    holder: 'De quem é a contagem?',
    method: 'Onde está?',
    placeholder: 'Ex.: Contagem inicial do Cofre',
    submit: 'Registar contagem',
  },
}

interface MovementDialogProps {
  kind: ManualKind | null
  onClose: () => void
  coordinators: Coordinator[]
  currentUserId: string
  today: string
}

export function MovementDialog({ kind, onClose, coordinators, currentUserId, today }: MovementDialogProps) {
  const supabase = createClient()
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('numerario')
  const [holder, setHolder] = useState(currentUserId)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState(kind === 'abertura' ? COPY.abertura.placeholder.replace('Ex.: ', '') : '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const copy = kind ? COPY[kind] : COPY.despesa
  const cents = parseEurInput(amount)

  const reset = () => {
    setAmount(''); setMethod('numerario'); setHolder(currentUserId); setDate(today)
    setDescription(''); setFile(null); setSaving(false)
  }

  const close = () => { reset(); onClose() }

  const pickFile = (f: File | null) => {
    if (!f) return setFile(null)
    if (!RECEIPT_TYPES[f.type]) return toast.error('O comprovativo tem de ser uma foto (JPG, PNG, WEBP, HEIC) ou um PDF.')
    if (f.size > RECEIPT_MAX_BYTES) return toast.error('O comprovativo é demasiado grande (máximo 5 MB).')
    setFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kind) return
    if (!cents) return toast.error('Escreve um valor válido (ex.: 12,50).')
    if (!description.trim()) return toast.error('Escreve uma descrição.')
    setSaving(true)
    try {
      let receiptPath: string | null = null
      if (file) {
        receiptPath = `${currentUserId}/${crypto.randomUUID()}.${RECEIPT_TYPES[file.type]}`
        const { error: upErr } = await supabase.storage.from(RECEIPT_BUCKET).upload(receiptPath, file, { contentType: file.type })
        if (upErr) throw new Error('Não foi possível enviar o comprovativo: ' + upErr.message)
      }
      const { error } = await supabase.rpc('cofre_register', {
        p_kind: kind,
        p_amount: centsToParam(cents),
        p_method: method,
        p_description: description.trim(),
        p_holder_id: holder,
        p_occurred_on: date,
        p_receipt_path: receiptPath,
      })
      if (error) throw error
      toast.success(kind === 'despesa' ? 'Despesa registada!' : kind === 'abertura' ? 'Contagem inicial registada!' : 'Entrada registada!')
      close()
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível registar.')
      setSaving(false)
    }
  }

  return (
    <Dialog open={kind !== null} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-h-[92vh] grid-cols-1 overflow-y-auto overflow-x-hidden sm:max-w-md">
        <form onSubmit={submit} className="min-w-0 space-y-4">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cofre-amount">Valor (€)</Label>
              <Input
                id="cofre-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="text-lg font-bold"
              />
              {amount && !cents && <p className="text-[11px] font-bold text-red-600">Valor inválido</p>}
              {cents && <p className="text-[11px] text-stone-500">{formatCents(cents)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cofre-date">Data</Label>
              <Input id="cofre-date" type="date" max={today} value={date} onChange={e => setDate(e.target.value || today)} />
            </div>
          </div>

          <CoordinatorSelect
            id="cofre-holder"
            label={copy.holder}
            value={holder}
            onChange={setHolder}
            coordinators={coordinators}
            currentUserId={currentUserId}
          />

          <MethodPicker
            label={copy.method}
            value={method}
            onChange={setMethod}
            hint={method === 'numerario' ? 'Em dinheiro vivo.' : 'Na conta pessoal do coordenador.'}
          />

          <div className="space-y-1.5">
            <Label htmlFor="cofre-desc">Descrição</Label>
            <Textarea
              id="cofre-desc"
              rows={2}
              maxLength={300}
              placeholder={copy.placeholder}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {kind !== 'abertura' && (
            <div className="space-y-1.5">
              <Label>Comprovativo {kind === 'despesa' ? '(fatura, talão)' : '(opcional)'}</Label>
              {file ? (
                <div className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm ring-1 ring-inset ring-stone-200">
                  <Paperclip className="h-4 w-4 shrink-0 text-stone-500" />
                  <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                  <button type="button" aria-label="Tirar comprovativo" onClick={() => setFile(null)} className="rounded-full p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 px-3 py-3 text-sm font-bold text-stone-500 hover:border-blue-300 hover:text-blue-700">
                  <Paperclip className="h-4 w-4" /> Tirar foto ou escolher ficheiro
                  <input
                    type="file"
                    accept={Object.keys(RECEIPT_TYPES).join(',')}
                    className="sr-only"
                    onChange={e => pickFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !cents} className="bg-blue-950 hover:bg-blue-900">
              {saving ? 'A registar...' : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
