'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Calendar as CalendarIcon, MapPin, Trophy, Coins, ChevronRight, Clock, Info, User } from 'lucide-react'
import Link from 'next/link'
import { CalendarUI } from './CalendarUI'

interface EventDashboardProps {
  events: any[]
  profile: any
}

export function EventDashboard({ events, profile }: EventDashboardProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [viewingEvent, setViewingEvent] = useState<any>(null)

  const filteredEvents = selectedDate 
    ? events.filter(e => new Date(e.start_at).toDateString() === selectedDate.toDateString())
    : events.filter(e => !e.is_finished && new Date(e.start_at) >= new Date()).slice(0, 3)

  const today = new Date()

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Calendar Side */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-700" /> Calendário de Atividades
            </h2>
          </div>
          <CalendarUI 
            events={events} 
            selectedDate={selectedDate} 
            onSelectDate={setSelectedDate} 
          />
        </div>

        {/* Events List Side */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              {selectedDate ? (
                <>
                  <Info className="w-5 h-5 text-blue-700" /> 
                  Eventos em {selectedDate.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}
                </>
              ) : (
                'Brevemente'
              )}
            </h2>
            {selectedDate && (
               <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs text-blue-600 hover:text-blue-700 h-7"
                onClick={() => setSelectedDate(null)}
               >
                 Limpar filtro
               </Button>
            )}
          </div>

          <div className="space-y-3">
            {filteredEvents.length === 0 ? (
              <Card className="border-dashed border-2 bg-transparent shadow-none">
                <CardContent className="py-10 text-center">
                  <p className="text-gray-500 text-sm">
                    {selectedDate 
                      ? 'Não há eventos planeados para este dia.' 
                      : 'Sem eventos marcados para breve.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredEvents.map((event) => {
                const startDate = new Date(event.start_at)
                const isToday = startDate.toDateString() === today.toDateString()
                
                return (
                  <Card 
                    key={event.id} 
                    className={`group hover:shadow-md transition-all border shadow-sm cursor-pointer overflow-hidden ${isToday ? 'ring-1 ring-blue-500 border-blue-200' : ''}`}
                    onClick={() => setViewingEvent(event)}
                  >
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                       <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                             <span className="text-xs font-bold uppercase">{startDate.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')}</span>
                             <span className="text-lg font-black leading-none">{startDate.getDate()}</span>
                          </div>
                          <div className="space-y-0.5">
                             <h3 className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors text-sm">
                               {event.title}
                             </h3>
                             <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
                                <span className="flex items-center gap-1 font-medium text-blue-600">
                                   <Clock className="w-3 h-3" />
                                   {startDate.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {event.location && (
                                   <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {event.location}
                                   </span>
                                )}
                             </div>
                          </div>
                       </div>
                       <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Event Details Dialog */}
      {viewingEvent && (
        <Dialog open={!!viewingEvent} onOpenChange={(open) => !open && setViewingEvent(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-700" />
                {viewingEvent.title}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 pt-1 font-medium text-blue-600">
                 <Clock className="w-4 h-4" />
                 {new Date(viewingEvent.start_at).toLocaleString('pt-PT', { 
                   weekday: 'long', 
                   day: '2-digit', 
                   month: 'long', 
                   hour: '2-digit', 
                   minute: '2-digit' 
                 })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {viewingEvent.description && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Descrição</h4>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {viewingEvent.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {viewingEvent.location && (
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Localização</h4>
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <MapPin className="w-4 h-4 text-red-500" />
                      {viewingEvent.location}
                    </div>
                  </div>
                )}
                <div className="space-y-1 text-right">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Público Alvo</h4>
                  <Badge variant="outline" className="mt-1 shadow-none">
                    {viewingEvent.target_section ? viewingEvent.target_section.toUpperCase() : 'TODOS'}
                  </Badge>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-xl space-y-3">
                 <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">Recompensas e Regras</h4>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-blue-100 shadow-sm">
                       <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                          <Trophy className="w-4 h-4" />
                       </div>
                       <div>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">XP</p>
                          <p className="text-lg font-black text-indigo-900 leading-none">+{viewingEvent.xp_reward}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-yellow-100 shadow-sm">
                       <div className="p-1.5 bg-yellow-100 text-yellow-700 rounded-lg">
                          <Coins className="w-4 h-4" />
                       </div>
                       <div>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">GOLD</p>
                          <p className="text-lg font-black text-yellow-900 leading-none">+{viewingEvent.gold_reward}</p>
                       </div>
                    </div>
                 </div>
                 
                 <div className="flex items-center justify-between text-xs text-blue-700 px-1 pt-1 opacity-75">
                    <span className="flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Atraso: -{viewingEvent.late_discount_percent * 100}%</span>
                    <span className="flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Falta: -{viewingEvent.absent_penalty_percent * 100}%</span>
                 </div>
              </div>
            </div>

            <DialogFooter className="sm:justify-start">
               <p className="text-[10px] text-gray-400 italic">
                 * Pontos atribuídos após finalização pelo instrutor.
               </p>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
