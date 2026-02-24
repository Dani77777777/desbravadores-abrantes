'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Plus, Trophy, Coins, CheckCircle2, Clock, Award, Trash2, CalendarClock, XCircle } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface TaskPanelProps {
  profile: any         // the logged-in user's profile
  tasks: any[]         // tasks visible to this user
  completions: any[]   // task_completions with joined profile + task data
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

export function TaskPanel({ profile, tasks, completions }: TaskPanelProps) {
  const supabase = createClient()
  const router = useRouter()

  // Create task form
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetSection, setTargetSection] = useState<string>(
    profile.role === 'dirigente' ? (profile.leadership_section || profile.section) : '__all__'
  )
  const [xpReward, setXpReward] = useState(10)
  const [goldReward, setGoldReward] = useState(0)
  const [deadline, setDeadline] = useState('')
  const [creating, setCreating] = useState(false)

  // Award points dialog
  const [awardOpen, setAwardOpen] = useState(false)
  const [selectedCompletion, setSelectedCompletion] = useState<any>(null)
  const [awarding, setAwarding] = useState(false)

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const { error } = await supabase.from('tasks').insert({
        title,
        description: description || null,
        created_by_user_id: profile.id,
        target_section: targetSection === '__all__' ? null : targetSection,
        xp_reward: xpReward,
        gold_reward: goldReward,
        deadline: deadline || null,
      })
      if (error) throw error
      toast.success('Tarefa criada com sucesso!')
      setCreateOpen(false)
      setTitle('')
      setDescription('')
      setXpReward(10)
      setGoldReward(0)
      setDeadline('')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar tarefa.')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Tens a certeza que queres apagar esta tarefa?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) toast.error('Erro ao apagar tarefa.')
    else { toast.success('Tarefa apagada.'); router.refresh() }
  }

  const handleAwardPoints = async () => {
    if (!selectedCompletion) return
    setAwarding(true)
    try {
      // 1. Mark completion as awarded
      const { error: compError } = await supabase
        .from('task_completions')
        .update({ points_awarded: true, awarded_by_user_id: profile.id })
        .eq('id', selectedCompletion.id)
      if (compError) throw compError

      // 2. Insert into points_log
      const { error: logError } = await supabase.from('points_log').insert({
        target_user_id: selectedCompletion.user_id,
        awarded_by_user_id: profile.id,
        amount_xp: selectedCompletion.tasks.xp_reward,
        amount_gold: selectedCompletion.tasks.gold_reward,
        description: `Tarefa concluída: ${selectedCompletion.tasks.title}`,
      })
      if (logError) throw logError

      toast.success(`Pontos atribuídos a ${selectedCompletion.profiles.full_name}!`)
      setAwardOpen(false)
      setSelectedCompletion(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atribuir pontos.')
    } finally {
      setAwarding(false)
    }
  }

  const handleRejectCompletion = async (completionId: string) => {
    if (!confirm('Rejeitar esta conclusão? O desbravador poderá tentar novamente.')) return
    try {
      const { error } = await supabase
        .from('task_completions')
        .delete()
        .eq('id', completionId)
      
      if (error) throw error
      toast.success('Conclusão rejeitada.')
      router.refresh()
    } catch (e: any) {
      toast.error('Erro ao rejeitar conclusão.')
    }
  }

  const pendingCompletions = completions.filter(c => !c.points_awarded)
  const awardedCompletions = completions.filter(c => c.points_awarded)

  return (
    <div className="space-y-6">

      {/* Header + Create button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            {profile.role === 'coordenador'
              ? 'Podes criar tarefas para qualquer secção ou para todos.'
              : `Podes criar tarefas apenas para os teus Desbravadores (${SECTION_LABELS[profile.leadership_section || profile.section] || profile.section}).`}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-800 hover:bg-blue-900 gap-2 h-11 px-6 shadow-md shrink-0">
              <Plus className="w-4 h-4" /> Nova Tarefa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Nova Tarefa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="task-title">Título *</Label>
                <Input id="task-title" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Ex: Aprender os valores dos Desbravadores" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-desc">Descrição</Label>
                <Textarea id="task-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Instruções detalhadas..." rows={3} />
              </div>

              {/* Only coordinators can choose section */}
              {profile.role === 'coordenador' && (
                <div className="space-y-2">
                  <Label>Para quem?</Label>
                  <Select value={targetSection} onValueChange={setTargetSection}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos os Desbravadores</SelectItem>
                      {Object.entries(SECTION_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="task-xp" className="flex items-center gap-1"><Trophy className="w-3 h-3" /> XP</Label>
                  <Input id="task-xp" type="number" min={0} value={xpReward} onChange={e => setXpReward(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-gold" className="flex items-center gap-1"><Coins className="w-3 h-3" /> Ouro</Label>
                  <Input id="task-gold" type="number" min={0} value={goldReward} onChange={e => setGoldReward(Number(e.target.value))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-deadline" className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Prazo (opcional)</Label>
                <Input id="task-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
              </div>

              <DialogFooter>
                <Button type="submit" className="bg-blue-800 hover:bg-blue-900 w-full" disabled={creating}>
                  {creating ? 'A criar...' : 'Criar Tarefa'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending awards — completions not yet rewarded */}
      {pendingCompletions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <Clock className="w-4 h-4" /> A Aguardar Aprovação ({pendingCompletions.length})
            </CardTitle>
            <CardDescription>Desbravadores que completaram tarefas mas ainda não receberam os pontos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingCompletions.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={c.profiles?.avatar_url} className="object-cover" />
                    <AvatarFallback className="bg-blue-700 text-white text-xs">{c.profiles?.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{c.profiles?.full_name}</p>
                    <p className="text-xs text-gray-500">{c.tasks?.title} • {new Date(c.completed_at).toLocaleDateString('pt-PT')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-600 font-medium">+{c.tasks?.xp_reward} XP</span>
                  <span className="text-xs text-yellow-600 font-medium">+{c.tasks?.gold_reward} 🪙</span>
                  <Dialog open={awardOpen && selectedCompletion?.id === c.id} onOpenChange={open => { setAwardOpen(open); if (open) setSelectedCompletion(c) }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-blue-800 hover:bg-blue-900 gap-1">
                        <Award className="w-3 h-3" /> Dar Pontos
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Confirmar Atribuição de Pontos</DialogTitle></DialogHeader>
                      <div className="py-4 space-y-3">
                        <p className="text-sm text-gray-600">Vais atribuir pontos a <strong>{c.profiles?.full_name}</strong> pela conclusão de:</p>
                        <p className="font-medium">"{c.tasks?.title}"</p>
                        <div className="flex gap-4 p-3 bg-slate-50 rounded-lg">
                          <span className="flex items-center gap-1 text-indigo-700 font-bold"><Trophy className="w-4 h-4" /> {c.tasks?.xp_reward} XP</span>
                          <span className="flex items-center gap-1 text-yellow-600 font-bold"><Coins className="w-4 h-4" /> {c.tasks?.gold_reward} Ouro</span>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleAwardPoints} disabled={awarding} className="bg-blue-800 hover:bg-blue-900 w-full">
                          {awarding ? 'A atribuir...' : 'Confirmar e Dar Pontos'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleRejectCompletion(c.id)}
                    title="Rejeitar conclusão"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tarefas Criadas ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.length === 0 && (
            <p className="text-center text-gray-500 py-6">Nenhuma tarefa criada ainda.</p>
          )}
          {tasks.map(task => {
            const taskCompletions = completions.filter(c => c.task_id === task.id)
            const canDelete = task.created_by_user_id === profile.id || profile.role === 'coordenador'
            return (
              <div key={task.id} className="p-4 border rounded-xl hover:shadow-sm transition-all bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900 truncate">{task.title}</h3>
                      <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-none font-bold">
                        {task.target_section ? SECTION_LABELS[task.target_section] || task.target_section : 'Todos'}
                      </Badge>
                    </div>
                    {task.description && <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{task.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-slate-50">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md">
                          <Trophy className="w-3 h-3" /> {task.xp_reward} XP
                        </span>
                        <span className="text-[10px] font-black text-yellow-700 flex items-center gap-1 bg-yellow-50 px-2 py-0.5 rounded-md">
                          <Coins className="w-3 h-3" /> {task.gold_reward}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                        {task.deadline && (
                          <span className="flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" /> 
                            {new Date(task.deadline).toLocaleDateString('pt-PT')}
                          </span>
                        )}
                        <span className={`flex items-center gap-1 ${taskCompletions.length > 0 ? 'text-green-600' : ''}`}>
                          <CheckCircle2 className="w-3 h-3" /> 
                          {taskCompletions.filter(c => c.points_awarded).length}/{taskCompletions.length} concluídas
                        </span>
                      </div>
                    </div>
                  </div>
                  {canDelete && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteTask(task.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Recently awarded */}
      {awardedCompletions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-4 h-4" /> Pontos Já Atribuídos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {awardedCompletions.slice(0, 10).map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg text-sm text-gray-600">
                <span>{c.profiles?.full_name} — {c.tasks?.title}</span>
                <div className="flex gap-2 text-xs">
                  <span className="text-indigo-600">+{c.tasks?.xp_reward} XP</span>
                  <span className="text-yellow-600">+{c.tasks?.gold_reward} 🪙</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
