'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Baby, CalendarDays, CheckCircle2, Copy, Heart, Link2, Loader2, LogOut, Mail, Pencil, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  acceptClubFamilyInvite, createClubFamilyInvite, createMyClubFamily, giveOwnEmail, inspectClubFamilyInvite, leaveMyClubFamily,
  renameClubFamily, revokeClubFamilyInvite, type MyClubFamily,
} from '@/lib/actions/club-families'
import { createFamilyAccount, deleteFamilyAccount, updateFamilyAccountBirthDate } from '@/app/profile/family-actions'
import { hasImplausibleBirthDate } from '@/utils/birth-date'
import {
  FAMILY_CODE_LENGTH, FAMILY_INVITE_HOURS, FAMILY_JOIN_PATH, familyKindLabel, normalizeFamilyCode, suggestedFamilyName, type FamilyKind,
} from '@/utils/club-families'

type Props = {
  data: MyClubFamily
  userId: string
  fullName: string
  /** Código vindo do link de convite (/familia/CODIGO). */
  initialCode?: string
}

const fieldClass = 'h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm text-blue-950 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30'

type Preview = { familyName: string; members: string[]; kind: FamilyKind }

/**
 * A família da pessoa no clube: adultos e crianças, cada um com a sua conta. Os adultos
 * entram nas contas das crianças da família (menu do avatar); as crianças não entram em
 * nenhuma. Os adultos criam perfis de criança e convidam os outros por código ou link.
 */
export function ClubFamilyPanel({ data, userId, fullName, initialCode = '' }: Props) {
  const router = useRouter()
  const { family, myKind, joinKind } = data
  const isAdult = myKind === 'adult'
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState(() => suggestedFamilyName(fullName))
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(family?.name ?? '')
  const [code, setCode] = useState(normalizeFamilyCode(initialCode))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [creatingChild, setCreatingChild] = useState(false)
  const [editingBirth, setEditingBirth] = useState<{ id: string; value: string } | null>(null)
  const [givingEmail, setGivingEmail] = useState<{ id: string; value: string } | null>(null)

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
    setPreview({ familyName: r.familyName!, members: r.members ?? [], kind: r.kind ?? 'adult' })
  }

  // Veio pelo link do convite: mostra logo de que família é.
  useEffect(() => {
    if (family || normalizeFamilyCode(initialCode).length !== FAMILY_CODE_LENGTH) return
    let cancelled = false
    inspectClubFamilyInvite(initialCode).then((r) => {
      if (cancelled) return
      if (r.error) toast.error(r.error)
      else setPreview({ familyName: r.familyName!, members: r.members ?? [], kind: r.kind ?? 'adult' })
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

  // Trava contra cliques repetidos: o estado só chega ao botão no render seguinte, e dois cliques
  // rápidos criavam dois perfis iguais.
  const creatingRef = useRef(false)
  const createChild = async (form: FormData) => {
    if (creatingRef.current) return
    creatingRef.current = true
    try {
      const ok = await run('child', () => createFamilyAccount({
        fullName: String(form.get('fullName') || ''),
        birthDate: String(form.get('birthDate') || ''),
        gender: String(form.get('gender') || '') as 'm' | 'f',
      }), 'Perfil da criança criado.')
      if (ok) setCreatingChild(false)
    } finally {
      creatingRef.current = false
    }
  }

  const leave = () => {
    if (!window.confirm('Sair da família? Deixas de poder entrar nas contas das crianças.')) return
    void run('leave', leaveMyClubFamily, 'Saíste da família.')
  }

  const removeChild = (id: string, childName: string) => {
    if (!window.confirm(`Apagar definitivamente o perfil de ${childName}? Esta ação remove também os dados deste perfil.`)) return
    void run(`del:${id}`, () => deleteFamilyAccount(id), 'Perfil apagado.')
  }

  const saveOwnEmail = async (id: string, childName: string, email: string) => {
    setBusy('email')
    const r = await giveOwnEmail(id, email)
    setBusy(null)
    if (r.error) {
      toast.error(r.error)
      return
    }
    if (r.linkSent) toast.success(`Email guardado. ${childName} vai receber nesse email um link para escolher a palavra-passe.`)
    else toast.warning('Email guardado, mas o link para escolher a palavra-passe não foi enviado. Pede à coordenação para o reenviar.')
    setGivingEmail(null)
    router.refresh()
  }

  const today = new Date().toISOString().slice(0, 10)

  const childForm = (
    <form onSubmit={(e) => { e.preventDefault(); void createChild(new FormData(e.currentTarget)) }} className="space-y-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
      <div className="flex items-center gap-2 text-sm font-bold text-blue-950"><Baby className="h-4 w-4 text-rose-600" /> Novo perfil de criança</div>
      <input name="fullName" required placeholder="Nome completo" className={fieldClass} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-blue-950">Data de nascimento<input name="birthDate" type="date" required max={today} className={`${fieldClass} mt-1.5`} /></label>
        <label className="text-sm font-semibold text-blue-950">Sexo<select name="gender" required defaultValue="" className={`${fieldClass} mt-1.5`}><option value="" disabled>Selecionar</option><option value="m">Masculino</option><option value="f">Feminino</option></select></label>
      </div>
      <p className="text-xs text-stone-500">Sem email nem palavra-passe: os adultos da família entram neste perfil pelo menu do avatar. Mais tarde podes dar-lhe um email próprio.</p>
      <div className="flex gap-3">
        <button disabled={busy !== null} aria-busy={busy === 'child'} className="flex items-center gap-1.5 rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">
          {busy === 'child' ? <><Loader2 className="h-4 w-4 animate-spin" /> A criar…</> : 'Criar perfil'}
        </button>
        <button type="button" disabled={busy === 'child'} onClick={() => setCreatingChild(false)} className="px-3 text-sm font-bold text-stone-500 disabled:opacity-50">Cancelar</button>
      </div>
    </form>
  )

  return (
    <section id="familia" className="scroll-mt-24 rounded-[1.75rem] bg-white p-6 shadow-md shadow-blue-950/5 ring-1 ring-stone-200 sm:p-7">
      <div className="flex gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-md"><Heart className="h-5 w-5" /></span>
        <div>
          <h2 className="text-xl font-extrabold text-blue-950">A minha família</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Adultos e crianças, cada um com a sua conta. Os adultos entram nas contas das crianças da família; as crianças não entram nas
            dos adultos.
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
                {isAdult && (
                  <button type="button" onClick={() => { setNewName(family.name); setRenaming(true) }} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-blue-950" title="Mudar o nome">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>

          <ul className="space-y-2">
            {family.members.map((m) => {
              const canFix = isAdult && m.kind === 'child' && m.id !== userId
              return (
                <li key={m.id} className="rounded-2xl bg-rose-50/60 p-3 ring-1 ring-inset ring-rose-100">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={m.avatarUrl ?? undefined} alt={m.name} className="object-cover" />
                      <AvatarFallback className="bg-rose-500 text-sm font-extrabold text-white">{m.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-blue-950">{m.name}{m.id === userId && <span className="font-semibold text-stone-400"> (tu)</span>}</p>
                      {m.managed && <p className="text-[11px] font-semibold text-stone-500">Perfil sem email próprio</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${m.kind === 'adult' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>
                      {familyKindLabel(m.kind, m.gender)}
                    </span>
                    {canFix && (
                      <button type="button" onClick={() => setEditingBirth({ id: m.id, value: m.birthDate ?? '' })} className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-blue-950" title="Corrigir a data de nascimento">
                        <CalendarDays className="h-4 w-4" />
                      </button>
                    )}
                    {canFix && m.managed && (
                      <button type="button" onClick={() => setGivingEmail({ id: m.id, value: '' })} className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-blue-950" title="Dar um email próprio">
                        <Mail className="h-4 w-4" />
                      </button>
                    )}
                    {canFix && m.managed && (
                      <button type="button" disabled={busy !== null} onClick={() => removeChild(m.id, m.name)} className="rounded-lg p-1.5 text-red-500 hover:bg-white disabled:opacity-50" title="Apagar este perfil">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {canFix && hasImplausibleBirthDate(m.birthDate) && editingBirth?.id !== m.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span className="min-w-0 flex-1">A data de nascimento parece estar errada (dá menos de 1 ano). Corrige o ano.</span>
                      <button type="button" onClick={() => setEditingBirth({ id: m.id, value: m.birthDate ?? '' })} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-extrabold text-white">Corrigir agora</button>
                    </div>
                  )}
                  {editingBirth?.id === m.id && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-rose-200 pt-3">
                      <input type="date" max={today} value={editingBirth.value} onChange={(e) => setEditingBirth({ id: m.id, value: e.target.value })} className={`${fieldClass} max-w-[12rem]`} />
                      <button
                        type="button"
                        disabled={busy !== null || !editingBirth.value}
                        onClick={async () => { if (await run('birth', () => updateFamilyAccountBirthDate(m.id, editingBirth.value), 'Data atualizada.')) setEditingBirth(null) }}
                        className="rounded-xl bg-blue-950 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button type="button" onClick={() => setEditingBirth(null)} className="px-2 text-sm font-bold text-stone-500">Cancelar</button>
                    </div>
                  )}
                  {givingEmail?.id === m.id && (
                    <form
                      onSubmit={(e) => { e.preventDefault(); void saveOwnEmail(m.id, m.name, givingEmail.value) }}
                      className="mt-3 space-y-2 border-t border-rose-200 pt-3"
                    >
                      <p className="text-sm text-stone-600">
                        Com um email próprio, {m.name} passa a poder entrar sozinho(a). Vai receber nesse email um link para escolher a
                        palavra-passe. Os adultos da família continuam a poder entrar no perfil.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="email"
                          required
                          autoFocus
                          placeholder="email@exemplo.com"
                          value={givingEmail.value}
                          onChange={(e) => setGivingEmail({ id: m.id, value: e.target.value })}
                          className={`${fieldClass} min-w-0 flex-1 sm:max-w-xs`}
                        />
                        <button disabled={busy !== null || !givingEmail.value.trim()} className="rounded-xl bg-blue-950 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">
                          {busy === 'email' ? 'A guardar…' : 'Guardar email'}
                        </button>
                        <button type="button" onClick={() => setGivingEmail(null)} className="px-2 text-sm font-bold text-stone-500">Cancelar</button>
                      </div>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>

          {isAdult ? (
            <>
              <p className="text-xs text-stone-500">
                Para entrares na conta de uma criança, usa o menu do teu avatar, no topo da página. Só a coordenação muda quem é adulto ou
                criança.
              </p>

              {creatingChild ? childForm : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setCreatingChild(true)} className="rounded-2xl bg-blue-950 p-4 text-left text-white transition hover:bg-blue-900">
                    <Baby className="h-5 w-5 text-yellow-300" />
                    <p className="mt-3 font-extrabold">Criar perfil de criança</p>
                    <p className="mt-1 text-sm text-blue-200">Sem email nem palavra-passe próprios.</p>
                  </button>
                  {!family.invite && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => run('invite', createClubFamilyInvite)}
                      className="rounded-2xl bg-rose-50 p-4 text-left text-blue-950 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      {busy === 'invite' ? <Loader2 className="h-5 w-5 animate-spin text-rose-600" /> : <UserPlus className="h-5 w-5 text-rose-600" />}
                      <p className="mt-3 font-extrabold">Convidar familiar</p>
                      <p className="mt-1 text-sm text-stone-500">Quem já tem conta própria, adulto ou criança.</p>
                    </button>
                  )}
                </div>
              )}

              {family.invite && (
                <div className="rounded-2xl bg-rose-50 p-5 ring-1 ring-inset ring-rose-200">
                  <p className="font-bold text-blue-950">Envia o link ou o código só a quem é da família</p>
                  <p className="mt-1 text-sm text-stone-600">
                    Um adulto que aceite passa a poder entrar nas contas das crianças. Uma criança que aceite fica com a conta acessível aos
                    adultos. Vale {FAMILY_INVITE_HOURS} h e só pode ser usado uma vez.
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
              )}

              <button type="button" disabled={busy !== null} onClick={leave} className="flex items-center gap-1.5 text-sm font-bold text-stone-500 hover:text-red-600">
                <LogOut className="h-4 w-4" /> Sair da família
              </button>
            </>
          ) : (
            <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600 ring-1 ring-inset ring-stone-200">
              Os adultos da família podem entrar na tua conta. Para saíres da família, fala com um adulto da família ou com a coordenação.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {joinKind === 'adult' ? (
            <div className="space-y-2">
              <p className="text-sm font-bold text-blue-950">Criar a minha família</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nome da família" className={fieldClass} />
                <button
                  type="button"
                  disabled={busy !== null || name.trim().length < 2}
                  onClick={() => run('create', () => createMyClubFamily(name), 'Família criada. Agora cria os perfis das crianças ou convida os outros.')}
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
                >
                  {busy === 'create' && <Loader2 className="h-4 w-4 animate-spin" />} Criar
                </button>
              </div>
              {creatingChild ? childForm : (
                <button type="button" onClick={() => setCreatingChild(true)} className="flex items-center gap-1.5 text-sm font-bold text-blue-900 hover:underline">
                  <Baby className="h-4 w-4" /> Ou cria logo o perfil de uma criança (a família é criada contigo)
                </button>
              )}
            </div>
          ) : (
            <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600 ring-1 ring-inset ring-stone-200">
              A família é criada por um adulto. Pede-lhe um convite e escreve aqui o código.
            </p>
          )}

          <div className={joinKind === 'adult' ? 'border-t border-stone-100 pt-6' : ''}>
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
                onClick={inspect}
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
                    {preview.members.length > 0 && <> com {preview.members.join(', ')}</>} como <b>{preview.kind === 'adult' ? 'adulto' : 'criança'}</b>.{' '}
                    {preview.kind === 'adult'
                      ? 'Vais poder entrar nas contas das crianças desta família.'
                      : 'Os adultos desta família vão poder entrar na tua conta.'}
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
