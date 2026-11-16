'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Coins, Trophy } from 'lucide-react'
import { toast } from 'sonner'

/** Origens ligadas a outros registos (encomendas, o outro lado da transferência, arquivo da época). */
export const LOCKED_CATEGORIES = ['loja', 'transferencia', 'reset']

export type MovementCorrection = { mode: 'edit' | 'delete'; row: any }

const nf = new Intl.NumberFormat('pt-PT')
const signed = (n: number) => (n > 0 ? `+${nf.format(n)}` : n < 0 ? `−${nf.format(Math.abs(n))}` : '0')
const isInt = (v: string) => /^-?\d+$/.test(v.trim())

export function MovementCorrectionDialog({ target, onClose, onDone }: {
  target: MovementCorrection | null
  onClose: () => void
  onDone: () => void
}) {
  const supabase = createClient()
  const [xp, setXp] = useState('0')
  const [gold, setGold] = useState('0')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const row = target?.row
  const isDelete = target?.mode === 'delete'

  useEffect(() => {
    if (!row) return
    setXp(String(row.amount_xp ?? 0))
    setGold(String(row.amount_gold ?? 0))
    setReason('')
  }, [row])

  const valid = isInt(xp) && isInt(gold)
  const newXp = valid ? parseInt(xp, 10) : 0
  const newGold = valid ? parseInt(gold, 10) : 0
  const oldXp = row?.amount_xp ?? 0
  const oldGold = row?.amount_gold ?? 0
  const unchanged = newXp === oldXp && newGold === oldGold
  // Efeito no saldo do membro
  const diffXp = isDelete ? -oldXp : newXp - oldXp
  const diffGold = isDelete ? -oldGold : newGold - oldGold

  const submit = async () => {
    if (!row) return
    setSaving(true)
    const { error } = isDelete
      ? await supabase.rpc('audit_delete_movement', { p_log_id: row.id, p_reason: reason })
      : await supabase.rpc('audit_edit_movement', { p_log_id: row.id, p_xp: newXp, p_gold: newGold, p_reason: reason })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(isDelete ? 'Movimento apagado. Ficou registado nas alterações.' : 'Movimento corrigido. Ficou registado nas alterações.')
    onDone()
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isDelete ? 'Apagar movimento' : 'Corrigir movimento'}</DialogTitle>
          <DialogDescription>
            {row?.target_name || 'Conta apagada'} · {row?.description}
          </DialogDescription>
        </DialogHeader>

        {isDelete ? (
          <p className="text-sm text-slate-700">
            O movimento de <strong>{signed(oldXp)} XP</strong> e <strong>{signed(oldGold)} Ouro</strong> sai do histórico do membro.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-xp" className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-indigo-600" /> XP</Label>
              <Input id="mov-xp" inputMode="numeric" value={xp} onChange={(e) => setXp(e.target.value)} className="tabular-nums" />
              <p className="text-xs text-slate-500">Antes: {signed(oldXp)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-gold" className="flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-yellow-600" /> Ouro</Label>
              <Input id="mov-gold" inputMode="numeric" value={gold} onChange={(e) => setGold(e.target.value)} className="tabular-nums" />
              <p className="text-xs text-slate-500">Antes: {signed(oldGold)}</p>
            </div>
          </div>
        )}

        {!valid && !isDelete ? (
          <p className="text-xs text-red-600">Escreve números inteiros (com - à frente para retirar pontos).</p>
        ) : (isDelete || !unchanged) && (
          <p className="rounded-lg bg-slate-50 border px-3 py-2 text-xs text-slate-600">
            Saldo de {row?.target_name || 'membro'}: <strong>{signed(diffXp)} XP</strong> · <strong>{signed(diffGold)} Ouro</strong>
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="mov-reason">Motivo <span className="font-normal text-slate-400">(opcional)</span></Label>
          <Input
            id="mov-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Ex.: enganei-me no valor do prémio"
          />
          <p className="text-xs text-slate-500">Fica em &ldquo;Alterações e correções&rdquo;, com o teu nome e os valores de antes e depois.</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {isDelete ? (
            <Button onClick={submit} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'A apagar…' : 'Apagar movimento'}
            </Button>
          ) : (
            <Button onClick={submit} disabled={saving || !valid || unchanged}>
              {saving ? 'A guardar…' : 'Guardar correção'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
