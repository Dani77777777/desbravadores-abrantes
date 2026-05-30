'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ClipboardList, Trophy, Coins, CalendarClock, Users, CheckCircle2, Lock, RefreshCw } from 'lucide-react'

interface SurveysSectionProps {
  userId: string
  surveys: any[] // each: { id, question, description, deadline, survey_options[], survey_responses[] }
}

function timeLeft(deadline: Date, now: Date) {
  const ms = deadline.getTime() - now.getTime()
  if (ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days} dia${days === 1 ? '' : 's'}`
}

export function SurveysSection({ userId, surveys }: SurveysSectionProps) {
  const supabase = createClient()
  const router = useRouter()
  const [voting, setVoting] = useState<string | null>(null)
  const [pending, setPending] = useState<{ survey: any; option: any } | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const now = new Date()

  const visible = useMemo(() => {
    return (surveys || []).filter(s => {
      const dl = new Date(s.deadline)
      // visible to members: open OR within 3 days of deadline
      return new Date(dl.getTime() + 3 * 24 * 60 * 60 * 1000) > now
    })
  }, [surveys, now])

  if (visible.length === 0) return null

  const submitVote = async (survey: any, optionId: string) => {
    setVoting(survey.id)
    try {
      const existing = (survey.survey_responses || []).find((r: any) => r.user_id === userId)
      if (existing && !survey.is_definitive) {
        const { error } = await supabase
          .from('survey_responses')
          .update({ option_id: optionId })
          .eq('id', existing.id)
        if (error) throw error
        toast.success('Voto atualizado!')
      } else {
        const { error } = await supabase.from('survey_responses').insert({
          survey_id: survey.id,
          user_id: userId,
          option_id: optionId,
        })
        if (error) throw error
        toast.success('Resposta registada!')
      }
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao votar.')
    } finally {
      setVoting(null)
      setPending(null)
    }
  }

  const handleVote = (survey: any, option: any) => {
    if (survey.is_definitive) {
      setPending({ survey, option })
    } else {
      submitVote(survey, option.id)
    }
  }

  return (
    <div className="space-y-3 pt-2">
      <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-blue-700" /> Inquéritos
        <Badge className="bg-blue-700 text-white ml-1">{visible.length}</Badge>
      </h2>

      <div className="space-y-4">
        {visible.map(s => {
          const deadlineDate = new Date(s.deadline)
          const isOpen = deadlineDate > now
          const opts: any[] = (s.survey_options || []).slice().sort((a: any, b: any) => a.position - b.position)
          const responses: any[] = s.survey_responses || []
          const myResponse = responses.find(r => r.user_id === userId)
          const total = responses.length
          const counts = new Map<string, number>()
          for (const r of responses) counts.set(r.option_id, (counts.get(r.option_id) || 0) + 1)

          // Estados de render:
          // - canVote: utilizador pode clicar numa opção (ainda não votou OU pode mudar de voto)
          // - showPercentages: percentagens são visíveis (após deadline, já votou, ou ao vivo)
          const canVote = isOpen && (!myResponse || !s.is_definitive)
          const showPercentages = !isOpen || !!myResponse || !!s.show_results_live
          const tl = isOpen ? timeLeft(deadlineDate, now) : null

          return (
            <Card key={s.id} className="border border-blue-100 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{s.question}</CardTitle>
                    {s.description && (
                      <CardDescription className="mt-1 text-xs">{s.description}</CardDescription>
                    )}
                  </div>
                  {isOpen ? (
                    <Badge className="bg-green-100 text-green-700 border-none shrink-0">Aberto</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 border-none shrink-0">Resultados</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-gray-500">
                  {isOpen && tl && (
                    <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Fecha em {tl}</span>
                  )}
                  {!isOpen && (
                    <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Fechado a {deadlineDate.toLocaleDateString('pt-PT')}</span>
                  )}
                  {(!isOpen || s.show_results_live) && (
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {total} resposta{total === 1 ? '' : 's'}</span>
                  )}
                  {myResponse && (
                    <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" /> Já respondeste</span>
                  )}
                  {isOpen && (
                    s.is_definitive ? (
                      <span className="flex items-center gap-1 text-purple-700"><Lock className="w-3 h-3" /> Resposta definitiva</span>
                    ) : (
                      <span className="flex items-center gap-1 text-orange-700"><RefreshCw className="w-3 h-3" /> Podes mudar o voto</span>
                    )
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {opts.map(o => {
                  const c = counts.get(o.id) || 0
                  const pct = total > 0 ? Math.round((c / total) * 100) : 0
                  const isMine = myResponse?.option_id === o.id
                  const hasReward = o.xp_reward > 0 || o.gold_reward > 0

                  const labelEl = (
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      {isMine && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                      <span className={`truncate text-sm ${isMine ? 'font-bold text-blue-900' : 'font-medium'}`}>{o.label}</span>
                      {hasReward && canVote && (
                        <span className="flex items-center gap-1.5 text-[10px] shrink-0">
                          {o.xp_reward > 0 && (
                            <span className="text-indigo-600 font-bold flex items-center gap-0.5"><Trophy className="w-3 h-3" />+{o.xp_reward}</span>
                          )}
                          {o.gold_reward > 0 && (
                            <span className="text-yellow-600 font-bold flex items-center gap-0.5"><Coins className="w-3 h-3" />+{o.gold_reward}</span>
                          )}
                        </span>
                      )}
                    </span>
                  )

                  const headerRow = (
                    <div className="flex items-center justify-between gap-2">
                      {labelEl}
                      {showPercentages && (
                        <span className="text-xs text-gray-500 shrink-0">{c} ({pct}%)</span>
                      )}
                    </div>
                  )

                  const bar = showPercentages ? (
                    <Progress value={pct} className="h-2 bg-slate-100" indicatorColor={isMine ? 'bg-blue-700' : 'bg-blue-400'} />
                  ) : null

                  if (canVote) {
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={voting === s.id || isMine}
                        onClick={() => handleVote(s, o)}
                        className={`w-full text-left p-2.5 rounded-md border transition-colors space-y-1 disabled:cursor-default ${
                          isMine
                            ? 'bg-blue-50 border-blue-400'
                            : 'bg-white hover:bg-blue-50 hover:border-blue-300 disabled:opacity-60'
                        }`}
                      >
                        {headerRow}
                        {bar}
                      </button>
                    )
                  }

                  return (
                    <div key={o.id} className="space-y-1 p-2.5 rounded-md border bg-white">
                      {headerRow}
                      {bar}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) setPending(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-700" /> Confirmar resposta
            </DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-gray-600">Vais responder a:</p>
              <p className="font-bold">"{pending.survey.question}"</p>
              <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
                <p className="text-xs text-gray-500 mb-1">A tua escolha</p>
                <p className="font-medium text-blue-900">{pending.option.label}</p>
                {(pending.option.xp_reward > 0 || pending.option.gold_reward > 0) && (
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    {pending.option.xp_reward > 0 && (
                      <span className="text-indigo-600 font-bold flex items-center gap-1"><Trophy className="w-3 h-3" /> +{pending.option.xp_reward} XP</span>
                    )}
                    {pending.option.gold_reward > 0 && (
                      <span className="text-yellow-600 font-bold flex items-center gap-1"><Coins className="w-3 h-3" /> +{pending.option.gold_reward} Ouro</span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-2">
                <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                Esta resposta é definitiva — não poderás mudar depois de confirmar.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPending(null)} disabled={!!voting}>Cancelar</Button>
            <Button
              className="bg-blue-800 hover:bg-blue-900"
              onClick={() => pending && submitVote(pending.survey, pending.option.id)}
              disabled={!!voting}
            >
              {voting ? 'A enviar...' : 'Confirmar resposta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
