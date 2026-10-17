'use client'

import { useState } from 'react'
import { Baby, CheckCircle2, Copy, Loader2, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import type { FamilyAccountSummary } from '@/lib/family-accounts'
import {
  acceptFamilyAssociationCode,
  createFamilyAccount,
  createFamilyAssociationRequest,
  inspectFamilyAssociationCode,
  revokeFamilyAssociationRequest,
} from '@/app/profile/family-actions'

type Props = { summary: FamilyAccountSummary }

const fieldClass = 'h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm text-blue-950 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30'

export function FamilyAccountsPanel({ summary }: Props) {
  const [creating, setCreating] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [code, setCode] = useState(summary.pendingRequest?.code || '')
  const [approvalCode, setApprovalCode] = useState('')
  const [parentName, setParentName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canManageAccounts = summary.linkedAccounts.every((account) => account.relation === 'owner')

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Código copiado.')
    } catch {
      toast.error('Não foi possível copiar. Podes selecionar o código manualmente.')
    }
  }

  const createAccount = async (form: FormData) => {
    setBusy(true)
    const result = await createFamilyAccount({
      fullName: String(form.get('fullName') || ''),
      birthDate: String(form.get('birthDate') || ''),
      gender: String(form.get('gender') || '') as 'm' | 'f',
    })
    setBusy(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Conta familiar criada e associada.')
    window.location.reload()
  }

  const generateRequest = async () => {
    setRequesting(true)
    const result = await createFamilyAssociationRequest()
    setRequesting(false)
    if (result.error) return toast.error(result.error)
    setCode(result.code || '')
    toast.success('Pedido criado. Partilha o código com a outra pessoa.')
  }

  const inspectCode = async () => {
    const result = await inspectFamilyAssociationCode(approvalCode)
    if (result.error) {
      setParentName(null)
      return toast.error(result.error)
    }
    setApprovalCode(result.code || approvalCode.trim().toUpperCase())
    setParentName(result.parentName || 'esta conta')
  }

  const acceptCode = async () => {
    setBusy(true)
    const result = await acceptFamilyAssociationCode(approvalCode)
    setBusy(false)
    if (result.error) return toast.error(result.error)
    toast.success('Contas associadas com sucesso.')
    window.location.reload()
  }

  const revokeRequest = async () => {
    setBusy(true)
    const result = await revokeFamilyAssociationRequest()
    setBusy(false)
    if (result.error) return toast.error(result.error)
    setCode('')
    toast.success('Pedido cancelado.')
  }

  if (!canManageAccounts) {
    return (
      <section className="rounded-[1.75rem] bg-white p-6 shadow-md shadow-blue-950/5 ring-1 ring-stone-200 sm:p-7">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500 text-white shadow-md"><UsersRound className="h-5 w-5" /></span>
          <div>
            <h2 className="text-xl font-extrabold text-blue-950">Conta familiar</h2>
            <p className="mt-0.5 text-sm text-stone-500">As duas contas continuam independentes, mas podes alternar entre elas.</p>
          </div>
        </div>
        {summary.linkedAccounts.map((account) => (
          <div key={account.id} className="mt-6 flex items-center gap-3 rounded-2xl bg-fuchsia-50 p-4 ring-1 ring-inset ring-fuchsia-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-600 font-extrabold text-white">
              {account.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-blue-950">{account.fullName}</p>
              <p className="text-sm text-fuchsia-700">Conta principal associada à tua</p>
            </div>
          </div>
        ))}
        <p className="mt-4 text-sm text-stone-500">Usa o menu do teu avatar, no topo da página, para mudar de conta.</p>
      </section>
    )
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-6 shadow-md shadow-blue-950/5 ring-1 ring-stone-200 sm:p-7">
      <div className="flex gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500 text-white shadow-md"><UsersRound className="h-5 w-5" /></span>
        <div>
          <h2 className="text-xl font-extrabold text-blue-950">Contas familiares</h2>
          <p className="mt-0.5 text-sm text-stone-500">Cria e gere os perfis da tua família a partir desta conta.</p>
        </div>
      </div>

      {summary.linkedAccounts.length > 0 && (
        <div className="mt-6 space-y-3">
          {summary.linkedAccounts.map((account) => (
            <div key={account.id} className="flex items-center gap-3 rounded-2xl bg-fuchsia-50 p-4 ring-1 ring-inset ring-fuchsia-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-600 font-extrabold text-white">{account.fullName.charAt(0).toUpperCase()}</div>
              <div><p className="font-bold text-blue-950">{account.fullName}</p><p className="text-sm text-fuchsia-700">Conta associada à tua conta</p></div>
            </div>
          ))}
        </div>
      )}

      {!creating && !code && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setCreating(true)} className="rounded-2xl bg-blue-950 p-4 text-left text-white transition hover:bg-blue-900">
            <Baby className="h-5 w-5 text-yellow-300" />
            <p className="mt-3 font-extrabold">{summary.linkedAccounts.length ? 'Adicionar conta de familiar' : 'Criar conta de familiar'}</p>
            <p className="mt-1 text-sm text-blue-200">Sem e-mail nem palavra-passe próprios.</p>
          </button>
          <button type="button" onClick={generateRequest} disabled={requesting} className="rounded-2xl bg-fuchsia-50 p-4 text-left text-blue-950 ring-1 ring-inset ring-fuchsia-200 transition hover:bg-fuchsia-100 disabled:opacity-60">
            {requesting ? <Loader2 className="h-5 w-5 animate-spin text-fuchsia-600" /> : <UsersRound className="h-5 w-5 text-fuchsia-600" />}
            <p className="mt-3 font-extrabold">Associar conta existente</p>
            <p className="mt-1 text-sm text-stone-500">A outra pessoa confirma com um código.</p>
          </button>
        </div>
      )}

      {creating && (
        <form action={createAccount} className="mt-6 space-y-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-950"><Baby className="h-4 w-4 text-fuchsia-600" /> Nova conta de familiar</div>
          <input name="fullName" required placeholder="Nome completo" className={fieldClass} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-blue-950">Data de nascimento<input name="birthDate" type="date" required className={`${fieldClass} mt-1.5`} /></label>
            <label className="text-sm font-semibold text-blue-950">Sexo<select name="gender" required defaultValue="" className={`${fieldClass} mt-1.5`}><option value="" disabled>Selecionar</option><option value="m">Masculino</option><option value="f">Feminino</option></select></label>
          </div>
          <p className="text-xs text-stone-500">O familiar poderá adicionar um e-mail próprio mais tarde, se quiser entrar diretamente.</p>
          <div className="flex gap-3"><button disabled={busy} className="rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">{busy ? 'A criar...' : 'Criar e associar'}</button><button type="button" onClick={() => setCreating(false)} className="px-3 text-sm font-bold text-stone-500">Cancelar</button></div>
        </form>
      )}

      {code && (
        <div className="mt-6 rounded-2xl bg-fuchsia-50 p-5 ring-1 ring-inset ring-fuchsia-200">
          <p className="font-bold text-blue-950">Partilha este código com a conta que queres associar</p>
          <p className="mt-1 text-sm text-stone-600">A pessoa introduz o código nesta mesma área do perfil e confirma a associação.</p>
          <div className="mt-4 flex items-center gap-2"><code className="rounded-xl bg-white px-4 py-3 font-mono text-xl font-extrabold tracking-[0.2em] text-fuchsia-700 ring-1 ring-fuchsia-200">{code}</code><button type="button" onClick={copyCode} className="rounded-xl bg-white p-3 text-fuchsia-700 ring-1 ring-fuchsia-200"><Copy className="h-5 w-5" /><span className="sr-only">Copiar código</span></button></div>
          <button type="button" disabled={busy} onClick={revokeRequest} className="mt-4 text-sm font-bold text-fuchsia-700 hover:underline">Cancelar pedido</button>
        </div>
      )}

      {!creating && !code && (
        <div className="mt-6 border-t border-stone-100 pt-6">
          <p className="text-sm font-bold text-blue-950">Recebeste um código de associação?</p>
          <div className="mt-2 flex gap-2"><input value={approvalCode} onChange={(event) => { setApprovalCode(event.target.value.toUpperCase()); setParentName(null) }} placeholder="Código de 8 caracteres" maxLength={8} className={`${fieldClass} font-mono uppercase tracking-widest`} /><button type="button" onClick={inspectCode} disabled={approvalCode.length < 8} className="rounded-xl bg-stone-100 px-4 text-sm font-extrabold text-blue-950 disabled:opacity-50">Verificar</button></div>
          {parentName && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><span>Vais associar a tua conta a <strong>{parentName}</strong>.</span><button type="button" disabled={busy} onClick={acceptCode} className="rounded-lg bg-emerald-600 px-3 py-2 font-extrabold text-white disabled:opacity-60">{busy ? 'A associar...' : 'Aprovar'}</button></div>}
        </div>
      )}
    </section>
  )
}
