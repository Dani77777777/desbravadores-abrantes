'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Globe, ShieldCheck, User, Users } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { SECTION_LABELS } from '@/utils/permissions'

interface AnnouncementsFeedProps {
  recent: any[] // avisos das últimas 3 semanas
  older: any[]  // avisos mais antigos (revelados a pedido)
}

/** Etiqueta curta que explica PORQUE é que o membro recebeu o aviso. */
function audienceTag(a: any): { label: string; icon: any; className: string } {
  if (a.target_user_id || a.audience === 'member' || a.audience === 'members')
    return { label: 'Para ti', icon: User, className: 'bg-amber-50 text-amber-700 border-amber-200' }
  if (a.target_role === 'dirigente')
    return {
      label: a.target_section ? `Líderes · ${SECTION_LABELS[a.target_section] || a.target_section}` : 'Dirigentes',
      icon: ShieldCheck,
      className: 'bg-violet-50 text-violet-700 border-violet-200',
    }
  if (a.target_section)
    return { label: SECTION_LABELS[a.target_section] || a.target_section, icon: Users, className: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (a.target_role === 'desbravador')
    return { label: 'Desbravadores', icon: Users, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  return { label: 'Todo o clube', icon: Globe, className: 'bg-slate-50 text-slate-600 border-slate-200' }
}

function AnnouncementCard({ announcement, isNew }: { announcement: any; isNew: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const tag = audienceTag(announcement)
  const long = (announcement.message?.length || 0) > 180

  return (
    <Card className={`border-none shadow-sm overflow-hidden ${isNew ? 'ring-1 ring-blue-200' : ''}`}>
      <div className={`h-1 w-full ${isNew ? 'bg-blue-600' : 'bg-blue-600/20'}`} />
      <CardContent className="p-5">
        <div className="flex justify-between items-start gap-3 mb-2">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            {isNew && <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" aria-label="Novo" />}
            {announcement.title}
          </h3>
          <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap pt-1">
            {new Date(announcement.created_at).toLocaleDateString('pt-PT')}
          </span>
        </div>
        <p className={`text-sm text-gray-600 leading-relaxed whitespace-pre-line ${expanded ? '' : 'line-clamp-3'}`}>
          {announcement.message}
        </p>
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-semibold text-blue-700 hover:underline mt-1"
          >
            {expanded ? 'Ver menos' : 'Ler mais'}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tag.className}`}>
            <tag.icon className="w-3 h-3" /> {tag.label}
          </span>
          {announcement.author_name && (
            <span className="text-[10px] text-gray-400">por {announcement.author_name}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function AnnouncementsFeed({ recent, older }: AnnouncementsFeedProps) {
  const [showOlder, setShowOlder] = useState(false)
  // Guardamos quais eram novos ao abrir, para o destaque não desaparecer logo.
  const [newIds] = useState(() => new Set([...recent, ...older].filter((a) => !a.is_read).map((a) => a.id)))

  useEffect(() => {
    if (newIds.size === 0) return
    const t = setTimeout(() => {
      createClient().rpc('mark_announcements_read', { p_ids: [...newIds] }).then(({ error }) => {
        if (error) console.error('mark_announcements_read:', error)
      })
    }, 1500)
    return () => clearTimeout(t)
  }, [newIds])

  return (
    <div className="space-y-4">
      {recent.length > 0 ? (
        recent.map((announcement) => (
          <AnnouncementCard key={announcement.id} announcement={announcement} isNew={newIds.has(announcement.id)} />
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
            <AnnouncementCard key={announcement.id} announcement={announcement} isNew={newIds.has(announcement.id)} />
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
