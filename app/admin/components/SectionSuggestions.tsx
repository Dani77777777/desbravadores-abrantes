'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ArrowRight, ChevronDown, ChevronUp, GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { SECTION_LABELS } from '@/utils/permissions'
import { SECTION_DOT } from './member-constants'

export interface SectionSuggestion {
  id: string
  full_name: string
  avatar_url: string | null
  birth_date: string
  age: number
  section: string
  suggested_section: string
  is_invested: boolean
}

function SectionPill({ section }: { section: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
      <span className={`h-2 w-2 rounded-full ${SECTION_DOT[section] || 'bg-slate-300'}`} />
      {SECTION_LABELS[section] || section}
    </span>
  )
}

export function SectionSuggestions({ suggestions }: { suggestions: SectionSuggestion[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(true)
  const [resetInvestiture, setResetInvestiture] = useState(true)
  const [notify, setNotify] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)

  if (suggestions.length === 0) return null

  const apply = async (ids: string[]) => {
    setBusyId(ids.length === 1 ? ids[0] : 'all')
    try {
      const { data, error } = await supabase.rpc('apply_age_sections', {
        p_member_ids: ids,
        p_reset_investiture: resetInvestiture,
        p_notify: notify,
      })
      if (error) throw error
      toast.success(data === 1 ? 'Classe atualizada.' : `${data} membros mudaram de classe.`)
      setConfirmAll(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao mudar de classe.')
    } finally {
      setBusyId(null)
    }
  }

  const dismiss = async (id: string) => {
    setBusyId(id)
    const { error } = await supabase.rpc('dismiss_section_suggestion', { p_member_id: id })
    setBusyId(null)
    if (error) return toast.error(error.message || 'Erro ao ignorar sugestão.')
    toast.success('Sugestão ignorada. Volta a aparecer quando a idade indicar outra classe.')
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-indigo-950">
            {suggestions.length} {suggestions.length === 1 ? 'membro pode mudar' : 'membros podem mudar'} de classe
          </p>
          <p className="text-xs text-indigo-800/70">
            Pela idade, estes membros já pertencem a outra classe. Nada muda sem confirmares.
          </p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
      </button>

      {open && (
        <div className="border-t border-indigo-100 bg-white">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b text-xs text-slate-600">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={resetInvestiture} onChange={(e) => setResetInvestiture(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
              Reiniciar investidura
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
              Avisar os membros
            </label>
            <div className="ml-auto flex items-center gap-2">
              {confirmAll ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmAll(false)} disabled={busyId === 'all'}>Cancelar</Button>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => apply(suggestions.map((s) => s.id))} disabled={busyId === 'all'}>
                    {busyId === 'all' ? 'A mudar...' : `Confirmar ${suggestions.length} mudanças`}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50" onClick={() => setConfirmAll(true)}>
                  Mudar todos
                </Button>
              )}
            </div>
          </div>

          <div className="divide-y">
            {suggestions.map((s) => (
              <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-2.5">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={s.avatar_url || undefined} className="object-cover" />
                    <AvatarFallback className="bg-slate-200 text-slate-600 text-xs font-bold">{s.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{s.full_name}</p>
                    <p className="text-[11px] text-slate-500">
                      {s.age} anos{s.is_invested ? ' · investido' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-12 sm:pl-0">
                  <SectionPill section={s.section} />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <SectionPill section={s.suggested_section} />
                </div>
                <div className="flex items-center gap-1 pl-12 sm:pl-0">
                  <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => dismiss(s.id)} disabled={!!busyId}>
                    Ignorar
                  </Button>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => apply([s.id])} disabled={!!busyId}>
                    {busyId === s.id ? 'A mudar...' : 'Mudar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
