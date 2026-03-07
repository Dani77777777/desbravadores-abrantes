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
import { Plus, Trophy, Coins, Calendar, MapPin, Users, Trash2, CheckCircle2, ListChecks, History, Pencil } from 'lucide-react'
import { EventAttendanceManager } from './EventAttendanceManager'

interface EventPanelProps {
  profile: any
  members: any[]
  events: any[]
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

export function EventPanel({ profile, members, events }: EventPanelProps) {
  const supabase = createClient()
  const router = useRouter()

  // Create event form
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [targetSection, setTargetSection] = useState<string>(
    profile.role === 'dirigente' ? (profile.leadership_section || profile.section) : '__all__'
  )
  const [xpReward, setXpReward] = useState(50)
  const [goldReward, setGoldReward] = useState(10)
  const [lateDiscount, setLateDiscount] = useState(25)
  const [absentPenalty, setAbsentPenalty] = useState(0)
  const [creating, setCreating] = useState(false)

  // Reschedule state
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [reschedulingEvent, setReschedulingEvent] = useState<any>(null)
  const [newStartAt, setNewStartAt] = useState('')
  const [newEndAt, setNewEndAt] = useState('')
  const [rescheduling, setRescheduling] = useState(false)

  // Attendance Manager
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)

  // Edit event state
  const [editOpen, setEditOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<any>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editXpReward, setEditXpReward] = useState(50)
  const [editGoldReward, setEditGoldReward] = useState(10)
  const [updating, setUpdating] = useState(false)

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const { data: event, error } = await supabase.from('events').insert({
        title,
        description: description || null,
        location: location || null,
        start_at: new_date_with_time(startAt),
        end_at: new_date_with_time(endAt),
        target_section: targetSection === '__all__' ? null : targetSection,
        xp_reward: xpReward,
        gold_reward: goldReward,
        late_discount_percent: lateDiscount / 100,
        absent_penalty_percent: absentPenalty / 100,
        created_by: profile.id,
      }).select().single()

      if (error) throw error

      // Create announcement
      await supabase.from('announcements').insert({
        title: `Novo Evento: ${title} 📅`,
        message: `Novo evento marcado para ${new Date(startAt).toLocaleString('pt-PT')}. Recompensas: ${xpReward} XP e ${goldReward} Gold.`,
        author_id: profile.id,
        target_section: targetSection === '__all__' ? null : targetSection,
      })

      toast.success('Evento criado com sucesso!')
      setCreateOpen(false)
      resetForm()
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar evento.')
    } finally {
      setCreating(false)
    }
  }

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reschedulingEvent) return
    setRescheduling(true)
    try {
      const { error } = await supabase.from('events').update({
        start_at: new_date_with_time(newStartAt),
        end_at: new_date_with_time(newEndAt),
        updated_at: new Date().toISOString()
      }).eq('id', reschedulingEvent.id)

      if (error) throw error

      // Create announcement
      await supabase.from('announcements').insert({
        title: `Evento Reagendado: ${reschedulingEvent.title} 📅`,
        message: `O evento "${reschedulingEvent.title}" foi reagendado para ${new Date(newStartAt).toLocaleString('pt-PT')}. Por favor, verifica a nova data.`,
        author_id: profile.id,
        target_section: reschedulingEvent.target_section,
      })

      toast.success('Evento reagendado com sucesso!')
      setRescheduleOpen(false)
      setReschedulingEvent(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reagendar evento.')
    } finally {
      setRescheduling(false)
    }
  }

  const handleEditEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEvent) return
    setUpdating(true)
    try {
      const { error } = await supabase.from('events').update({
        description: editDescription || null,
        location: editLocation || null,
        xp_reward: editXpReward,
        gold_reward: editGoldReward,
        updated_at: new Date().toISOString()
      }).eq('id', editingEvent.id)

      if (error) throw error

      toast.success('Evento atualizado com sucesso!')
      setEditOpen(false)
      setEditingEvent(null)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar evento.')
    } finally {
      setUpdating(false)
    }
  }

  const handleCancelEvent = async (event: any) => {
    if (!confirm(`Tens a certeza que queres CANCELAR o evento "${event.title}"? Será enviado um comunicado de cancelamento.`)) return
    
    try {
      // 1. Send announcement first
      await supabase.from('announcements').insert({
        title: `Evento Cancelado: ${event.title} ❌`,
        message: `O evento "${event.title}" que estava marcado para ${new Date(event.start_at).toLocaleString('pt-PT')} foi cancelado.`,
        author_id: profile.id,
        target_section: event.target_section,
      })

      // 2. Delete event
      const { error } = await supabase.from('events').delete().eq('id', event.id)
      if (error) throw error

      toast.success('Evento cancelado e comunicado enviado.')
      router.refresh()
    } catch (e: any) {
      toast.error('Erro ao cancelar evento.')
    }
  }

  const new_date_with_time = (val: string) => {
    return new Date(val).toISOString()
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setLocation('')
    setStartAt('')
    setEndAt('')
    setXpReward(50)
    setGoldReward(10)
    setLateDiscount(25)
    setAbsentPenalty(0)
  }

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Tens a certeza que queres apagar este evento? (Sem aviso de cancelamento)')) return
    const { error } = await supabase.from('events').delete().eq('id', eventId)
    if (error) toast.error('Erro ao apagar evento.')
    else { toast.success('Evento apagado.'); router.refresh() }
  }

  const upcomingEvents = events.filter(e => !e.is_finished).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const pastEvents = events.filter(e => e.is_finished).sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Gestão de Eventos</h2>
          <p className="text-sm text-gray-500">
            Agenda reuniões, acampamentos e atividades para atribuir pontos.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-800 hover:bg-blue-900 gap-2 h-11 px-6 shadow-md shrink-0">
              <Plus className="w-4 h-4" /> Novo Evento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Evento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateEvent} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="event-title">Título *</Label>
                  <Input id="event-title" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Ex: Reunião de Sábado" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-location">Local</Label>
                  <Input id="event-location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ex: Sede do Agrupamento" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-desc">Descrição</Label>
                <Textarea id="event-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="O que vai acontecer?" rows={2} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="event-start">Início *</Label>
                  <Input id="event-start" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-end">Fim *</Label>
                  <Input id="event-end" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Público Alvo</Label>
                  <Select value={targetSection} onValueChange={setTargetSection} disabled={profile.role === 'dirigente'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {Object.entries(SECTION_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-indigo-600"><Trophy className="w-3 h-3" /> XP</Label>
                    <Input type="number" value={xpReward} onChange={e => setXpReward(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1 text-yellow-600"><Coins className="w-3 h-3" /> Ouro</Label>
                    <Input type="number" value={goldReward} onChange={e => setGoldReward(Number(e.target.value))} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500 uppercase font-bold">Desconto Atraso (%)</Label>
                  <Input type="number" min={0} max={100} value={lateDiscount} onChange={e => setLateDiscount(Number(e.target.value))} />
                  <p className="text-[10px] text-slate-400">Percentagem de pontos removida se chegar atrasado.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500 uppercase font-bold">Penalidade Falta (%)</Label>
                  <Input type="number" min={0} max={100} value={absentPenalty} onChange={e => setAbsentPenalty(Number(e.target.value))} />
                  <p className="text-[10px] text-slate-400">Percentagem da recompensa retirada em caso de falta.</p>
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" className="bg-blue-800 hover:bg-blue-900 w-full" disabled={creating}>
                  {creating ? 'A criar...' : 'Criar Evento'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-700" /> Próximos Eventos ({upcomingEvents.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {upcomingEvents.length === 0 && (
                <p className="text-center text-gray-500 py-10">Não há eventos marcados.</p>
              )}
              {upcomingEvents.map(event => (
                <div key={event.id} className="p-4 border rounded-xl hover:shadow-md transition-shadow bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900">{event.title}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {event.target_section ? SECTION_LABELS[event.target_section] : 'Todos'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(event.start_at).toLocaleString('pt-PT')}</span>
                      {event.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>}
                    </div>
                    <div className="flex gap-3 pt-1">
                       <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1"><Trophy className="w-3 h-3" /> {event.xp_reward} XP</span>
                       <span className="text-[10px] font-bold text-yellow-600 flex items-center gap-1"><Coins className="w-3 h-3" /> {event.gold_reward} Gold</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700 gap-1 text-xs"
                      onClick={() => { setSelectedEvent(event); setAttendanceOpen(true) }}
                    >
                      <ListChecks className="w-3 h-3" /> Presenças
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-blue-600 border-blue-200 hover:bg-blue-50 gap-1 text-xs"
                      onClick={() => {
                        setReschedulingEvent(event)
                        setNewStartAt(new Date(event.start_at).toISOString().slice(0, 16))
                        setNewEndAt(new Date(event.end_at).toISOString().slice(0, 16))
                        setRescheduleOpen(true)
                      }}
                    >
                      <Calendar className="w-3 h-3" /> Reagendar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-gray-400 hover:text-blue-600 shrink-0" 
                      title="Editar Evento"
                      onClick={() => {
                        setEditingEvent(event)
                        setEditDescription(event.description || '')
                        setEditLocation(event.location || '')
                        setEditXpReward(event.xp_reward)
                        setEditGoldReward(event.gold_reward)
                        setEditOpen(true)
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-gray-400 hover:text-orange-600 shrink-0" 
                      title="Cancelar Evento"
                      onClick={() => handleCancelEvent(event)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-gray-500">
                <History className="w-4 h-4" /> Histórico de Eventos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pastEvents.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhum evento passado.</p>}
              {pastEvents.map(event => (
                <div key={event.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 opacity-75">
                  <div>
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="text-[10px] text-gray-500">{new Date(event.start_at).toLocaleDateString('pt-PT')}</p>
                  </div>
                  <Badge className="bg-green-100 text-green-700 border-green-200">Concluído</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-700" /> Presença Rápida
              </CardTitle>
              <CardDescription>Membros sob a tua supervisão.</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="space-y-4">
                  {members.slice(0, 5).map(member => (
                    <div key={member.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                       <span className="text-sm truncate pr-2">{member.full_name}</span>
                       <Badge variant="outline" className={`${member.section === 'companheiros' ? 'bg-blue-50 text-blue-700' : ''} text-[10px]`}>
                          {SECTION_LABELS[member.section]}
                       </Badge>
                    </div>
                  ))}
               </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reagendar Evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReschedule} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Novo Horário de Início</Label>
              <Input type="datetime-local" value={newStartAt} onChange={e => setNewStartAt(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Novo Horário de Fim</Label>
              <Input type="datetime-local" value={newEndAt} onChange={e => setNewEndAt(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRescheduleOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-800 hover:bg-blue-900" disabled={rescheduling}>
                {rescheduling ? 'A guardar...' : 'Confirmar Reagendamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Evento: {editingEvent?.title}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditEvent} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-location">Local</Label>
              <Input 
                id="edit-location" 
                value={editLocation} 
                onChange={e => setEditLocation(e.target.value)} 
                placeholder="Ex: Sede do Agrupamento" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Descrição</Label>
              <Textarea 
                id="edit-desc" 
                value={editDescription} 
                onChange={e => setEditDescription(e.target.value)} 
                placeholder="O que vai acontecer?" 
                rows={3} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-indigo-600"><Trophy className="w-3 h-3" /> XP</Label>
                <Input type="number" value={editXpReward} onChange={e => setEditXpReward(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-yellow-600"><Coins className="w-3 h-3" /> Ouro</Label>
                <Input type="number" value={editGoldReward} onChange={e => setEditGoldReward(Number(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-800 hover:bg-blue-900" disabled={updating}>
                {updating ? 'A guardar...' : 'Guardar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedEvent && (
        <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Controlo de Presenças: {selectedEvent.title}</DialogTitle>
              {selectedEvent.target_section && (
                <p className="text-xs text-gray-500 pt-1">
                  A mostrar apenas membros da secção: <Badge variant="outline" className="ml-1 text-[10px]">{SECTION_LABELS[selectedEvent.target_section] || selectedEvent.target_section}</Badge>
                </p>
              )}
            </DialogHeader>
            <EventAttendanceManager 
               event={selectedEvent} 
               members={selectedEvent.target_section 
                 ? members.filter(m => m.section === selectedEvent.target_section)
                 : members
               } 
               profile={profile}
               onComplete={() => {
                 setAttendanceOpen(false)
                 setSelectedEvent(null)
                 router.refresh()
               }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
