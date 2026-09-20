'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Trophy, Coins, CheckCircle2, XCircle, Clock, Save, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface EventAttendanceManagerProps {
  event: any
  members: any[]
  profile: any
  onComplete: () => void
}

export function EventAttendanceManager({ event, members, profile, onComplete }: EventAttendanceManagerProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [attendance, setAttendance] = useState<Record<string, 'presente' | 'atrasado' | 'faltou'>>({})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    async function fetchAttendance() {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('*')
        .eq('event_id', event.id)
      
      if (error) {
        toast.error('Erro ao carregar presenças.')
      } else {
        const initialMap: Record<string, any> = {}
        data?.forEach(record => {
          initialMap[record.user_id] = record.status
        })
        setAttendance(initialMap)
      }
      setLoading(false)
    }
    fetchAttendance()
  }, [event.id, supabase])

  const setStatus = (userId: string, status: 'presente' | 'atrasado' | 'faltou') => {
    setAttendance(prev => ({ ...prev, [userId]: status }))
    setHasChanges(true)
  }

  const toggleCheckIn = (userId: string) => {
    // If already present, do nothing or toggle back? Let's make it toggle to 'presente' if not already
    if (attendance[userId] !== 'presente') {
      setStatus(userId, 'presente')
    } else {
      setStatus(userId, 'faltou') // Optional: toggle to faltou for faster correction
    }
  }

  const handleSaveDraft = async () => {
    setSavingDraft(true)
    try {
      const attendanceToUpsert = Object.entries(attendance).map(([userId, status]) => ({
        event_id: event.id,
        user_id: userId,
        status,
        points_awarded: false
      }))

      if (attendanceToUpsert.length === 0) return

      const { error } = await supabase
        .from('event_attendance')
        .upsert(attendanceToUpsert, { onConflict: 'event_id,user_id' })
      
      if (error) throw error
      
      setHasChanges(false)
      toast.success('Progresso guardado!')
    } catch (e: any) {
      toast.error('Erro ao guardar rascunho.')
    } finally {
      setSavingDraft(false)
    }
  }

  const handleSaveAndFinalize = async () => {
    if (!confirm('Desejas finalizar este evento e atribuir os pontos agora? Esta ação não pode ser desfeita.')) return

    setSaving(true)
    try {
      // 1. Prepare and Save final attendance
      const attendanceToUpsert = members.map(m => ({
        event_id: event.id,
        user_id: m.id,
        status: attendance[m.id] || 'faltou', // Default to faltou if not marked
        points_awarded: true,
        awarded_at: new Date().toISOString()
      }))

      const { error: attError } = await supabase
        .from('event_attendance')
        .upsert(attendanceToUpsert, { onConflict: 'event_id,user_id' })
      
      if (attError) throw attError

      // 2. Award points
      const pointsLogs = []
      for (const member of members) {
        // Só o coordenador real pode receber pontos de si próprio; os outros a BD rejeitaria (o lote inteiro).
        if (member.id === profile.id && !(profile.role === 'coordenador' && !profile.helper_role)) continue
        const status = attendance[member.id] || 'faltou'
        let xp = 0
        let gold = 0
        let description = `Participação em: ${event.title}`

        if (status === 'presente') {
          xp = event.xp_reward
          gold = event.gold_reward
          description += ` (Presente)`
        } else if (status === 'atrasado') {
          xp = Math.floor(event.xp_reward * (1 - event.late_discount_percent))
          gold = Math.floor(event.gold_reward * (1 - event.late_discount_percent))
          description += ` (Atrasado - ${event.late_discount_percent * 100}% desc.)`
        } else if (status === 'faltou') {
          if (event.absent_penalty_percent > 0) {
            xp = -Math.floor(event.xp_reward * event.absent_penalty_percent)
            gold = -Math.floor(event.gold_reward * event.absent_penalty_percent)
            description += ` (Falta com penalidade de ${event.absent_penalty_percent * 100}%)`
          } else { continue }
        }

        pointsLogs.push({
          target_user_id: member.id,
          awarded_by_user_id: profile.id,
          amount_xp: xp,
          amount_gold: gold,
          description: description,
          event_id: event.id
        })
      }

      if (pointsLogs.length > 0) {
        const { error: logError } = await supabase.from('points_log').insert(pointsLogs)
        if (logError) throw logError
      }

      // 3. Mark event as finished
      const { error: eventError } = await supabase
        .from('events')
        .update({ is_finished: true })
        .eq('id', event.id)
      
      if (eventError) throw eventError

      toast.success('Evento finalizado com sucesso!')
      onComplete()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao finalizar evento.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
        <p className="text-sm text-gray-500">A carregar...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 p-4 rounded-xl flex flex-col sm:flex-row justify-between gap-4 border border-blue-100 shadow-sm">
        <div>
          <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Recompensas Base</p>
          <div className="flex gap-4 mt-1">
             <span className="flex items-center gap-1.5 text-indigo-700 font-black"><Trophy className="w-4 h-4" /> {event.xp_reward} XP</span>
             <span className="flex items-center gap-1.5 text-yellow-600 font-black"><Coins className="w-4 h-4" /> {event.gold_reward}</span>
          </div>
        </div>
        <div className="text-right text-[10px] text-blue-400 font-bold uppercase space-y-0.5">
           <p>Atraso: <span className="text-blue-700">-{event.late_discount_percent * 100}%</span></p>
           <p>Falta: <span className="text-blue-700">-{event.absent_penalty_percent * 100}%</span></p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
           <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Membros ({members.length})</h3>
           {hasChanges && (
             <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 bg-amber-50 animate-pulse">Alterações não guardadas</Badge>
           )}
        </div>
        
        <div className="border rounded-2xl overflow-hidden bg-white shadow-sm">
          {members.map((member) => {
            const currentStatus = attendance[member.id]
            return (
              <div 
                key={member.id} 
                className={`flex flex-col sm:flex-row items-center justify-between p-4 border-b last:border-0 hover:bg-slate-50 transition-all gap-4 group cursor-pointer ${currentStatus === 'presente' ? 'bg-green-50/30' : ''}`}
                onClick={(e) => {
                  if (event.is_finished || (e.target as HTMLElement).closest('button')) return
                  toggleCheckIn(member.id)
                }}
              >
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative">
                    <Avatar className="h-11 w-11 border-2 border-white shadow-sm">
                      <AvatarImage src={member.avatar_url} className="object-cover" />
                      <AvatarFallback className="bg-blue-700 text-white font-bold">{member.full_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    {currentStatus === 'presente' && (
                      <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 border-2 border-white shadow-sm">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-bold transition-colors ${currentStatus === 'presente' ? 'text-green-700' : 'text-gray-900'}`}>
                      {member.full_name}
                    </p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{member.section}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100/50 p-1 rounded-xl w-full sm:w-auto">
                  <Button 
                    size="sm" 
                    variant={currentStatus === 'presente' ? 'default' : 'ghost'}
                    className={`flex-1 sm:flex-none gap-1 text-[10px] h-9 px-3 rounded-lg transition-all ${currentStatus === 'presente' ? 'bg-green-600 hover:bg-green-700 shadow-sm' : 'text-gray-400 hover:text-green-600'}`}
                    onClick={() => !event.is_finished && setStatus(member.id, 'presente')}
                    disabled={event.is_finished && currentStatus !== 'presente'}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Presente
                  </Button>
                  <Button 
                    size="sm" 
                    variant={currentStatus === 'atrasado' ? 'default' : 'ghost'}
                    className={`flex-1 sm:flex-none gap-1 text-[10px] h-9 px-3 rounded-lg transition-all ${currentStatus === 'atrasado' ? 'bg-amber-500 hover:bg-amber-600 shadow-sm' : 'text-gray-400 hover:text-amber-500'}`}
                    onClick={() => !event.is_finished && setStatus(member.id, 'atrasado')}
                    disabled={event.is_finished && currentStatus !== 'atrasado'}
                  >
                    <Clock className="w-3.5 h-3.5" /> Atrasado
                  </Button>
                  <Button 
                    size="sm" 
                    variant={currentStatus === 'faltou' ? 'default' : 'ghost'}
                    className={`flex-1 sm:flex-none gap-1 text-[10px] h-9 px-3 rounded-lg transition-all ${currentStatus === 'faltou' ? 'bg-red-500 hover:bg-red-600 shadow-sm' : 'text-gray-400 hover:text-red-500'}`}
                    onClick={() => !event.is_finished && setStatus(member.id, 'faltou')}
                    disabled={event.is_finished && currentStatus !== 'faltou'}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Faltou
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!event.is_finished ? (
        <div className="flex flex-col gap-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline"
              className="py-6 text-sm font-bold gap-2 rounded-2xl border-2 border-slate-200 hover:bg-slate-50 transition-all text-slate-600"
              onClick={handleSaveDraft}
              disabled={savingDraft || saving || !hasChanges}
            >
              {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Rascunho
            </Button>
            <Button 
              className="bg-blue-800 hover:bg-blue-900 py-6 text-sm font-bold gap-2 rounded-2xl shadow-lg shadow-blue-200 transition-all"
              onClick={handleSaveAndFinalize}
              disabled={saving || savingDraft}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Finalizar Evento
            </Button>
          </div>
          <p className="text-[10px] text-center text-gray-400 font-medium px-4">
             * Podes salvar o rascunho a qualquer momento. Os pontos só serão atribuídos quando clicares em "Finalizar Evento".
          </p>
        </div>
      ) : (
        <div className="bg-green-50 p-4 border border-green-100 rounded-2xl flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <p className="text-xs font-bold text-green-700">Este evento foi finalizado e os pontos já foram atribuídos.</p>
        </div>
      )}
    </div>
  )
}
