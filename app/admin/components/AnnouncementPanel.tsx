'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Megaphone, Users, UserRound, ShieldCheck, BookOpen, Send, Clock, Globe, Trash2, Cake, Sparkles
} from 'lucide-react'

interface AnnouncementPanelProps {
  profile: any
  members: any[]
  sentAnnouncements: any[]
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

type AudienceType =
  | 'global'               // coord only — todos (tropa e dirigentes)
  | 'all_desbravadores'    // coord only — todos os desbravadores
  | 'all_dirigentes'       // coord only — todos os dirigentes
  | 'dirigente_of_section' // coord only — dirigentes de uma classe
  | 'specific_section'     // coord only — desbravadores de uma classe
  | 'my_section_all'       // dirigente — toda a classe
  | 'specific_member'      // ambos — membro em específico

export function AnnouncementPanel({ profile, members, sentAnnouncements }: AnnouncementPanelProps) {
  const supabase = createClient()
  const router = useRouter()

  const isCoordenador = profile.role === 'coordenador'

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<AudienceType>(
    isCoordenador ? 'global' : 'my_section_all'
  )
  const [specificSection, setSpecificSection] = useState('')
  const [specificMemberId, setSpecificMemberId] = useState('')
  const [sending, setSending] = useState(false)

  const memberOptions = members.filter(m => m.id !== profile.id)

  // Build the DB payload based on audience
  const buildPayload = () => {
    const base = { author_id: profile.id, title: title.trim(), message: message.trim() }
    switch (audience) {
      case 'global':
        return base
      case 'all_desbravadores':
        return { ...base, target_role: 'desbravador' }
      case 'all_dirigentes':
        return { ...base, target_role: 'dirigente' }
      case 'dirigente_of_section':
        return { ...base, target_role: 'dirigente', target_section: specificSection }
      case 'specific_section':
        return { ...base, target_section: specificSection }
      case 'my_section_all':
        return { ...base, target_section: profile.leadership_section || profile.section }
      case 'specific_member':
        return { ...base, target_user_id: specificMemberId }
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return toast.error('Preenche o título e a mensagem.')
    if (['specific_section','dirigente_of_section'].includes(audience) && !specificSection)
      return toast.error('Escolhe uma classe.')
    if (audience === 'specific_member' && !specificMemberId)
      return toast.error('Escolhe um membro.')

    setSending(true)
    try {
      const { error } = await supabase.from('announcements').insert(buildPayload())
      if (error) throw error
      toast.success('Comunicado enviado com sucesso! ✉️')
      setTitle('')
      setMessage('')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar comunicado.')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tens a certeza que queres apagar este comunicado?')) return
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id)
      if (error) throw error
      toast.success('Comunicado apagado.')
      router.refresh()
    } catch (e: any) {
      toast.error('Erro ao apagar comunicado.')
    }
  }

  const needsSectionPicker = audience === 'specific_section' || audience === 'dirigente_of_section'
  const needsMemberPicker = audience === 'specific_member'

  // Birthday logic
  const today = new Date()
  const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  
  const birthdayMembers = members.filter(m => {
    if (!m.birth_date) return false
    const bDate = new Date(m.birth_date)
    const bMonthDay = `${String(bDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bDate.getUTCDate()).padStart(2, '0')}`
    
    // Filter by class if Dirigente
    if (profile.role === 'dirigente') {
      const targetSection = profile.leadership_section || profile.section
      if (m.section !== targetSection) return false
    }

    // Check if a birthday message was already sent TODAY for this member
    const alreadySent = sentAnnouncements.some(a => {
      const isBirthdayTitle = a.title === `🎈 Parabéns, ${m.full_name}!`
      const isToday = new Date(a.created_at).toDateString() === today.toDateString()
      return isBirthdayTitle && isToday
    })

    return bMonthDay === todayMonthDay && !alreadySent
  })

  const handleSendBirthday = async (memberOrAll: any | 'all') => {
    setSending(true)
    try {
      if (memberOrAll === 'all') {
        const payloads = birthdayMembers.map(m => ({
          author_id: profile.id,
          title: `🎈 Parabéns, ${m.full_name}!`,
          message: `🎈 Parabéns, ${m.full_name}! Que Deus te abençoe em mais um ano de vida! ✨`,
        }))
        const { error } = await supabase.from('announcements').insert(payloads)
        if (error) throw error
        toast.success(`Parabéns enviados para ${birthdayMembers.length} pessoas! 🎂`)
      } else {
        const { error } = await supabase.from('announcements').insert({
          author_id: profile.id,
          title: `🎈 Parabéns, ${memberOrAll.full_name}!`,
          message: `🎈 Parabéns, ${memberOrAll.full_name}! Que Deus te abençoe em mais um ano de vida! ✨`,
        })
        if (error) throw error
        toast.success(`Parabéns enviados para ${memberOrAll.full_name}! 🎂`)
      }
      router.refresh()
    } catch (e: any) {
      toast.error('Erro ao enviar parabéns.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Birthday Widget ── */}
      {birthdayMembers.length > 0 && (
        <Card className="border-2 border-pink-100 bg-pink-50/30 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Cake className="w-24 h-24 text-pink-500" />
          </div>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-pink-700">
              <Cake className="w-5 h-5" />
              Aniversariantes de Hoje ({birthdayMembers.length})
            </CardTitle>
            <CardDescription className="text-pink-600/80">
              {isCoordenador 
                ? 'Estes são os membros do clube que fazem anos hoje.' 
                : `Estes são os membros da classe ${SECTION_LABELS[profile.leadership_section || profile.section]} que fazem anos hoje.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {birthdayMembers.map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-white p-2 pr-3 rounded-full border border-pink-200 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold text-xs">
                    {m.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-800 leading-tight">{m.full_name}</span>
                    <span className="text-[10px] text-pink-500 font-medium capitalize">{SECTION_LABELS[m.section]}</span>
                  </div>
                  <Button 
                    size="sm" 
                    className="h-7 px-3 bg-pink-500 hover:bg-pink-600 text-[11px] font-bold rounded-full ml-1"
                    onClick={() => handleSendBirthday(m)}
                    disabled={sending}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Parabéns
                  </Button>
                </div>
              ))}
              
              {birthdayMembers.length > 1 && (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="h-10 px-4 border-pink-300 text-pink-600 hover:bg-pink-50 rounded-xl font-bold ml-auto"
                  onClick={() => handleSendBirthday('all')}
                  disabled={sending}
                >
                  <Cake className="w-4 h-4 mr-2" />
                  Parabéns a Todos
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Compose ── */}
      <Card className="border-2 border-blue-100">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <div className="p-2 bg-blue-700 rounded-lg">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            Novo Comunicado
          </CardTitle>
          <CardDescription>
            {isCoordenador
              ? 'Envia mensagens para toda a tropa, dirigentes, classes específicas ou membros individuais.'
              : 'Envia mensagens para a tua classe ou para um desbravador específico.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-5">

            {/* ── Audience grid ── */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500 tracking-wide">Destinatário</Label>

              {isCoordenador && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <AudienceBtn active={audience==='global'} onClick={()=>setAudience('global')}
                    icon={<Globe className="w-4 h-4"/>} label="Global (Todos)" color="sky"/>
                  <AudienceBtn active={audience==='all_desbravadores'} onClick={()=>setAudience('all_desbravadores')}
                    icon={<Globe className="w-4 h-4"/>} label="Todos os Desbravadores" color="emerald"/>
                  <AudienceBtn active={audience==='all_dirigentes'} onClick={()=>setAudience('all_dirigentes')}
                    icon={<ShieldCheck className="w-4 h-4"/>} label="Todos os Dirigentes" color="purple"/>
                  <AudienceBtn active={audience==='dirigente_of_section'} onClick={()=>setAudience('dirigente_of_section')}
                    icon={<ShieldCheck className="w-4 h-4"/>} label="Dirigentes de uma Classe" color="violet"/>
                  <AudienceBtn active={audience==='specific_section'} onClick={()=>setAudience('specific_section')}
                    icon={<BookOpen className="w-4 h-4"/>} label="Uma Classe" color="blue"/>
                  <AudienceBtn active={audience==='specific_member'} onClick={()=>setAudience('specific_member')}
                    icon={<UserRound className="w-4 h-4"/>} label="Membro específico" color="amber"/>
                </div>
              )}

              {!isCoordenador && (
                <div className="grid grid-cols-2 gap-2">
                  <AudienceBtn active={audience==='my_section_all'} onClick={()=>setAudience('my_section_all')}
                    icon={<Users className="w-4 h-4"/>} label="Toda a minha classe" color="green"/>
                  <AudienceBtn active={audience==='specific_member'} onClick={()=>setAudience('specific_member')}
                    icon={<UserRound className="w-4 h-4"/>} label="Membro específico" color="amber"/>
                </div>
              )}
            </div>

            {/* ── Section picker ── */}
            {needsSectionPicker && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label className="text-xs font-bold uppercase text-slate-500">
                  {audience === 'dirigente_of_section' ? 'Classe cuja liderança recebe' : 'Selecionar Classe'}
                </Label>
                <Select value={specificSection} onValueChange={setSpecificSection}>
                  <SelectTrigger className="border-blue-200">
                    <SelectValue placeholder="Escolhe uma classe..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SECTION_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {audience === 'dirigente_of_section' && specificSection && (
                  <p className="text-[10px] text-purple-600 font-medium">
                    ℹ️ Apenas o dirigente responsável pelos {SECTION_LABELS[specificSection]} receberá este comunicado.
                  </p>
                )}
              </div>
            )}

            {/* ── Member picker ── */}
            {needsMemberPicker && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label className="text-xs font-bold uppercase text-slate-500">Selecionar Membro</Label>
                <Select value={specificMemberId} onValueChange={setSpecificMemberId}>
                  <SelectTrigger className="border-amber-200">
                    <SelectValue placeholder="Escolhe um membro..." />
                  </SelectTrigger>
                  <SelectContent>
                    {memberOptions.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="capitalize text-gray-400 text-xs mr-1">[{m.role}]</span>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* ── Summary chip ── */}
            <AudienceSummaryChip
              audience={audience}
              specificSection={specificSection}
              specificMemberId={specificMemberId}
              memberOptions={memberOptions}
              leadershipSection={profile.leadership_section || profile.section}
            />

            {/* ── Title ── */}
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase text-slate-500">Título</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Reunião esta sexta — compareçam todos!"
                maxLength={80}
                required
              />
              <p className="text-[10px] text-right text-gray-400">{title.length}/80</p>
            </div>

            {/* ── Message ── */}
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase text-slate-500">Mensagem</Label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Escreve aqui o comunicado detalhado..."
                rows={5}
                maxLength={600}
                required
              />
              <p className="text-[10px] text-right text-gray-400">{message.length}/600</p>
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-800 hover:bg-blue-900 h-11 text-base font-bold shadow-md"
              disabled={sending}
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? 'A enviar...' : 'Enviar Comunicado'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── History ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Enviados ({sentAnnouncements.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sentAnnouncements.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-sm">Ainda não enviaste nenhum comunicado.</p>
          )}
          {sentAnnouncements.map(a => (
            <div key={a.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm text-gray-800">{a.title}</p>
                    <HistoryBadge a={a} />
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{a.message}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(a.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  onClick={() => handleDelete(a.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Helper components ──

const PALETTE: Record<string, { active: string; inactive: string }> = {
  sky:      { active: 'bg-sky-600 text-white border-sky-400 shadow-sky-200',         inactive: 'bg-sky-50 text-sky-700 border-sky-100 hover:bg-sky-100' },
  emerald: { active: 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-200', inactive: 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100' },
  purple:  { active: 'bg-purple-600 text-white border-purple-400 shadow-purple-200',   inactive: 'bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-100' },
  violet:  { active: 'bg-violet-600 text-white border-violet-400 shadow-violet-200',   inactive: 'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100' },
  blue:    { active: 'bg-blue-600 text-white border-blue-400 shadow-blue-200',         inactive: 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100' },
  amber:   { active: 'bg-amber-500 text-white border-amber-400 shadow-amber-200',      inactive: 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100' },
  green:   { active: 'bg-green-600 text-white border-green-400 shadow-green-200',      inactive: 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100' },
}

function AudienceBtn({ active, icon, label, onClick, color }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void; color: string
}) {
  const p = PALETTE[color] ?? PALETTE.blue
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all shadow-sm ${
        active ? `${p.active} shadow-md` : p.inactive
      }`}
    >
      {icon}
      <span className="text-left leading-tight">{label}</span>
    </button>
  )
}

function AudienceSummaryChip({ audience, specificSection, specificMemberId, memberOptions, leadershipSection }: any) {
  const configs: Record<AudienceType, { icon: string; label: string; color: string }> = {
    global:              { icon: '🌎', label: 'Todos os Membros (Global)', color: 'text-sky-700 bg-sky-50 border-sky-200' },
    all_desbravadores:   { icon: '🌍', label: 'Todos os Desbravadores', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    all_dirigentes:      { icon: '🛡️', label: 'Todos os Dirigentes', color: 'text-purple-700 bg-purple-50 border-purple-200' },
    dirigente_of_section:{ icon: '🛡️📚', label: `Dirigentes do${specificSection ? `s ${SECTION_LABELS[specificSection]}` : '...'}`, color: 'text-violet-700 bg-violet-50 border-violet-200' },
    specific_section:    { icon: '📚', label: `Classe: ${SECTION_LABELS[specificSection] ?? '...'}`, color: 'text-blue-700 bg-blue-50 border-blue-200' },
    my_section_all:      { icon: '⚜️', label: `Classe: ${SECTION_LABELS[leadershipSection] ?? leadershipSection}`, color: 'text-green-700 bg-green-50 border-green-200' },
    specific_member:     { icon: '👤', label: memberOptions.find((m: any) => m.id === specificMemberId)?.full_name ?? 'Selecionar membro...', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  }
  const c = configs[audience as AudienceType]
  return (
    <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border w-fit ${c.color}`}>
      <span>{c.icon}</span>
      <span>A enviar para: {c.label}</span>
    </div>
  )
}

function HistoryBadge({ a }: { a: any }) {
  if (a.target_user_id)
    return <Badge variant="outline" className="text-[10px] shrink-0 border-amber-200 text-amber-700 bg-amber-50">👤 Pessoal</Badge>
  if (a.target_role === 'dirigente' && a.target_section)
    return <Badge variant="outline" className="text-[10px] shrink-0 border-violet-200 text-violet-700 bg-violet-50">🛡️📚 Dir. {SECTION_LABELS[a.target_section]}</Badge>
  if (a.target_role === 'dirigente')
    return <Badge variant="outline" className="text-[10px] shrink-0 border-purple-200 text-purple-700 bg-purple-50">🛡️ Dirigentes</Badge>
  if (a.target_role === 'desbravador')
    return <Badge variant="outline" className="text-[10px] shrink-0 border-emerald-200 text-emerald-700 bg-emerald-50">🌍 Todos</Badge>
  if (a.target_section)
    return <Badge variant="outline" className="text-[10px] shrink-0 border-blue-200 text-blue-700 bg-blue-50">📚 {SECTION_LABELS[a.target_section]}</Badge>
  return <Badge variant="outline" className="text-[10px] shrink-0">🌍 Global</Badge>
}
