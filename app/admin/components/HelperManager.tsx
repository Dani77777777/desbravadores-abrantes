'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { HandHelping, Search, UserPlus, X, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { SECTION_LABELS, helperLabel } from '@/utils/permissions'

interface ClubMember {
  id: string
  full_name: string
  avatar_url: string | null
  section: string
  role: string
  helper_role: string | null
  helper_section: string | null
}

interface HelperManagerProps {
  adminProfile: any        // perfil REAL de quem está a gerir
  clubMembers: ClubMember[]
}

export function HelperManager({ adminProfile, clubMembers }: HelperManagerProps) {
  const router = useRouter()
  const supabase = createClient()

  const realRole = adminProfile?.role
  const isCoordenador = realRole === 'coordenador'
  const myLeadership = adminProfile?.leadership_section || adminProfile?.section

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 'coordenador' ou uma chave de secção (só relevante para o coordenador)
  const [scope, setScope] = useState<string>('coordenador')
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const helpers = useMemo(() => {
    const all = clubMembers.filter((m) => m.helper_role)
    // O dirigente só gere os ajudantes do seu próprio âmbito.
    if (isCoordenador) return all
    return all.filter((m) => m.helper_role === 'dirigente' && m.helper_section === myLeadership)
  }, [clubMembers, isCoordenador, myLeadership])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clubMembers
    return clubMembers.filter((m) => m.full_name?.toLowerCase().includes(q))
  }, [clubMembers, search])

  const assign = async (targetId: string, helperRole: string | null, helperSection: string | null) => {
    setLoadingId(targetId)
    try {
      const { error } = await supabase.rpc('assign_helper', {
        p_target_id: targetId,
        p_helper_role: helperRole,
        p_helper_section: helperSection,
      })
      if (error) throw error
      toast.success(helperRole ? 'Ajudante nomeado!' : 'Ajudante removido.')
      setOpen(false)
      setSelectedId(null)
      setSearch('')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar ajudante.')
    } finally {
      setLoadingId(null)
    }
  }

  const handleNominate = () => {
    if (!selectedId) {
      toast.error('Escolhe um membro.')
      return
    }
    if (isCoordenador) {
      if (scope === 'coordenador') {
        assign(selectedId, 'coordenador', null)
      } else {
        assign(selectedId, 'dirigente', scope)
      }
    } else {
      // dirigente: âmbito fixo na sua secção (a RPC força na BD de qualquer forma)
      assign(selectedId, 'dirigente', myLeadership)
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
            <HandHelping className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Ajudantes</h3>
            <p className="text-xs text-gray-600 max-w-md">
              {isCoordenador
                ? 'Dá acesso de gestão a um membro como ajudante de Coordenação ou de um líder de secção. Continuam a aparecer no ranking.'
                : `Nomeia qualquer membro do clube como teu ajudante (${SECTION_LABELS[myLeadership] || myLeadership}). Continuam a aparecer no ranking.`}
            </p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectedId(null); setSearch('') } }}>
          <DialogTrigger asChild>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
              <UserPlus className="w-4 h-4 mr-2" /> Nomear ajudante
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Nomear ajudante</DialogTitle>
              <DialogDescription>
                Escolhe qualquer membro do clube{isCoordenador ? ' e o âmbito do acesso.' : `. O acesso será de ${SECTION_LABELS[myLeadership] || myLeadership}.`}
              </DialogDescription>
            </DialogHeader>

            {/* Âmbito (só coordenador) */}
            {isCoordenador && (
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-slate-500">Âmbito do acesso</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coordenador">Coordenação (acesso total)</SelectItem>
                    {Object.entries(SECTION_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>Líder · {label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Pesquisa */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Pesquisar membro..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Lista de membros */}
            <div className="max-h-64 overflow-y-auto rounded-xl border divide-y">
              {filtered.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-6">Nenhum membro encontrado.</p>
              )}
              {filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                    selectedId === m.id ? 'bg-amber-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <Avatar className="h-9 w-9 border">
                    <AvatarImage src={m.avatar_url || undefined} className="object-cover" />
                    <AvatarFallback className="bg-slate-200 text-slate-500 text-xs font-bold">{m.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 truncate">{m.full_name}</p>
                    <p className="text-[11px] text-gray-500 capitalize">{SECTION_LABELS[m.section] || m.section}</p>
                  </div>
                  {m.helper_role && (
                    <Badge variant="outline" className="text-[9px] h-4 border-amber-300 text-amber-700 bg-amber-50 font-bold leading-none">
                      {helperLabel(m)}
                    </Badge>
                  )}
                </button>
              ))}
            </div>

            <DialogFooter>
              <Button
                onClick={handleNominate}
                disabled={!selectedId || loadingId !== null}
                className="bg-amber-600 hover:bg-amber-700 text-white w-full"
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                {loadingId ? 'A nomear...' : 'Nomear ajudante'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista de ajudantes atuais */}
      {helpers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {helpers.map((h) => (
            <div key={h.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-full pl-1 pr-2 py-1 shadow-sm">
              <Avatar className="h-6 w-6 border">
                <AvatarImage src={h.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-slate-200 text-slate-500 text-[10px] font-bold">{h.full_name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-semibold text-gray-800">{h.full_name}</span>
              <span className="text-[10px] text-amber-700 font-bold">· {helperLabel(h)?.replace('Ajudante · ', '')}</span>
              <button
                type="button"
                onClick={() => assign(h.id, null, null)}
                disabled={loadingId === h.id}
                className="ml-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Remover ajudante"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
