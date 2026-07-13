'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface AnnouncementsFeedProps {
  recent: any[] // avisos das últimas 3 semanas
  older: any[]  // avisos mais antigos (revelados a pedido)
}

function AnnouncementCard({ announcement }: { announcement: any }) {
  return (
    <Card className="border-none shadow-sm overflow-hidden">
      <div className="h-1 bg-blue-600 w-full opacity-20" />
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-gray-900 transition-colors">
            {announcement.title}
          </h3>
          <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
            {new Date(announcement.created_at).toLocaleDateString('pt-PT')}
          </span>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
          {announcement.message}
        </p>
      </CardContent>
    </Card>
  )
}

export function AnnouncementsFeed({ recent, older }: AnnouncementsFeedProps) {
  const [showOlder, setShowOlder] = useState(false)

  return (
    <div className="space-y-4">
      {recent.length > 0 ? (
        recent.map((announcement) => (
          <AnnouncementCard key={announcement.id} announcement={announcement} />
        ))
      ) : (
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="py-10 text-center">
            <p className="text-gray-500 italic">
              {older.length > 0 ? 'Nenhum aviso recente.' : 'Nenhum aviso de momento.'}
            </p>
          </CardContent>
        </Card>
      )}

      {older.length > 0 && (
        <>
          {showOlder && older.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOlder(v => !v)}
            className="w-full text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            {showOlder ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Esconder avisos antigos
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Ver avisos antigos ({older.length})
              </>
            )}
          </Button>
        </>
      )}
    </div>
  )
}
