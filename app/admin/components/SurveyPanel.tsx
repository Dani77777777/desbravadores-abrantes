'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Plus, Trophy, Coins, Trash2, CalendarClock, BarChart3, ClipboardList, X, Users, Award, Lock, RefreshCw, EyeOff, Play, Link2, MonitorPlay } from 'lucide-react'

interface SurveyPanelProps {
  profile: any
  surveys: any[] // surveys with options[] and responses[]
}

type DraftOption = { label: string; xp_reward: number; gold_reward: number }

export function SurveyPanel({ profile, surveys }: SurveyPanelProps) {
  const supabase = createClient()
  const router = useRouter()

  const [createOpen, setCreateOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [showResultsLive, setShowResultsLive] = useState(false)
  const [isDefinitive, setIsDefinitive] = useState(true)
  const [hideRewards, setHideRewards] = useState(false)
  const [startClosed, setStartClosed] = useState(false)
  const [finalizing, setFinalizing] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [options, setOptions] = useState<DraftOption[]>([
    { label: '', xp_reward: 0, gold_reward: 0 },
    { label: '', xp_reward: 0, gold_reward: 0 },
  ])
  const [creating, setCreating] = useState(false)

  // Re-render every 30s so deadlines tick live
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const addOption = () => setOptions([...options, { label: '', xp_reward: 0, gold_reward: 0 }])
  const removeOption = (idx: number) => {
    if (options.length <= 2) return
    setOptions(options.filter((_, i) => i !== idx))
  }
  const updateOption = (idx: number, patch: Partial<DraftOption>) => {
    setOptions(options.map((o, i) => (i === idx ? { ...o, ...patch } : o)))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (options.some(o => !o.label.trim())) {
      toast.error('Preenche o texto de todas as opções (ou remove as vazias).')
      return
    }
    setCreating(true)
    try {
      const { data: survey, error: sErr } = await supabase
        .from('surveys')
        .insert({
          question: question.trim(),
          description: description.trim() || null,
          deadline,
          show_results_live: showResultsLive,
          is_definitive: isDefinitive,
          hide_rewards: hideRewards,
          opened_at: startClosed ? null : new Date().toISOString(),
          created_by_user_id: profile.id,
        })
        .select()
        .single()
      if (sErr) throw sErr

      const { error: oErr } = await supabase.from('survey_options').insert(
        options.map((o, i) => ({
          survey_id: survey.id,
          label: o.label.trim(),
          xp_reward: o.xp_reward || 0,
          gold_reward: o.gold_reward || 0,
          position: i,
        }))
      )
      if (oErr) throw oErr

      toast.success('Inquérito criado!')
      setCreateOpen(false)
      setQuestion('')
      setDescription('')
      setDeadline('')
      setShowResultsLive(false)
      setIsDefinitive(true)
      setHideRewards(false)
      setStartClosed(false)
      setOptions([
        { label: '', xp_reward: 0, gold_reward: 0 },
        { label: '', xp_reward: 0, gold_reward: 0 },
      ])
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar inquérito.')
    } finally {
      setCreating(false)
    }
  }

  const handleFinalize = async (surveyId: string) => {
    if (!confirm('Finalizar este inquérito? Os pontos serão atribuídos a todos os respondentes e o inquérito não poderá ser finalizado novamente.')) return
    setFinalizing(surveyId)
    try {
      const { error } = await supabase.rpc('finalize_survey', { p_survey_id: surveyId })
      if (error) throw error
      toast.success('Inquérito finalizado e pontos atribuídos!')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao finalizar.')
    } finally {
      setFinalizing(null)
    }
  }

  const handleOpenVoting = async (id: string) => {
    if (!confirm('Abrir a votação agora? Os membros passam a ver o inquérito e podem votar.')) return
    setOpening(id)
    try {
      const { error } = await supabase
        .from('surveys')
        .update({ opened_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      toast.success('Votação aberta!')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao abrir a votação.')
    } finally {
      setOpening(null)
    }
  }

  const handleCloseVoting = async (id: string) => {
    if (!confirm('Fechar a votação? O inquérito volta a ficar escondido dos membros (os votos já feitos não se perdem). Podes reabri-lo quando quiseres.')) return
    setOpening(id)
    try {
      const { error } = await supabase
        .from('surveys')
        .update({ opened_at: null })
        .eq('id', id)
      if (error) throw error
      toast.success('Votação fechada — inquérito escondido.')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao fechar a votação.')
    } finally {
      setOpening(null)
    }
  }

  const copyEmbedLink = (id: string) => {
    const url = `${window.location.origin}/embed/inquerito/${id}`
    navigator.clipboard.writeText(url)
    toast.success('Link de embed copiado! Adiciona ?qr=1 para mostrar um QR de voto.')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Apagar este inquérito e todas as respostas?')) return
    const { error } = await supabase.from('surveys').delete().eq('id', id)
    if (error) toast.error('Erro ao apagar.')
    else {
      toast.success('Inquérito apagado.')
      router.refresh()
    }
  }

  const now = new Date()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            Cria inquéritos de escolha múltipla para os Desbravadores. Define recompensas (XP/Gold) por
            opção — usa o mesmo valor em todas para premiar quem participar, ou valores diferentes para
            premiar respostas específicas.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-800 hover:bg-blue-900 gap-2 h-11 px-6 shadow-md shrink-0">
              <Plus className="w-4 h-4" /> Novo Inquérito
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Inquérito</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="s-q">Pergunta *</Label>
                <Input id="s-q" value={question} onChange={e => setQuestion(e.target.value)} required placeholder="Ex: Qual a actividade favorita?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-d">Descrição (opcional)</Label>
                <Textarea id="s-d" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Detalhes adicionais..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-dl" className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Data limite *</Label>
                <Input id="s-dl" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} required />
                <p className="text-[10px] text-gray-500">Depois desta data o inquérito fecha. Os resultados ficam visíveis a todos durante 3 dias.</p>
              </div>

              <div className="flex items-start justify-between gap-4 p-3 border rounded-lg bg-slate-50/50">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="s-live" className="cursor-pointer">Mostrar votos dos outros em tempo real</Label>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Se desligado (padrão), os resultados só aparecem aos membros depois da data limite.
                    Se ligado, qualquer pessoa vê as percentagens enquanto o inquérito está aberto.
                  </p>
                </div>
                <Switch id="s-live" checked={showResultsLive} onCheckedChange={setShowResultsLive} />
              </div>

              <div className="flex items-start justify-between gap-4 p-3 border rounded-lg bg-slate-50/50">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="s-def" className="cursor-pointer">Resposta definitiva</Label>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Se ligado (padrão), aparece uma confirmação antes de votar e os pontos
                    são creditados de imediato.<br />
                    Se desligado, o utilizador pode mudar de voto até à deadline — os pontos
                    só são atribuídos quando finalizares o inquérito (evita farming de pontos).
                  </p>
                </div>
                <Switch id="s-def" checked={isDefinitive} onCheckedChange={setIsDefinitive} />
              </div>

              <div className="flex items-start justify-between gap-4 p-3 border rounded-lg bg-slate-50/50">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="s-hide" className="cursor-pointer flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> Esconder recompensas
                  </Label>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Se ligado, os membros não veem que as opções dão XP/Ouro — mas os pontos
                    continuam a ser atribuídos normalmente. Útil para não influenciar o voto.
                  </p>
                </div>
                <Switch id="s-hide" checked={hideRewards} onCheckedChange={setHideRewards} />
              </div>

              <div className="flex items-start justify-between gap-4 p-3 border rounded-lg bg-slate-50/50">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="s-closed" className="cursor-pointer flex items-center gap-1">
                    <Play className="w-3 h-3" /> Abrir manualmente
                  </Label>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Se ligado, o inquérito fica escondido e sem aceitar votos até carregares em
                    "Abrir votação". Ideal para abrir ao vivo durante uma apresentação/embed.
                  </p>
                </div>
                <Switch id="s-closed" checked={startClosed} onCheckedChange={setStartClosed} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Opções</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addOption} className="gap-1 h-7">
                    <Plus className="w-3 h-3" /> Adicionar opção
                  </Button>
                </div>
                {options.map((o, i) => (
                  <div key={i} className="p-3 border rounded-lg bg-slate-50/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 w-6">#{i + 1}</span>
                      <Input
                        value={o.label}
                        onChange={e => updateOption(i, { label: e.target.value })}
                        placeholder="Texto da opção"
                        required
                      />
                      {options.length > 2 && (
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeOption(i)} className="h-8 w-8 text-gray-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-8">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-indigo-700 flex items-center gap-1"><Trophy className="w-3 h-3" /> XP por escolher</Label>
                        <Input type="number" min={0} value={o.xp_reward} onChange={e => updateOption(i, { xp_reward: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-yellow-700 flex items-center gap-1"><Coins className="w-3 h-3" /> Ouro por escolher</Label>
                        <Input type="number" min={0} value={o.gold_reward} onChange={e => updateOption(i, { gold_reward: Number(e.target.value) })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button type="submit" disabled={creating} className="bg-blue-800 hover:bg-blue-900 w-full">
                  {creating ? 'A criar...' : 'Criar Inquérito'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {surveys.length === 0 && (
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="py-10 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 italic">Nenhum inquérito criado ainda.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {surveys.map(s => {
          const deadlineDate = new Date(s.deadline)
          const notOpened = !s.opened_at || new Date(s.opened_at) > now
          const isOpen = deadlineDate > now && !notOpened
          const hiddenFromMembers = new Date(deadlineDate.getTime() + 3 * 24 * 60 * 60 * 1000) <= now
          const opts: any[] = (s.survey_options || []).slice().sort((a: any, b: any) => a.position - b.position)
          const responses: any[] = s.survey_responses || []
          const total = responses.length
          const counts = new Map<string, number>()
          for (const r of responses) counts.set(r.option_id, (counts.get(r.option_id) || 0) + 1)

          return (
            <Card key={s.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-blue-700" /> {s.question}
                    </CardTitle>
                    {s.description && (
                      <CardDescription className="mt-1">{s.description}</CardDescription>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {notOpened && deadlineDate > now ? (
                        <Badge className="bg-slate-200 text-slate-700 border-none">Por abrir (escondido)</Badge>
                      ) : isOpen ? (
                        <Badge className="bg-green-100 text-green-700 border-none">Aberto</Badge>
                      ) : hiddenFromMembers ? (
                        <Badge className="bg-gray-200 text-gray-700 border-none">Arquivado (só coordenadores)</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-none">Fechado — resultados visíveis</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        <CalendarClock className="w-3 h-3 mr-1" />
                        {deadlineDate.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        <Users className="w-3 h-3 mr-1" /> {total} resposta{total === 1 ? '' : 's'}
                      </Badge>
                      {s.show_results_live && (
                        <Badge className="bg-blue-100 text-blue-700 border-none text-[10px]">Resultados em tempo real</Badge>
                      )}
                      {s.is_definitive ? (
                        <Badge className="bg-purple-100 text-purple-700 border-none text-[10px]">
                          <Lock className="w-3 h-3 mr-1" /> Definitivo
                        </Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-700 border-none text-[10px]">
                          <RefreshCw className="w-3 h-3 mr-1" /> Pode mudar voto
                        </Badge>
                      )}
                      {!s.is_definitive && s.finalized_at && (
                        <Badge className="bg-green-100 text-green-700 border-none text-[10px]">
                          <Award className="w-3 h-3 mr-1" /> Pontos atribuídos
                        </Badge>
                      )}
                      {s.hide_rewards && (
                        <Badge className="bg-slate-100 text-slate-600 border-none text-[10px]">
                          <EyeOff className="w-3 h-3 mr-1" /> Recompensas escondidas
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Copiar link de embed (ecrã de resultados)"
                      className="h-8 w-8 text-gray-400 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => copyEmbedLink(s.id)}
                    >
                      <MonitorPlay className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {opts.map(o => {
                  const c = counts.get(o.id) || 0
                  const pct = total > 0 ? Math.round((c / total) * 100) : 0
                  return (
                    <div key={o.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="truncate font-medium">{o.label}</span>
                          {(o.xp_reward > 0 || o.gold_reward > 0) && (
                            <span className="flex items-center gap-1 text-[10px] shrink-0">
                              {o.xp_reward > 0 && (
                                <span className="text-indigo-600 font-bold flex items-center gap-0.5"><Trophy className="w-3 h-3" />{o.xp_reward}</span>
                              )}
                              {o.gold_reward > 0 && (
                                <span className="text-yellow-600 font-bold flex items-center gap-0.5"><Coins className="w-3 h-3" />{o.gold_reward}</span>
                              )}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-500 shrink-0">{c} ({pct}%)</span>
                      </div>
                      <Progress value={pct} className="h-2 bg-slate-100" indicatorColor="bg-blue-600" />
                    </div>
                  )
                })}

                {isOpen && (
                  <div className="pt-3 mt-3 border-t flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-600">
                      A votação está aberta. Podes fechá-la para esconder o inquérito (reabres quando quiseres).
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCloseVoting(s.id)}
                      disabled={opening === s.id}
                      className="gap-1 shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      <Lock className="w-3 h-3" />
                      {opening === s.id ? 'A fechar...' : 'Fechar votação'}
                    </Button>
                  </div>
                )}

                {notOpened && deadlineDate > now && (
                  <div className="pt-3 mt-3 border-t flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-600">
                      O inquérito está escondido dos membros. Abre a votação quando quiseres.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleOpenVoting(s.id)}
                      disabled={opening === s.id}
                      className="bg-green-700 hover:bg-green-800 gap-1 shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      {opening === s.id ? 'A abrir...' : 'Abrir votação'}
                    </Button>
                  </div>
                )}

                {!s.is_definitive && !isOpen && !notOpened && !s.finalized_at && (
                  <div className="pt-3 mt-3 border-t flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-600">
                      Inquérito fechado. Atribui os pontos aos respondentes para finalizar.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleFinalize(s.id)}
                      disabled={finalizing === s.id}
                      className="bg-blue-800 hover:bg-blue-900 gap-1 shrink-0"
                    >
                      <Award className="w-3 h-3" />
                      {finalizing === s.id ? 'A finalizar...' : 'Atribuir pontos'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
