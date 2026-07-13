'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CalendarUIProps {
  events: any[]
  onSelectDate: (date: Date | null) => void
  selectedDate: Date | null
}

export function CalendarUI({ events, onSelectDate, selectedDate }: CalendarUIProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1))

  const days = []
  const numDays = daysInMonth(year, month)
  const firstDay = firstDayOfMonth(year, month) // 0 is Sunday in JS getDay()

  // Empty slots before first day
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="h-10 w-full" />)
  }

  // Days of the month
  for (let d = 1; d <= numDays; d++) {
    const date = new Date(year, month, d)
    const isToday = date.toDateString() === new Date().toDateString()
    const isSelected = selectedDate?.toDateString() === date.toDateString()
    
    const dayEvents = events.filter(e => {
      const eventDate = new Date(e.start_at)
      return eventDate.toDateString() === date.toDateString()
    })
    const hasClubEvents = dayEvents.some(e => e.source !== 'ja')
    const hasJAEvents = dayEvents.some(e => e.source === 'ja')

    days.push(
      <button
        key={d}
        onClick={() => onSelectDate(isSelected ? null : date)}
        className={`h-10 w-full rounded-lg flex flex-col items-center justify-center relative transition-all
          ${isSelected ? 'bg-blue-600 text-white font-bold' : isToday ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-gray-700'}
        `}
      >
        <span className="text-sm">{d}</span>
        {!isSelected && (hasClubEvents || hasJAEvents) && (
          <div className="absolute bottom-1.5 flex items-center gap-0.5">
            {hasClubEvents && <div className="w-1 h-1 bg-blue-500 rounded-full" />}
            {hasJAEvents && <div className="w-1 h-1 bg-amber-500 rounded-full" />}
          </div>
        )}
      </button>
    )
  }

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900">
          {monthNames[month]} <span className="text-gray-400 font-normal">{year}</span>
        </h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="h-8 w-full flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days}
      </div>
    </div>
  )
}
