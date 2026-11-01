'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Copy, Heart, Link2, Loader2, LogOut, Pencil, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  acceptClubFamilyInvite, createClubFamilyInvite, createMyClubFamily, inspectClubFamilyInvite, leaveMyClubFamily,
  renameClubFamily, revokeClubFamilyInvite, setClubFamilyKind, type MyClubFamily,
} from '@/lib/actions/club-families'
import {
  FAMILY_CODE_LENGTH, FAMILY_JOIN_PATH, familyKindLabel, normalizeFamilyCode, suggestedFamilyName, type FamilyKind,
} from '@/utils/club-families'

type Props = {
  data: MyClubFamily
  userId: string
  fullName: string
  /** Código vindo do link de convite (/familia/CODIGO). */
  initialCode?: string
}

const fieldClass = 'h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm text-blue-950 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30'

/**
 * A família da pessoa no clube (pais, irmãos…), à parte das contas familiares: cria-se aqui,
 * convida-se por código e serve para os jogos de famílias. Não dá acesso a outras contas.
 */
export function ClubFamilyPanel({ data, userId, fullName, initialCode = '' }: Props) {
  const router = useRouter()
  const { family, managedBy } = data
  const canEdit = !managedBy
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState(() => suggestedFamilyName(fullName))
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(family?.name ?? '')
  const [code, setCode] = useState(normalizeFamilyCode(initialCode))
  const [preview, setPreview] = useState<{ familyName: string; members: string[] } | null>(null)
  const run = async (key: string, fn: () => Promise<{ error?: string }>, ok?: string) => {
    setBusy(key)
    const r = await fn()
    setBusy(null)
    if (r.error) {
      toast.error(r.error)
      return false
    }
    if (ok) toast.success(ok)
    router.refresh()
    return true
  }

  const inspect = async () => {
    setBusy('inspect')
    const r = await inspectClubFamilyInvite(code)
    setBusy(null)
    if (r.error) {
      setPreview(null)
      toast.error(r.error)
      return
    }
    setPreview({ familyName: r.familyName!, members: r.members ?? [] })
  }

  // Veio pelo link do convite: mostra logo de que família é.
  useEffect(() => {
    if (family || !canEdit || normalizeFamilyCode(initialCode).length !== FAMILY_CODE_LENGTH) return
    let cancelled = false
    inspectClubFamilyInvite(initialCode).then((r) => {
      if (cancelled) return
      if (r.error) toast.error(r.error)
      else setPreview({ familyName: r.familyName!, members: r.members ?? [] })
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copiado.`)
    } catch {
      toast.error('Não foi possível copiar. Seleciona-o à mão.')
    }
  }

  const toggleKind = (memberId: string, kind: FamilyKind) =>
    run(`kind:${memberId}`, () => setClubFamilyKind(memberId, kind === 'adult' ? 'child' : 'adult'))

  const leave = () => {
    const ownsProfiles = family?.members.some((m) => m.id === userId && m.accountOwner)
    const msg = ownsProfiles
      ? 'Sair da família? Os perfis associados à tua conta também saem.'
      : 'Sair da família?'
    if (!window.confirm(msg)) return
    void run('leave', leaveMyClubFamily, 'Saíste da família.')
  }

  return (
    <section id="familia" className="scroll-mt-24 rounded-[1.75rem] bg-white p-6 shadow-md shadow-blue-950/5 ring-1 ring-stone-200 sm:p-7">
      <div className="flex gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-md"><Heart className="h-5 w-5" /></span>
        <div>
          <h2 className="text-xl font-extrabold text-blue-950">A minha família</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Pais, mães, irmãos… cada um com a sua conta. Nos jogos de famílias ficam juntos. Não dá acesso às contas uns dos outros.
          </p>
        </div>
      </div>

      {family ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {renaming ? (
              <>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} className={`${fieldClass} max-w-xs`} />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => { if (await run('rename', () => renameClubFamily(family.id, newName), 'Nome guardado.')) setRenaming(false) }}
                  className="rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
                >
                  Guardar
                </button>
                <button type="button" onClick={() => setRenaming(false)} className="px-2 text-sm font-bold text-stone-500">Cancelar</button>
              </>
            ) : (
              <>
                <p className="text-lg font-extrabold text-blue-950">{family.name}</p>
                {canEdit && (
                  <button type="button" onClick={() => { setNewName(family.name); setRenaming(true) }} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-blue-950" title="Mudar o nome">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>

          <ul className="space-y-2">
            {family.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-rose-50/60 p-3 ring-1 ring-inset ring-rose-100">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-extrabold text-white">{m.name.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-blue-950">{m.name}{m.id === userId && <span className="font-semibold text-stone-400"> (tu)</span>}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
                    {m.accountOwner && <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-fuchsia-800">Responsável da conta</span>}
                    {m.managedBy && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">Perfil de {m.managedBy}</span>}
                  </div>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => toggleKind(m.id, m.kind)}
                    title="Carrega para trocar entre adulto e criança"
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ring-1 ring-inset disabled:opacity-50 ${m.kind === 'adult' ? 'bg-blue-50 text-blue-800 ring-blue-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}
                  >
                    {busy === `kind:${m.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : familyKindLabel(m.kind, m.gender)}
                  </button>
                ) : (
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${m.kind === 'adult' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>
                    {familyKindLabel(m.kind, m.gender)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {canEdit ? (
            <>
              {family.invite ? (
                <div className="rounded-2xl bg-rose-50 p-5 ring-1 ring-inset ring-rose-200">
                  <p className="font-bold text-blue-950">Envia o link ou o código a quem é da família</p>
                  <p className="mt-1 text-sm text-stone-600">
                    Quem tem conta própria, adulto ou criança, aceita no perfil. Os perfis associados à conta dessa pessoa entram com ela.
                    Vale 7 dias.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <code className="rounded-xl bg-white px-4 py-3 font-mono text-xl font-extrabold tracking-[0.2em] text-rose-700 ring-1 ring-rose-200">{family.invite.code}</code>
                    <button type="button" onClick={() => copy(family.invite!.code, 'Código')} className="rounded-xl bg-white p-3 text-rose-700 ring-1 ring-rose-200" title="Copiar código">
                      <Copy className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(`${window.location.origin}${FAMILY_JOIN_PATH}/${family.invite!.code}`, 'Link')}
                      className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200"
                    >
                      <Link2 className="h-4 w-4" /> Copiar link
                    </button>
                  </div>
                  <button type="button" disabled={busy !== null} onClick={() => run('revoke', revokeClubFamilyInvite, 'Convite cancelado.')} className="mt-4 text-sm font-bold text-rose-700 hover:underline">
                    Cancelar convite
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run('invite', createClubFamilyInvite)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-rose-50 p-4 text-left text-blue-950 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100 disabled:opacity-60"
                >
                  {busy === 'invite' ? <Loader2 className="h-5 w-5 animate-spin text-rose-600" /> : <UserPlus className="h-5 w-5 text-rose-600" />}
                  <span>
                    <span className="block font-extrabold">Convidar alguém da família</span>
                    <span className="block text-sm text-stone-500">A pessoa aceita com um código ou um link.</span>
                  </span>
                </button>
              )}
              <button type="button" disabled={busy !== null} onClick={leave} className="flex items-center gap-1.5 text-sm font-bold text-stone-500 hover:text-red-600">
                <LogOut className="h-4 w-4" /> Sair da família
              </button>
            </>
          ) : (
            <p className="text-sm text-stone-500">Esta família é gerida pela conta de <b>{managedBy}</b>.</p>
          )}
        </div>
      ) : managedBy ? (
        <p className="mt-6 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600 ring-1 ring-inset ring-stone-200">
          Este perfil está associado à conta de <b>{managedBy}</b>. Quando essa conta criar uma família ou entrar numa, este perfil entra também.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-bold text-blue-950">Criar a minha família</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nome da família" className={fieldClass} />
              <button
                type="button"
                disabled={busy !== null || name.trim().length < 2}
                onClick={() => run('create', () => createMyClubFamily(name), 'Família criada. Agora convida os outros.')}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {busy === 'create' && <Loader2 className="h-4 w-4 animate-spin" />} Criar
              </button>
            </div>
            <p className="text-xs text-stone-500">Os perfis associados à tua conta entram contigo.</p>
          </div>

          <div className="border-t border-stone-100 pt-6">
            <p className="text-sm font-bold text-blue-950">Recebeste um convite para uma família?</p>
            <div className="mt-2 flex gap-2">
              <input
                value={code}
                onChange={(e) => { setCode(normalizeFamilyCode(e.target.value)); setPreview(null) }}
                placeholder="Código de 8 caracteres"
                maxLength={FAMILY_CODE_LENGTH}
                className={`${fieldClass} font-mono uppercase tracking-widest`}
              />
              <button
                type="button"
                onClick={() => inspect()}
                disabled={code.length < FAMILY_CODE_LENGTH || busy !== null}
                className="rounded-xl bg-stone-100 px-4 text-sm font-extrabold text-blue-950 disabled:opacity-50"
              >
                {busy === 'inspect' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}
              </button>
            </div>
            {preview && (
              <div className="mt-3 space-y-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>
                    Vais entrar na <b>{preview.familyName}</b>
                    {preview.members.length > 0 && <> com {preview.members.join(', ')}</>}.
                  </span>
                </p>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run('accept', () => acceptClubFamilyInvite(code), 'Entraste na família.')}
                  className="rounded-lg bg-emerald-600 px-3 py-2 font-extrabold text-white disabled:opacity-60"
                >
                  {busy === 'accept' ? 'A entrar…' : 'Entrar na família'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
