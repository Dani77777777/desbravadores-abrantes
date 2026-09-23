'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { detectGender, type Gender } from '@/utils/name-gender'
import { SECTION_LABELS } from '@/utils/permissions'
import { SECTION_DOT } from './member-constants'

type Member = { id: string; full_name: string | null; section: string | null; gender?: string | null }

/**
 * Membros que ainda não indicaram o sexo no perfil (contas anteriores ao onboarding pedir).
 * Mostra o palpite pelo nome; a coordenação define um a um ou todos de uma vez.
 */
export function GenderReview({ members }: { members: Member[] }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<Record<string, Gender>>({})
  const [busy, setBusy] = useState(false)

  const pending = members.filter((m) => m.gender !== 'm' && m.gender !== 'f' && !done[m.id])
  if (pending.length === 0) return null

  const save = async (ids: string[], g: Gender) => {
    if (ids.length === 0) return true
    const { error } = await supabase.from('profiles').update({ gender: g }).in('id', ids)
    if (error) {
      toast.error('Não foi possível guardar o sexo.')
      return false
    }
    setDone((d) => ({ ...d, ...Object.fromEntries(ids.map((id) => [id, g])) }))
    return true
  }

  const confirmOne = async (id: string, g: Gender) => {
    if (await save([id], g)) router.refresh()
  }

  const confirmAll = async () => {
    setBusy(true)
    const m = pending.filter((p) => detectGender(p.full_name || '') === 'm').map((p) => p.id)
    const f = pending.filter((p) => detectGender(p.full_name || '') === 'f').map((p) => p.id)
    const ok = (await save(m, 'm')) && (await save(f, 'f'))
    setBusy(false)
    if (ok) {
      toast.success(`${m.length + f.length} confirmados`)
      router.refresh()
    }
  }

  return (
    <div className="rounded-2xl bg-pink-50/60 ring-1 ring-inset ring-pink-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm text-pink-900"
      >
        <span className="font-black">♂?/♀?</span>
        <span className="flex-1">
          <b>{pending.length}</b> {pending.length === 1 ? 'membro ainda não indicou' : 'membros ainda não indicaram'} o sexo no perfil
          (usado nas Tendas e boleias). Podes defini-lo por eles.
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-pink-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-xs text-pink-900/80">O destacado é o palpite pelo primeiro nome. Carrega no certo para o guardar.</p>
            <button
              type="button"
              onClick={confirmAll}
              disabled={busy}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-pink-600 px-3 text-xs font-bold text-white hover:bg-pink-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Os palpites estão certos, confirmar todos
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-pink-100 overflow-y-auto rounded-xl bg-white ring-1 ring-pink-100">
            {pending.map((m) => {
              const guess = detectGender(m.full_name || '')
              return (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${m.section ? SECTION_DOT[m.section] || 'bg-stone-300' : 'bg-stone-300'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-blue-950">{m.full_name}</span>
                    <span className="text-[11px] text-stone-400">{m.section ? SECTION_LABELS[m.section] : ''}</span>
                  </span>
                  {(['m', 'f'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => confirmOne(m.id, g)}
                      className={`h-8 cursor-pointer rounded-lg px-2.5 text-xs font-bold ring-1 ring-inset transition-colors ${
                        guess === g
                          ? g === 'm'
                            ? 'bg-sky-600 text-white ring-sky-600 hover:bg-sky-700'
                            : 'bg-pink-600 text-white ring-pink-600 hover:bg-pink-700'
                          : 'bg-white text-stone-500 ring-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {g === 'm' ? '♂ Masculino' : '♀ Feminino'}
                    </button>
                  ))}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
