'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquare, ChevronDown } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { VanaCampMessage, VanaCampChannel } from '@/types/vana-camp'

interface Props {
  sessionId: string
  /** Todos os jogadores da sessão (vivos, em casa e bots) para resolver nomes. */
  players: { id: string; display_name: string }[]
}

const CHANNEL_META: Record<VanaCampChannel, { label: string; text: string; dot: string }> = {
  infiltrators: { label: 'Infiltrados', text: 'text-red-300', dot: 'bg-red-400' },
  day: { label: 'Assembleia', text: 'text-amber-200', dot: 'bg-amber-400' },
  lobby: { label: 'Lobby', text: 'text-stone-300', dot: 'bg-stone-400' },
  dead: { label: 'Em casa', text: 'text-sky-300', dot: 'bg-sky-400' },
}

type Filter = 'all' | VanaCampChannel
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'infiltrators', label: 'Infiltrados' },
  { key: 'day', label: 'Assembleia' },
  { key: 'lobby', label: 'Lobby' },
  { key: 'dead', label: 'Em casa' },
]

/**
 * Painel flutuante do Narrador para ler TODOS os chats da sessão, incluindo o
 * dos infiltrados (RLS já autoriza o host em todos os canais via is_host).
 * Vive na coluna flutuante do canto inferior esquerdo (control/page.tsx), entre
 * o HostDebugOverlay (em baixo) e o HostAlertPanel (em cima).
 */
export function HostChatMonitor({ sessionId, players }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [messages, setMessages] = useState<VanaCampMessage[]>([])
  const [lastSeen, setLastSeen] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const nameById = new Map(players.map((p) => [p.id, p.display_name]))

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    supabase
      .from('vanacamp_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(300)
      .then(({ data }) => { if (mounted && data) setMessages(data as VanaCampMessage[]) })
    const ch = supabase
      .channel(`vc_host_chat_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vanacamp_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as VanaCampMessage]),
      )
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(ch) }
  }, [sessionId])

  const filtered = filter === 'all' ? messages : messages.filter((m) => m.channel === filter)

  // Auto-scroll para o fundo quando há mensagens novas e o painel está aberto.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [filtered.length, open])

  // Marca como vistas ao abrir.
  useEffect(() => { if (open) setLastSeen(messages.length) }, [open, messages.length])

  const unread = messages.length - lastSeen

  return (
    <div className="pointer-events-auto max-w-full">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="relative bg-amber-700 hover:bg-amber-600 text-white rounded-full p-3 shadow-lg"
          title="Ver chats dos jogadores"
        >
          <MessageSquare className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      ) : (
        <div className="bg-stone-950/95 border border-amber-700 rounded-lg shadow-2xl w-80 max-w-[calc(100vw-2rem)] backdrop-blur overflow-hidden flex flex-col">
          <div className="bg-amber-900/40 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-100 font-semibold text-xs uppercase tracking-wide">
              <MessageSquare className="w-4 h-4" /> Chats dos jogadores
            </div>
            <button onClick={() => setOpen(false)} className="text-amber-300 hover:text-white" title="Fechar">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-stone-800">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-[11px] px-2 py-0.5 rounded-full transition ${
                  filter === f.key
                    ? 'bg-amber-600 text-white'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="max-h-72 overflow-y-auto p-2 space-y-1.5 text-sm">
            {filtered.length === 0 ? (
              <p className="text-stone-500 italic text-xs text-center py-4">Sem mensagens neste canal.</p>
            ) : (
              filtered.map((m) => {
                const meta = CHANNEL_META[m.channel]
                return (
                  <div key={m.id} className="leading-snug">
                    {filter === 'all' && (
                      <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide mr-1 ${meta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    )}
                    <strong className={meta.text}>{nameById.get(m.sender_player_id) ?? '?'}:</strong>{' '}
                    <span className="text-stone-200">{m.content}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
