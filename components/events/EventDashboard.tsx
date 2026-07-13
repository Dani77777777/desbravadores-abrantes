'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Calendar as CalendarIcon, MapPin, Trophy, Coins, ChevronRight, Clock, Info, User, Share2, ExternalLink, AlarmClock } from 'lucide-react'
import Link from 'next/link'
import { CalendarUI } from './CalendarUI'
import { CodeEntryDialog } from '@/components/dashboard/CodeEntryDialog'
import { SurveysSection } from '@/components/dashboard/SurveysSection'
import { EventShareDialog } from './EventShareDialog'
import { SECTION_LABELS } from '@/utils/permissions'

interface EventDashboardProps {
  events: any[]
  profile: any
  surveys?: any[]
  userId?: string
}

export function EventDashboard({ events, profile, surveys, userId }: EventDashboardProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [viewingEvent, setViewingEvent] = useState<any>(null)
  const [sharingEvent, setSharingEvent] = useState<any>(null)

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
          <CodeEntryDialog />
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
                const isJA = event.source === 'ja'

                return (
                  <Card
                    key={event.id}
                    className={`group hover:shadow-md transition-all border shadow-sm cursor-pointer overflow-hidden ${isToday ? 'ring-1 ring-blue-500 border-blue-200' : ''}`}
                    onClick={() => setViewingEvent(event)}
                  >
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-blue-600 text-white' : isJA ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          <span className="text-xs font-bold uppercase">{startDate.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')}</span>
                          <span className="text-lg font-black leading-none">{startDate.getDate()}</span>
                        </div>
                        <div className="space-y-0.5">
                          <h3 className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors text-sm flex items-center gap-2 flex-wrap">
                            {event.title}
                            {isJA && (
                              <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 border-none text-[9px] px-1.5 py-0 h-4 font-black uppercase tracking-wide">
                                JA · {event.type}
                              </Badge>
                            )}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
                            {isJA ? (
                              event.deadline_text && (
                                <span className="flex items-center gap-1 font-medium text-amber-700">
                                  <AlarmClock className="w-3 h-3" />
                                  Inscrições até {event.deadline_text}
                                </span>
                              )
                            ) : (
                              <span className="flex items-center gap-1 font-medium text-blue-600">
                                <Clock className="w-3 h-3" />
                                {startDate.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {event.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {event.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isJA && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSharingEvent(event) }}
                            title="Partilhar evento"
                            className="p-2 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>

          {/* Surveys aparecem por baixo do "Brevemente" */}
          {userId && surveys && surveys.length > 0 && (
            <SurveysSection userId={userId} surveys={surveys} />
          )}
        </div>
      </div>

      {/* Event Details Dialog */}
      {viewingEvent && (
        <Dialog open={!!viewingEvent} onOpenChange={(open) => !open && setViewingEvent(null)}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 flex-wrap">
                <CalendarIcon className={`w-5 h-5 ${viewingEvent.source === 'ja' ? 'text-amber-600' : 'text-blue-700'}`} />
                {viewingEvent.title}
                {viewingEvent.source === 'ja' && (
                  <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 border-none text-[10px] font-black uppercase tracking-wide">
                    JA · {viewingEvent.type}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 pt-1 font-medium text-blue-600">
                <Clock className="w-4 h-4" />
                {viewingEvent.source === 'ja'
                  ? new Date(viewingEvent.start_at).toLocaleDateString('pt-PT', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })
                  : new Date(viewingEvent.start_at).toLocaleString('pt-PT', {
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
                    {viewingEvent.source === 'ja'
                      ? viewingEvent.sections?.length
                        ? viewingEvent.sections.map((s: string) => SECTION_LABELS[s] || s).join(' · ')
                        : 'TODOS'
                      : viewingEvent.target_section ? viewingEvent.target_section.toUpperCase() : 'TODOS'}
                  </Badge>
                </div>
              </div>

              {viewingEvent.source === 'ja' ? (
                <div className="bg-amber-50 p-4 rounded-xl space-y-2 border border-amber-100">
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <AlarmClock className="w-4 h-4" /> Inscrições
                  </h4>
                  {viewingEvent.deadline_text && (
                    <p className="text-sm font-semibold text-amber-900">
                      Prazo limite: {viewingEvent.deadline_text}
                    </p>
                  )}
                  {viewingEvent.price && (
                    <p className="text-sm font-semibold text-amber-900">
                      Preço: {viewingEvent.price}
                    </p>
                  )}
                  <p className="text-xs text-amber-800/80">
                    A inscrição é feita no site da Juventude Adventista com a tua conta pessoal.
                    Se ainda não tens conta, pede ajuda ao teu dirigente.
                  </p>
                </div>
              ) : (
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
              )}
            </div>

            {viewingEvent.source === 'ja' ? (
              <DialogFooter className="sm:justify-between gap-2">
                <p className="text-[10px] text-gray-400 italic self-center">
                  Evento oficial da Juventude Adventista.
                </p>
                <Button
                  asChild
                  size="sm"
                  className="bg-amber-400 text-amber-950 hover:bg-amber-500 font-bold border-none"
                >
                  <a href={viewingEvent.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1.5" />
                    Ver e inscrever no site JA
                  </a>
                </Button>
              </DialogFooter>
            ) : (
              <DialogFooter className="sm:justify-between gap-2">
                <p className="text-[10px] text-gray-400 italic self-center">
                  * Pontos atribuídos após finalização pelo dirigente/coordenador.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => setSharingEvent(viewingEvent)}
                >
                  <Share2 className="w-4 h-4 mr-1.5" />
                  Partilhar
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Share Dialog */}
      {sharingEvent && (
        <EventShareDialog
          event={sharingEvent}
          open={!!sharingEvent}
          onOpenChange={(open) => !open && setSharingEvent(null)}
        />
      )}
    </div>
  )
}
