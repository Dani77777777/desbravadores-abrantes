'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Plus, Trophy, Coins, CheckCircle2, Clock, Award, Trash2, CalendarClock, XCircle, Pencil, Copy, Search,
  ListChecks, Hourglass, Megaphone, Loader2, ChevronRight, CheckCheck,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { displayFont } from '@/components/landing/fonts'
import { SECTION_LABELS } from './event-utils'

const D = displayFont.className

interface TaskPanelProps {
  profile: any         // the logged-in user's profile
  tasks: any[]         // tasks visible to this user
  completions: any[]   // task_completions with joined profile + task data
  members?: any[]      // membros visíveis (para calcular o progresso de cada tarefa)
}

type Filter = 'active' | 'expired' | 'all'

/** Data de hoje (local) no formato do campo `deadline` (YYYY-MM-DD). */
function todayStr() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function deadlineInfo(deadline: string | null) {
  if (!deadline) return null
  const today = new Date(todayStr() + 'T00:00:00')
  const d = new Date(deadline + 'T00:00:00')
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return { label: 'Expirou', cls: 'bg-stone-200 text-stone-600', expired: true }
  if (days === 0) return { label: 'Termina hoje', cls: 'bg-rose-100 text-rose-600', expired: false }
  if (days === 1) return { label: 'Termina amanhã', cls: 'bg-rose-100 text-rose-600', expired: false }
  if (days <= 7) return { label: `Em ${days} dias`, cls: 'bg-amber-100 text-amber-700', expired: false }
  return { label: `Até ${d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}`, cls: 'bg-stone-100 text-stone-600', expired: false }
}

export function TaskPanel({ profile, tasks, completions, members = [] }: TaskPanelProps) {
  const supabase = createClient()
  const router = useRouter()
  const isCoordenador = profile.role === 'coordenador'
  const defaultTarget = profile.role === 'dirigente' ? (profile.leadership_section || profile.section) : '__all__'

  // Criar / editar / duplicar tarefa
  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null) // null = criar
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetSection, setTargetSection] = useState<string>(defaultTarget)
  const [xpReward, setXpReward] = useState(10)
  const [goldReward, setGoldReward] = useState(0)
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  // Comunicado opcional ao criar (desligado por defeito: as tarefas nunca enviavam comunicados)
  const [announce, setAnnounce] = useState(false)

  // Award points dialog
  const [awardOpen, setAwardOpen] = useState(false)
  const [selectedCompletion, setSelectedCompletion] = useState<any>(null)
  const [awarding, setAwarding] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRunning, setBulkRunning] = useState(false)

  // Lista
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')

  const resetForm = () => {
    setEditingTask(null)
    setTitle('')
    setDescription('')
    setTargetSection(defaultTarget)
    setXpReward(10)
    setGoldReward(0)
    setDeadline('')
    setAnnounce(false)
  }

  const openCreate = () => { resetForm(); setFormOpen(true) }

  const fillFrom = (task: any) => {
    setTitle(task.title || '')
    setDescription(task.description || '')
    setTargetSection(isCoordenador ? (task.target_section || '__all__') : defaultTarget)
    setXpReward(task.xp_reward ?? 0)
    setGoldReward(task.gold_reward ?? 0)
  }

  const openEdit = (task: any) => {
    resetForm()
    fillFrom(task)
    setDeadline(task.deadline || '')
    setEditingTask(task)
    setFormOpen(true)
  }

  const openDuplicate = (task: any) => {
    resetForm()
    fillFrom(task)
    setTitle(`${task.title} (cópia)`)
    setFormOpen(true)
  }

  const announcementText = () => {
    const parts = [`Nova tarefa: ${title}.`]
    if (description.trim()) parts.push(description.trim())
    const rewards = [xpReward > 0 && `${xpReward} XP`, goldReward > 0 && `${goldReward} Gold`].filter(Boolean).join(' e ')
    if (rewards) parts.push(`Recompensa: ${rewards}.`)
    if (deadline) parts.push(`Prazo: ${new Date(deadline + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}.`)
    parts.push('Marca-a como concluída no teu painel quando a terminares!')
    return parts.join('\n\n')
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const section = targetSection === '__all__' ? null : targetSection
    try {
      if (editingTask) {
        const { error } = await supabase.from('tasks').update({
          title,
          description: description || null,
          target_section: section,
          xp_reward: xpReward,
          gold_reward: goldReward,
          deadline: deadline || null,
        }).eq('id', editingTask.id)
        if (error) throw error
        toast.success('Tarefa atualizada!')
      } else {
        const { error } = await supabase.from('tasks').insert({
          title,
          description: description || null,
          created_by_user_id: profile.id,
          target_section: section,
          xp_reward: xpReward,
          gold_reward: goldReward,
          deadline: deadline || null,
        })
        if (error) throw error

        if (announce) {
          const { data, error: annError } = await supabase.rpc('send_announcement', {
            p_title: `Nova Tarefa: ${title} ✅`,
            p_message: announcementText(),
            p_audience: section ? 'section' : 'global',
            p_section: section,
            p_member_ids: null,
          })
          if (annError) toast.warning(`Tarefa criada, mas o comunicado não foi enviado: ${annError.message}`)
          else {
            const n = (data as { recipients: number } | null)?.recipients ?? 0
            toast.success(`Tarefa criada e comunicado enviado a ${n} ${n === 1 ? 'pessoa' : 'pessoas'}!`)
          }
        } else {
          toast.success('Tarefa criada com sucesso!')
        }
      }
      setFormOpen(false)
      resetForm()
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao guardar tarefa.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Tens a certeza que queres apagar esta tarefa?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) toast.error('Erro ao apagar tarefa.')
    else { toast.success('Tarefa apagada.'); router.refresh() }
  }

  /** Dá os pontos de uma conclusão: primeiro o registo de pontos, depois marca a conclusão. */
  const awardCompletion = async (c: any) => {
    if (c.user_id === profile.id && !(profile.role === 'coordenador' && !profile.helper_role)) {
      throw new Error('Não podes atribuir pontos a ti próprio.')
    }

    // 1. Insert into points_log (primeiro: se a BD recusar, a conclusão não fica marcada)
    const { error: logError } = await supabase.from('points_log').insert({
      target_user_id: c.user_id,
      awarded_by_user_id: profile.id,
      amount_xp: c.tasks.xp_reward,
      amount_gold: c.tasks.gold_reward,
      description: `Tarefa concluída: ${c.tasks.title}`,
    })
    if (logError) throw logError

    // 2. Mark completion as awarded
    const { error: compError } = await supabase
      .from('task_completions')
      .update({ points_awarded: true, awarded_by_user_id: profile.id })
      .eq('id', c.id)
    if (compError) throw compError
  }

  const handleAwardPoints = async () => {
    if (!selectedCompletion) return
    setAwarding(true)
    try {
      await awardCompletion(selectedCompletion)
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

  const handleAwardAll = async () => {
    setBulkRunning(true)
    let ok = 0
    const failed: string[] = []
    // Um a um, pela mesma ordem de operações da aprovação individual
    for (const c of pendingCompletions) {
      try {
        await awardCompletion(c)
        ok++
      } catch (e: any) {
        failed.push(`${c.profiles?.full_name}: ${e.message || 'erro'}`)
      }
    }
    setBulkRunning(false)
    setBulkOpen(false)
    if (ok) toast.success(`Pontos atribuídos em ${ok} ${ok === 1 ? 'conclusão' : 'conclusões'}!`)
    if (failed.length) toast.error(`${failed.length} não ${failed.length === 1 ? 'foi atribuída' : 'foram atribuídas'}: ${failed.join(' · ')}`, { duration: 10000 })
    router.refresh()
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
    } catch {
      toast.error('Erro ao rejeitar conclusão.')
    }
  }

  // ── Dados ──────────────────────────────────────────────────────────────────
  const pendingCompletions = completions.filter(c => !c.points_awarded)
  const awardedCompletions = completions.filter(c => c.points_awarded)
  const isExpired = (t: any) => !!t.deadline && t.deadline < todayStr()
  const activeTasks = tasks.filter(t => !isExpired(t))
  const expiredTasks = tasks.filter(isExpired)
  const xpGiven = awardedCompletions.reduce((a, c) => a + (c.tasks?.xp_reward || 0), 0)

  const scouts = members.filter(m => m.role === 'desbravador')
  const audienceSize = (t: any) => (t.target_section ? scouts.filter(m => m.section === t.target_section).length : scouts.length)

  const q = search.trim().toLowerCase()
  const listed = (filter === 'active' ? activeTasks : filter === 'expired' ? expiredTasks : tasks)
    .filter(t => !q || t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))

  const summary = [
    { icon: ListChecks, label: 'Ativas', value: activeTasks.length, tone: 'bg-blue-600' },
    { icon: Clock, label: 'Por aprovar', value: pendingCompletions.length, tone: pendingCompletions.length ? 'bg-amber-500' : 'bg-stone-300' },
    { icon: Hourglass, label: 'Expiradas', value: expiredTasks.length, tone: 'bg-stone-400' },
    { icon: Trophy, label: 'XP atribuído', value: xpGiven.toLocaleString('pt-PT'), tone: 'bg-indigo-500' },
  ]

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'active', label: 'Ativas', count: activeTasks.length },
    { key: 'expired', label: 'Expiradas', count: expiredTasks.length },
    { key: 'all', label: 'Todas', count: tasks.length },
  ]

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho ──────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className={`${D} text-3xl font-extrabold tracking-tight text-blue-950`}>Tarefas</h2>
          <p className="text-sm text-stone-500">
            {isCoordenador
              ? 'Podes criar tarefas para qualquer secção ou para todos.'
              : `Podes criar tarefas apenas para os teus Desbravadores (${SECTION_LABELS[profile.leadership_section || profile.section] || profile.section}).`}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-6 font-extrabold text-blue-950 shadow-[0_12px_28px_-12px_rgba(250,204,21,.8)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300"
        >
          <Plus className="h-4 w-4" /> Nova Tarefa
        </button>
      </div>

      {/* ── Resumo ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map(s => (
          <div key={s.label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className={`${D} text-2xl font-extrabold leading-none text-blue-950`}>{s.value}</p>
              <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-stone-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── A aguardar aprovação ───────────────────────────────── */}
      {pendingCompletions.length > 0 && (
        <section className="rounded-[1.75rem] bg-amber-50 p-5 ring-1 ring-inset ring-amber-200 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md">
                <Clock className="h-5 w-5" />
              </span>
              <div>
                <h3 className={`${D} text-xl font-extrabold text-blue-950`}>A aguardar aprovação ({pendingCompletions.length})</h3>
                <p className="text-xs text-stone-600">Desbravadores que completaram tarefas mas ainda não receberam os pontos.</p>
              </div>
            </div>
            {pendingCompletions.length > 1 && (
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-blue-950 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-900"
              >
                <CheckCheck className="h-4 w-4" /> Aprovar todas
              </button>
            )}
          </div>

          <ul className="mt-4 space-y-2">
            {pendingCompletions.map(c => (
              <li key={c.id} className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-sm sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={c.profiles?.avatar_url} className="object-cover" />
                    <AvatarFallback className="bg-blue-700 text-xs text-white">{c.profiles?.full_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-blue-950">{c.profiles?.full_name}</p>
                    <p className="truncate text-xs text-stone-500">{c.tasks?.title} · {new Date(c.completed_at).toLocaleDateString('pt-PT')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pl-13 sm:justify-end sm:pl-0">
                  <div className="flex gap-1.5">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-extrabold text-indigo-600">+{c.tasks?.xp_reward} XP</span>
                    <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-600">+{c.tasks?.gold_reward} Gold</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      className="gap-1 rounded-xl bg-blue-950 font-bold hover:bg-blue-900"
                      onClick={() => { setSelectedCompletion(c); setAwardOpen(true) }}
                    >
                      <Award className="h-3.5 w-3.5" /> Dar Pontos
                    </Button>
                    <button
                      type="button"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      onClick={() => handleRejectCompletion(c.id)}
                      title="Rejeitar conclusão"
                      aria-label="Rejeitar conclusão"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Lista de tarefas ───────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-stone-200 sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto">
          {filters.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                filter === f.key ? 'bg-blue-950 text-white' : 'text-stone-500 hover:bg-stone-100'
              }`}
            >
              {f.label}
              {f.count > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-extrabold ${filter === f.key ? 'bg-white/20' : 'bg-stone-100 text-stone-500'}`}>{f.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Procurar tarefas..." className="h-10 rounded-xl border-stone-200 bg-stone-50 pl-9" />
        </div>
      </div>

      {listed.length === 0 ? (
        <div className="rounded-[1.75rem] border-2 border-dashed border-stone-200 bg-white py-14 text-center">
          <ListChecks className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-bold text-blue-950">
            {q ? 'Nenhuma tarefa encontrada.' : filter === 'expired' ? 'Nenhuma tarefa expirada.' : filter === 'active' ? 'Não há tarefas ativas.' : 'Nenhuma tarefa criada ainda.'}
          </p>
          {!q && filter !== 'expired' && (
            <button type="button" onClick={openCreate} className="mt-2 cursor-pointer text-sm font-bold text-blue-700 hover:underline">Criar a primeira tarefa</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {listed.map(task => {
            const taskCompletions = completions.filter(c => c.task_id === task.id)
            const doneCount = taskCompletions.filter(c => c.points_awarded).length
            const pendingCount = taskCompletions.length - doneCount
            const size = audienceSize(task)
            const pct = size ? Math.min(100, Math.round((taskCompletions.length / size) * 100)) : 0
            const canManage = task.created_by_user_id === profile.id || isCoordenador
            const dl = deadlineInfo(task.deadline)
            return (
              <article key={task.id} className={`flex flex-col rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 transition-shadow hover:shadow-md ${dl?.expired ? 'ring-stone-200 opacity-80' : 'ring-stone-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="break-words text-lg font-extrabold leading-tight text-blue-950">{task.title}</h3>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-stone-600">
                        {task.target_section ? SECTION_LABELS[task.target_section] || task.target_section : 'Todos'}
                      </span>
                      {dl && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${dl.cls}`}>
                          <CalendarClock className="h-3 w-3" /> {dl.label}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-extrabold text-indigo-600"><Trophy className="h-3 w-3" /> {task.xp_reward} XP</span>
                      {task.gold_reward > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-600"><Coins className="h-3 w-3" /> {task.gold_reward} Gold</span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-0.5">
                      <IconAction title="Editar tarefa" onClick={() => openEdit(task)}><Pencil className="h-4 w-4" /></IconAction>
                      <IconAction title="Duplicar tarefa" onClick={() => openDuplicate(task)}><Copy className="h-4 w-4" /></IconAction>
                      <IconAction title="Apagar tarefa" danger onClick={() => handleDeleteTask(task.id)}><Trash2 className="h-4 w-4" /></IconAction>
                    </div>
                  )}
                </div>

                {task.description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-stone-500">{task.description}</p>}

                <div className="mt-auto pt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-950">
                      {taskCompletions.length} de {size} {size === 1 ? 'desbravador concluiu' : 'desbravadores concluíram'}
                    </span>
                    <span className="font-extrabold text-emerald-600">{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pct}%` }} />
                  </div>
                  {taskCompletions.length > 0 && (
                    <details className="group mt-3">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900">
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                        Ver quem concluiu ({doneCount} {doneCount === 1 ? 'aprovada' : 'aprovadas'}{pendingCount ? `, ${pendingCount} por aprovar` : ''})
                      </summary>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {taskCompletions.map(c => (
                          <li
                            key={c.id}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${c.points_awarded ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                          >
                            {c.points_awarded ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {c.profiles?.full_name}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* ── Pontos já atribuídos ───────────────────────────────── */}
      {awardedCompletions.length > 0 && (
        <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
          <h3 className={`${D} flex items-center gap-2 text-lg font-extrabold text-blue-950`}>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Pontos já atribuídos
          </h3>
          <ul className="mt-4 divide-y divide-stone-100">
            {awardedCompletions.slice(0, 10).map(c => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-bold text-blue-950">{c.profiles?.full_name}</p>
                  <p className="truncate text-xs text-stone-400">{c.tasks?.title}{c.completed_at ? ` · ${new Date(c.completed_at).toLocaleDateString('pt-PT')}` : ''}</p>
                </div>
                <div className="flex shrink-0 gap-1.5 text-xs">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-extrabold text-indigo-600">+{c.tasks?.xp_reward} XP</span>
                  <span className="rounded-full bg-yellow-50 px-2 py-0.5 font-extrabold text-amber-600">+{c.tasks?.gold_reward} Gold</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Diálogo criar / editar / duplicar ──────────────────── */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!saving) setFormOpen(v) }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.75rem] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={`${D} text-2xl font-extrabold text-blue-950`}>{editingTask ? 'Editar Tarefa' : 'Criar Nova Tarefa'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTask} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="task-title">Título *</Label>
              <Input id="task-title" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Ex: Aprender os valores dos Desbravadores" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-desc">Descrição</Label>
              <Textarea id="task-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Instruções detalhadas..." rows={3} />
            </div>

            {/* Only coordinators can choose section */}
            {isCoordenador && (
              <div className="space-y-2">
                <Label>Para quem?</Label>
                <Select value={targetSection} onValueChange={setTargetSection}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label htmlFor="task-xp" className="flex items-center gap-1 text-indigo-600"><Trophy className="h-3 w-3" /> XP</Label>
                <Input id="task-xp" type="number" min={0} value={xpReward} onChange={e => setXpReward(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-gold" className="flex items-center gap-1 text-yellow-600"><Coins className="h-3 w-3" /> Ouro</Label>
                <Input id="task-gold" type="number" min={0} value={goldReward} onChange={e => setGoldReward(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-deadline" className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Prazo (opcional)</Label>
              <Input id="task-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>

            {!editingTask && (
              <label className={`flex cursor-pointer items-start justify-between gap-3 rounded-2xl p-3.5 ring-1 ring-inset transition-colors ${announce ? 'bg-yellow-50 ring-yellow-300' : 'bg-stone-50 ring-stone-200'}`}>
                <span className="flex items-start gap-2.5">
                  <Megaphone className={`mt-0.5 h-4 w-4 shrink-0 ${announce ? 'text-amber-600' : 'text-stone-400'}`} />
                  <span>
                    <span className="block text-sm font-bold text-blue-950">Enviar comunicado sobre a tarefa</span>
                    <span className="block text-xs text-stone-500">
                      {announce
                        ? `Vai para ${targetSection === '__all__' ? 'todo o clube' : `a classe ${SECTION_LABELS[targetSection]}`}, com o título, as recompensas e o prazo.`
                        : 'A tarefa aparece no painel dos membros sem aviso.'}
                    </span>
                  </span>
                </span>
                <Switch checked={announce} onCheckedChange={setAnnounce} aria-label="Enviar comunicado sobre a tarefa" />
              </label>
            )}

            <DialogFooter>
              <button
                type="submit"
                disabled={saving}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-950 py-3.5 font-extrabold text-white transition-colors hover:bg-blue-900 disabled:opacity-60"
              >
                {saving ? <><Loader2 className="h-5 w-5 animate-spin" /> A guardar...</> : editingTask ? 'Guardar Alterações' : announce ? <><Megaphone className="h-4 w-4" /> Criar Tarefa e Avisar</> : 'Criar Tarefa'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Confirmar pontos (individual) ──────────────────────── */}
      <Dialog open={awardOpen} onOpenChange={(v) => { if (!awarding) { setAwardOpen(v); if (!v) setSelectedCompletion(null) } }}>
        <DialogContent className="rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle className={`${D} text-2xl font-extrabold text-blue-950`}>Confirmar pontos</DialogTitle>
            <DialogDescription>
              Vais atribuir pontos a <strong>{selectedCompletion?.profiles?.full_name}</strong> pela conclusão de &quot;{selectedCompletion?.tasks?.title}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 rounded-2xl bg-stone-50 p-4">
            <span className="flex items-center gap-1 font-extrabold text-indigo-700"><Trophy className="h-4 w-4" /> {selectedCompletion?.tasks?.xp_reward} XP</span>
            <span className="flex items-center gap-1 font-extrabold text-amber-600"><Coins className="h-4 w-4" /> {selectedCompletion?.tasks?.gold_reward} Ouro</span>
          </div>
          <DialogFooter>
            <Button onClick={handleAwardPoints} disabled={awarding} className="w-full bg-blue-950 hover:bg-blue-900">
              {awarding ? 'A atribuir...' : 'Confirmar e Dar Pontos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Aprovar todas ──────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={(v) => { if (!bulkRunning) setBulkOpen(v) }}>
        <DialogContent className="rounded-[1.75rem]">
          <DialogHeader>
            <DialogTitle className={`${D} text-2xl font-extrabold text-blue-950`}>Aprovar todas?</DialogTitle>
            <DialogDescription>
              Vais dar os pontos de <b>{pendingCompletions.length}</b> conclusões de uma vez:
              {' '}{pendingCompletions.reduce((a, c) => a + (c.tasks?.xp_reward || 0), 0)} XP e {pendingCompletions.reduce((a, c) => a + (c.tasks?.gold_reward || 0), 0)} Gold no total.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-stone-50 p-3 text-sm">
            {pendingCompletions.map(c => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="truncate"><b className="text-blue-950">{c.profiles?.full_name}</b> <span className="text-stone-400">· {c.tasks?.title}</span></span>
                <span className="shrink-0 text-xs font-bold text-indigo-600">+{c.tasks?.xp_reward} XP</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkRunning}>Voltar</Button>
            <Button onClick={handleAwardAll} disabled={bulkRunning} className="bg-blue-950 hover:bg-blue-900">
              {bulkRunning ? <><Loader2 className="h-4 w-4 animate-spin" /> A atribuir...</> : <><CheckCheck className="h-4 w-4" /> Aprovar todas</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function IconAction({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors ${danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-blue-50 hover:text-blue-700'}`}
    >
      {children}
    </button>
  )
}
