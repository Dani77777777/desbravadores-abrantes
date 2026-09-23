'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, MailCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { deleteOwnAccount, requestAccountDeletionCode } from './actions'

const RESEND_COOLDOWN = 60

export function DeleteAccountCard({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'warning' | 'code'>('warning')
  const [understood, setUnderstood] = useState(false)
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const reset = () => {
    setStep('warning')
    setUnderstood(false)
    setCode('')
  }

  const sendCode = async () => {
    setSending(true)
    try {
      const result = await requestAccountDeletionCode()
      if (result.error) {
        toast.error(result.error)
        return
      }
      setStep('code')
      setCooldown(RESEND_COOLDOWN)
      toast.success('Código enviado para o teu email.')
    } catch {
      toast.error('Erro ao enviar código. Tenta novamente.')
    } finally {
      setSending(false)
    }
  }

  const confirmDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleting(true)
    try {
      const result = await deleteOwnAccount(code)
      if (result.error) {
        toast.error(result.error)
        return
      }
      await createClient().auth.signOut().catch(() => {})
      toast.success('A tua conta foi apagada. Até breve!')
      setOpen(false)
      router.replace('/login')
      router.refresh()
    } catch {
      toast.error('Erro ao apagar conta. Tenta novamente.')
    } finally {
      setDeleting(false)
    }
  }

  const codeValid = /^\d{6,8}$/.test(code)

  return (
    <Card className="gap-0 rounded-[1.75rem] border-none bg-white py-6 shadow-md shadow-blue-950/5 ring-1 ring-red-200 sm:py-7">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-xl font-extrabold text-red-700">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500 text-white shadow-md"><Trash2 className="w-5 h-5" /></span>
          Apagar Conta
        </CardTitle>
        <CardDescription>
          Remove permanentemente a tua conta e todos os teus dados do clube.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-6">
        <Button
          variant="outline"
          className="h-12 w-full rounded-2xl border-red-300 font-bold text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={() => { reset(); setOpen(true) }}
        >
          Apagar a minha conta
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!deleting && !sending) setOpen(o) }}>
        <DialogContent className="sm:max-w-[420px]">
          {step === 'warning' ? (
            <>
              <DialogHeader>
                <div className="mx-auto sm:mx-0 h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-1">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <DialogTitle>Apagar a tua conta?</DialogTitle>
                <DialogDescription>Esta ação é permanente e não pode ser desfeita.</DialogDescription>
              </DialogHeader>

              <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
                <li>Perdes todo o XP e ouro acumulados.</li>
                <li>O teu histórico de pontos e compras é apagado.</li>
                <li>Deixas de aparecer no ranking e na tua classe.</li>
              </ul>

              <label className="flex items-start gap-2 rounded-lg border bg-slate-50 p-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-red-600"
                />
                Compreendo que a minha conta e os meus dados serão apagados para sempre.
              </label>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancelar</Button>
                <Button onClick={sendCode} disabled={!understood || sending} className="bg-red-600 hover:bg-red-700 text-white">
                  {sending ? 'A enviar...' : 'Enviar código'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={confirmDelete} className="grid gap-4">
              <DialogHeader>
                <div className="mx-auto sm:mx-0 h-12 w-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mb-1">
                  <MailCheck className="w-6 h-6" />
                </div>
                <DialogTitle>Confirma com o código</DialogTitle>
                <DialogDescription>
                  Enviámos um código de verificação para <span className="font-semibold text-slate-900 break-all">{userEmail}</span>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="deletion-code">Código de verificação</Label>
                <Input
                  id="deletion-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  autoFocus
                  className="h-12 text-center text-2xl font-mono tracking-[0.4em] focus-visible:ring-red-500"
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Não recebeste? Verifica o spam.</span>
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={cooldown > 0 || sending}
                    className="font-semibold text-blue-700 disabled:text-slate-400 hover:underline disabled:no-underline"
                  >
                    {cooldown > 0 ? `Reenviar em ${cooldown}s` : sending ? 'A enviar...' : 'Reenviar código'}
                  </button>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>Cancelar</Button>
                <Button type="submit" disabled={!codeValid || deleting} className="bg-red-600 hover:bg-red-700 text-white">
                  {deleting ? 'A apagar...' : 'Apagar definitivamente'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
