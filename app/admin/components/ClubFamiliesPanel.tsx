'use client'

import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, Heart, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  adminAddToClubFamily, adminCreateClubFamily, adminDeleteClubFamily, adminRemoveFromClubFamily, listClubFamiliesForAdmin,
  renameClubFamily, setClubFamilyKind,
} from '@/lib/actions/club-families'
import { familyKindLabel, suggestedFamilyName, type ClubFamily, type FamilyKind } from '@/utils/club-families'
import { SECTION_DOT } from './member-constants'

type Member = { id: string; full_name: string | null; section: string | null }

const selectClass = 'h-9 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-2 text-sm'

/**
 * Famílias do clube na administração dos membros: quem é família de quem, adultos e crianças,
 * e quem é responsável de contas familiares. A coordenação cria e corrige; o dirigente só vê.
 */
export function ClubFamiliesPanel({ members }: { members: Member[] }) {
  const [open, setOpen] = useState(false)
  const [families, setFamilies] = useState<ClubFamily[] | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [draft, setDraft] = useState<{ name: string; ids: string[] } | null>(null)
  const [draftPick, setDraftPick] = useState('')

  const load = useCallback(async () => {
    const r = await listClubFamiliesForAdmin()
    if (r.error) {
      toast.error(r.error)
      return
    }
    setFamilies(r.families ?? [])
    setCanEdit(!!r.canEdit)
  }, [])

  const inFamily = useMemo(() => new Set((families ?? []).flatMap((f) => f.members.map((m) => m.id))), [families])
  const free = useMemo(
    () => [...members].filter((m) => !inFamily.has(m.id)).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt')),
    [members, inFamily],
  )
  const nameOf = (id: string) => members.find((m) => m.id === id)?.full_name || 'Sem nome'

  const run = async (key: string, fn: () => Promise<{ error?: string }>, ok?: string) => {
    setBusy(key)
    const r = await fn()
    if (r.error) toast.error(r.error)
    else {
      if (ok) toast.success(ok)
      await load()
    }
    setBusy(null)
    return !r.error
  }

  const createDraft = async () => {
    if (!draft) return
    if (await run('create', () => adminCreateClubFamily(draft.name, draft.ids), 'Família criada.')) setDraft(null)
  }

  const pickForDraft = (id: string) => {
    if (!id || !draft || draft.ids.includes(id)) return
    const ids = [...draft.ids, id]
    // O nome segue o apelido da primeira pessoa, até alguém o mudar à mão.
    const name = draft.ids.length === 0 && draft.name === '' ? suggestedFamilyName(nameOf(id)) : draft.name
    setDraft({ name, ids })
    setDraftPick('')
  }

  const count = families?.length

  return (
    <div className="rounded-2xl bg-rose-50/60 ring-1 ring-inset ring-rose-200">
      <button
        type="button"
        onClick={() => {
          // Carrega só quando se abre pela primeira vez.
          if (!open && families === null) void load()
          setOpen((o) => !o)
        }}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm text-rose-900"
      >
        <Heart className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <b>Famílias do clube</b>
          {count !== undefined && <> · {count} {count === 1 ? 'família' : 'famílias'}</>} — quem é família de quem (adultos e crianças, cada
          um com a sua conta). No Formador de equipas ficam sempre juntos.
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-rose-200 px-4 py-4">
          {families === null ? (
            <p className="flex items-center gap-2 text-sm text-rose-900/70"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</p>
          ) : (
            <>
              <p className="text-xs text-rose-900/80">
                Os membros também criam a família no perfil (<b>A minha família</b>) e convidam os outros com um código. Os perfis
                associados a uma conta entram com o responsável.{canEdit ? ' Aqui podes criar e corrigir qualquer família.' : ''}
              </p>

              {canEdit && (
                draft ? (
                  <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-rose-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Nova família</p>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      maxLength={40}
                      placeholder="Nome (ex.: Família Costa)"
                      className="h-9 w-full rounded-xl border border-stone-200 px-3 text-sm"
                    />
                    <select value={draftPick} onChange={(e) => pickForDraft(e.target.value)} className={`${selectClass} w-full`}>
                      <option value="">Juntar pessoa…</option>
                      {free.filter((m) => !draft.ids.includes(m.id)).map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name}</option>
                      ))}
                    </select>
                    {draft.ids.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {draft.ids.map((id) => (
                          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-rose-100 py-0.5 pl-2.5 pr-1 text-xs font-bold text-rose-900">
                            {nameOf(id)}
                            <button type="button" onClick={() => setDraft({ ...draft, ids: draft.ids.filter((x) => x !== id) })} className="rounded-full p-0.5 hover:bg-rose-200">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-stone-500">Adulto ou criança fica pela idade do perfil; depois podes trocar.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={createDraft}
                        disabled={busy !== null || draft.ids.length === 0 || draft.name.trim().length < 2}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {busy === 'create' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Criar família
                      </button>
                      <button type="button" onClick={() => setDraft(null)} className="px-2 text-xs font-bold text-stone-500">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDraft({ name: '', ids: [] })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    <Plus className="h-3.5 w-3.5" /> Nova família
                  </button>
                )
              )}

              {families.length === 0 ? (
                <p className="text-sm text-rose-900/70">Ainda não há famílias.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {families.map((f) => (
                    <div key={f.id} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-rose-100">
                      <div className="flex items-center gap-2">
                        {renaming?.id === f.id ? (
                          <>
                            <input
                              value={renaming.name}
                              onChange={(e) => setRenaming({ id: f.id, name: e.target.value })}
                              maxLength={40}
                              className="h-8 min-w-0 flex-1 rounded-lg border border-stone-200 px-2 text-sm"
                            />
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={async () => { if (await run(`rename:${f.id}`, () => renameClubFamily(f.id, renaming.name))) setRenaming(null) }}
                              className="rounded-lg bg-blue-950 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
                            >
                              Guardar
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="min-w-0 flex-1 truncate font-extrabold text-blue-950">{f.name}</p>
                            {canEdit && (
                              <>
                                <button type="button" onClick={() => setRenaming({ id: f.id, name: f.name })} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-blue-950" title="Mudar o nome">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() => window.confirm(`Apagar a ${f.name}? As pessoas continuam com as suas contas.`) && run(`del:${f.id}`, () => adminDeleteClubFamily(f.id), 'Família apagada.')}
                                  className="rounded-lg p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                                  title="Apagar a família"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      <ul className="space-y-1">
                        {f.members.map((m) => (
                          <li key={m.id} className="flex items-center gap-2 text-sm">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${SECTION_DOT[m.section || ''] || 'bg-stone-300'}`} />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-semibold text-blue-950">{m.name}</span>
                              {m.accountOwner && <span className="ml-1.5 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-800">Responsável da conta</span>}
                              {m.managedBy && <span className="ml-1.5 text-[11px] text-stone-400">perfil de {m.managedBy}</span>}
                            </span>
                            {canEdit ? (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => run(`kind:${m.id}`, () => setClubFamilyKind(m.id, (m.kind === 'adult' ? 'child' : 'adult') as FamilyKind))}
                                title="Trocar entre adulto e criança"
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ring-inset disabled:opacity-50 ${m.kind === 'adult' ? 'bg-blue-50 text-blue-800 ring-blue-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}
                              >
                                {familyKindLabel(m.kind, m.gender)}
                              </button>
                            ) : (
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${m.kind === 'adult' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>
                                {familyKindLabel(m.kind, m.gender)}
                              </span>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => run(`rm:${m.id}`, () => adminRemoveFromClubFamily(f.id, m.id))}
                                className="shrink-0 rounded p-0.5 text-stone-300 hover:bg-red-50 hover:text-red-600"
                                title="Tirar da família"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>

                      {canEdit && (
                        <div className="flex gap-2 pt-1">
                          <select
                            value={adding[f.id] ?? ''}
                            onChange={(e) => setAdding((a) => ({ ...a, [f.id]: e.target.value }))}
                            className={selectClass}
                          >
                            <option value="">Juntar pessoa…</option>
                            {free.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                          </select>
                          <button
                            type="button"
                            disabled={!adding[f.id] || busy !== null}
                            onClick={async () => {
                              if (await run(`add:${f.id}`, () => adminAddToClubFamily(f.id, [adding[f.id]]))) setAdding((a) => ({ ...a, [f.id]: '' }))
                            }}
                            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-blue-950 px-3 text-xs font-bold text-white disabled:opacity-40"
                          >
                            {busy === `add:${f.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Juntar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
