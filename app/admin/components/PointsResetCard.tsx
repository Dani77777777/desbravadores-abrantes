'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, ChevronDown, ChevronUp, Coins, RotateCcw, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { SECTION_LABELS } from '@/utils/permissions'

const CONFIRM_WORD = 'RESETAR'
const nf = new Intl.NumberFormat('pt-PT')

export function PointsResetCard({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const supabase = createClient()

  const [seasons, setSeasons] = useState<any[]>([])
  const [seasonsKey, setSeasonsKey] = useState(0)
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null)
  const [standings, setStandings] = useState<Record<string, any[]>>({})

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'options' | 'confirm'>('options')
  const [label, setLabel] = useState('')
  const [resetXp, setResetXp] = useState(true)
  const [resetGold, setResetGold] = useState(true)
  const [confirmText, setConfirmText] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('points_seasons')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (!cancelled) setSeasons(data || []) })
    return () => { cancelled = true }
  }, [seasonsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = async () => {
    setStep('options')
    setLabel(`Época ${new Date().getFullYear()}`)
    setResetXp(true)
    setResetGold(true)
    setConfirmText('')
    setPreview(null)
    setOpen(true)
    const { data, error } = await supabase.rpc('preview_points_reset')
    if (error) return toast.error(error.message)
    setPreview(data)
  }

  const toggleStandings = async (seasonId: string) => {
    if (expandedSeason === seasonId) return setExpandedSeason(null)
    setExpandedSeason(seasonId)
    if (standings[seasonId]) return
    const { data } = await supabase
      .from('points_season_standings')
      .select('*')
      .eq('season_id', seasonId)
      .not('rank', 'is', null)
      .order('rank', { ascending: true })
      .limit(10)
    setStandings((prev) => ({ ...prev, [seasonId]: data || [] }))
  }

  const runReset = async () => {
    setRunning(true)
    const { data, error } = await supabase.rpc('reset_all_points', {
      p_label: label,
      p_reset_xp: resetXp,
      p_reset_gold: resetGold,
      p_confirm: confirmText.trim().toUpperCase(),
    })
    setRunning(false)
    if (error) return toast.error(error.message)
    toast.success(`Reset feito: ${data.members} membros voltaram a 0. A classificação ficou arquivada em "${label}".`)
    setOpen(false)
    setSeasonsKey((k) => k + 1)
    onDone()
    router.refresh()
  }

  const affected = preview
    ? Math.max(resetXp ? preview.members_with_xp : 0, resetGold ? preview.members_with_gold : 0)
    : 0

  return (
    <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
        <div className="h-10 w-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
          <RotateCcw className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">Reset de época</h3>
          <p className="text-sm text-slate-500">
            Põe o XP e/ou o Ouro de todos a 0 (ex.: no fim do ano). O histórico não é apagado e a classificação final fica arquivada.
          </p>
        </div>
        <Button variant="outline" onClick={openDialog} className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800">
          Fazer reset…
        </Button>
      </div>

      {seasons.length > 0 && (
        <div className="border-t">
          <p className="px-5 pt-3 pb-1 text-[11px] uppercase font-semibold tracking-wider text-slate-500">Épocas anteriores</p>
          <ul className="divide-y">
            {seasons.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggleStandings(s.id)}
                  className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{s.label}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(s.created_at).toLocaleDateString('pt-PT')} · {s.performed_by_name || 'Coordenação'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {s.members_count} membros
                    {s.reset_xp && ` · −${nf.format(s.total_xp_removed)} XP`}
                    {s.reset_gold && ` · −${nf.format(s.total_gold_removed)} Ouro`}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                    Classificação final {expandedSeason === s.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                </button>
                {expandedSeason === s.id && (
                  <ol className="px-5 pb-4 space-y-1">
                    {(standings[s.id] || []).map((r) => (
                      <li key={r.user_id} className="flex items-center gap-3 text-sm">
                        <span className="w-5 text-right text-xs tabular-nums text-slate-400">{r.rank}</span>
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={r.avatar_url} className="object-cover" />
                          <AvatarFallback className="text-[9px] font-bold bg-slate-200">{r.full_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="flex-1 min-w-0 truncate text-slate-800">
                          {r.full_name} <span className="text-xs text-slate-400">{SECTION_LABELS[r.section] || ''}</span>
                        </span>
                        <span className="text-xs tabular-nums text-slate-600">{nf.format(r.xp)} XP · {nf.format(r.gold)} Ouro</span>
                      </li>
                    ))}
                    {standings[s.id]?.length === 0 && <li className="text-xs text-slate-400">Sem desbravadores com pontos nesta época.</li>}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <DialogContent className="sm:max-w-[460px]">
          {step === 'options' ? (
            <>
              <DialogHeader>
                <DialogTitle>Reset de pontos</DialogTitle>
                <DialogDescription>Escolhe o que volta a 0 para todos os membros.</DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="season-label">Nome da época que termina</Label>
                <Input id="season-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
                <p className="text-xs text-slate-500">Aparece no histórico de pontos de cada membro e no arquivo.</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'xp', label: 'XP', icon: <Trophy className="w-4 h-4 text-indigo-600" />, checked: resetXp, set: setResetXp, total: preview?.total_xp, members: preview?.members_with_xp },
                  { key: 'gold', label: 'Ouro', icon: <Coins className="w-4 h-4 text-yellow-600" />, checked: resetGold, set: setResetGold, total: preview?.total_gold, members: preview?.members_with_gold },
                ]).map((o) => (
                  <label
                    key={o.key}
                    className={`flex flex-col gap-1 rounded-xl border p-3 cursor-pointer transition-colors ${o.checked ? 'border-red-300 bg-red-50/60' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <input type="checkbox" checked={o.checked} onChange={(e) => o.set(e.target.checked)} className="h-4 w-4 accent-red-600" />
                      {o.icon} Reset {o.label}
                    </span>
                    <span className="text-xs text-slate-500 pl-6">
                      {preview ? `${nf.format(o.total)} ${o.label} em ${o.members} membros` : 'A calcular…'}
                    </span>
                  </label>
                ))}
              </div>

              <ul className="text-xs text-slate-600 space-y-1 list-disc pl-5">
                <li>O ranking recomeça do zero e todos voltam ao <strong>Nível 1</strong> (se fizeres reset ao XP).</li>
                {resetGold && <li>O Ouro que ainda não foi gasto na loja perde-se, e a taxa de desconto da loja é recalculada.</li>}
                <li>O histórico mantém-se: cada membro vê um movimento &ldquo;Reset de pontos: {label || '…'}&rdquo;.</li>
              </ul>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button
                  onClick={() => setStep('confirm')}
                  disabled={(!resetXp && !resetGold) || !label.trim() || !preview || affected === 0}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Continuar
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="mx-auto sm:mx-0 h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-1">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <DialogTitle>Tens a certeza?</DialogTitle>
                <DialogDescription>
                  Vais pôr {[resetXp && 'o XP', resetGold && 'o Ouro'].filter(Boolean).join(' e ')} de <strong>{affected} membros</strong> a 0.
                  Não há botão para desfazer.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-reset" className="text-xs text-slate-600">
                  Escreve <span className="font-mono font-bold text-red-600">{CONFIRM_WORD}</span> para confirmar
                </Label>
                <Input
                  id="confirm-reset"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  placeholder={CONFIRM_WORD}
                  className="font-mono uppercase focus-visible:ring-red-500"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setStep('options')} disabled={running}>Voltar</Button>
                <Button
                  onClick={runReset}
                  disabled={confirmText.trim().toUpperCase() !== CONFIRM_WORD || running}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {running ? 'A fazer reset…' : 'Fazer reset agora'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
