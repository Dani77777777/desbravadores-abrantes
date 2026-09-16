'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Megaphone, Users, UserRound, ShieldCheck, BookOpen, Send, Clock, Globe, Trash2, Cake, Sparkles,
  Search, Check, X, Eye, ChevronDown, ChevronUp,
} from 'lucide-react'
import { SECTION_LABELS } from '@/utils/permissions'
import { ROLE_LABELS, SECTION_DOT } from './member-constants'

interface AnnouncementPanelProps {
  profile: any
  members: any[]
  sentAnnouncements: any[]
  sentRecipients: { announcement_id: string; user_id: string; read_at: string | null }[]
}

type Audience = 'global' | 'desbravadores' | 'dirigentes' | 'section' | 'section_leaders' | 'members'

const AUDIENCES: Record<Audience, { label: string; hint: string; icon: any; coordOnly: boolean }> = {
  global:          { label: 'Todo o clube',         hint: 'Desbravadores, dirigentes e coordenação.',        icon: Globe,       coordOnly: true },
  desbravadores:   { label: 'Desbravadores',        hint: 'Todos os membros (sem dirigentes).',             icon: Users,       coordOnly: true },
  dirigentes:      { label: 'Dirigentes',           hint: 'Todos os dirigentes e ajudantes de dirigente.',  icon: ShieldCheck, coordOnly: true },
  section:         { label: 'Uma classe',           hint: 'Membros da classe + os líderes dessa classe.',   icon: BookOpen,    coordOnly: false },
  section_leaders: { label: 'Líderes de uma classe', hint: 'Só os dirigentes responsáveis pela classe.',    icon: ShieldCheck, coordOnly: true },
  members:         { label: 'Membros específicos',  hint: 'Escolhe uma ou várias pessoas.',                 icon: UserRound,   coordOnly: false },
}

const effRole = (m: any) => m.helper_role || m.role
const effLead = (m: any) => m.helper_section || m.leadership_section

/** Espelha a regra da BD (resolve_announcement_recipients) para pré-visualizar quem recebe. */
function previewRecipients(audience: Audience, section: string, memberIds: string[], members: any[], authorId: string) {
  const others = members.filter((m) => m.id !== authorId)
  switch (audience) {
    case 'global': return others
    case 'desbravadores': return others.filter((m) => m.role === 'desbravador')
    case 'dirigentes': return others.filter((m) => effRole(m) === 'dirigente')
    case 'section': return section ? others.filter((m) => m.section === section || (effRole(m) === 'dirigente' && effLead(m) === section)) : []
    case 'section_leaders': return section ? others.filter((m) => effRole(m) === 'dirigente' && effLead(m) === section) : []
    case 'members': return members.filter((m) => memberIds.includes(m.id))
  }
}

function audienceLabel(a: any) {
  switch (a.audience) {
    case 'global': return { text: 'Todo o clube', cls: 'border-sky-200 text-sky-700 bg-sky-50' }
    case 'desbravadores': return { text: 'Desbravadores', cls: 'border-emerald-200 text-emerald-700 bg-emerald-50' }
    case 'dirigentes': return { text: 'Dirigentes', cls: 'border-purple-200 text-purple-700 bg-purple-50' }
    case 'section': return { text: `Classe · ${SECTION_LABELS[a.target_section] || a.target_section}`, cls: 'border-blue-200 text-blue-700 bg-blue-50' }
    case 'section_leaders': return { text: `Líderes · ${SECTION_LABELS[a.target_section] || a.target_section}`, cls: 'border-violet-200 text-violet-700 bg-violet-50' }
    case 'member':
    case 'members': return { text: 'Membros específicos', cls: 'border-amber-200 text-amber-700 bg-amber-50' }
  }
  // Comunicados antigos (antes da coluna audience)
  if (a.target_user_id) return { text: 'Pessoal', cls: 'border-amber-200 text-amber-700 bg-amber-50' }
  if (a.target_role === 'dirigente') return { text: a.target_section ? `Líderes · ${SECTION_LABELS[a.target_section]}` : 'Dirigentes', cls: 'border-violet-200 text-violet-700 bg-violet-50' }
  if (a.target_role === 'desbravador') return { text: 'Desbravadores', cls: 'border-emerald-200 text-emerald-700 bg-emerald-50' }
  if (a.target_section) return { text: `Classe · ${SECTION_LABELS[a.target_section]}`, cls: 'border-blue-200 text-blue-700 bg-blue-50' }
  return { text: 'Todo o clube', cls: 'border-sky-200 text-sky-700 bg-sky-50' }
}

export function AnnouncementPanel({ profile, members, sentAnnouncements, sentRecipients }: AnnouncementPanelProps) {
  const supabase = createClient()
  const router = useRouter()

  const isCoordenador = profile.role === 'coordenador'
  const mySection = profile.leadership_section || profile.section

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<Audience>(isCoordenador ? 'global' : 'section')
  const [section, setSection] = useState<string>(isCoordenador ? '' : mySection)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSectionFilter, setMemberSectionFilter] = useState('all')
  const [showPreviewList, setShowPreviewList] = useState(false)
  const [sending, setSending] = useState(false)

  const selectableMembers = members.filter((m) => m.id !== profile.id)
  const memberById = new Map(members.map((m) => [m.id, m]))
  const recipients = previewRecipients(audience, section, memberIds, members, profile.id)

  const chooseAudience = (a: Audience) => {
    setAudience(a)
    setShowPreviewList(false)
    if (!isCoordenador && a === 'section') setSection(mySection)
  }

  const send = async (params: { title: string; message: string; audience: Audience; section?: string | null; memberIds?: string[] }) => {
    const { data, error } = await supabase.rpc('send_announcement', {
      p_title: params.title,
      p_message: params.message,
      p_audience: params.audience,
      p_section: params.section || null,
      p_member_ids: params.memberIds?.length ? params.memberIds : null,
    })
    if (error) throw error
    return data as { id: string; recipients: number }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return toast.error('Preenche o título e a mensagem.')
    if ((audience === 'section' || audience === 'section_leaders') && !section) return toast.error('Escolhe uma classe.')
    if (audience === 'members' && memberIds.length === 0) return toast.error('Escolhe pelo menos um membro.')

    setSending(true)
    try {
      const result = await send({ title, message, audience, section, memberIds })
      toast.success(`Comunicado enviado para ${result.recipients} ${result.recipients === 1 ? 'pessoa' : 'pessoas'}! ✉️`)
      setTitle('')
      setMessage('')
      setMemberIds([])
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar comunicado.')
    } finally {
      setSending(false)
    }
  }

  // ── Aniversários ──
  const today = new Date()
  const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const birthdayMembers = members.filter((m) => {
    if (!m.birth_date) return false
    const bDate = new Date(m.birth_date)
    const bMonthDay = `${String(bDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bDate.getUTCDate()).padStart(2, '0')}`
    if (!isCoordenador && m.section !== mySection) return false
    const alreadySent = sentAnnouncements.some(
      (a) => a.title === `🎈 Parabéns, ${m.full_name}!` && new Date(a.created_at).toDateString() === today.toDateString()
    )
    return bMonthDay === todayMonthDay && !alreadySent
  })

  const handleSendBirthday = async (list: any[]) => {
    setSending(true)
    try {
      for (const m of list) {
        await send({
          title: `🎈 Parabéns, ${m.full_name}!`,
          message: `🎈 Parabéns, ${m.full_name}! Que Deus te abençoe em mais um ano de vida! ✨`,
          // A coordenação avisa o clube todo; o dirigente avisa a sua classe.
          audience: isCoordenador ? 'global' : 'section',
          section: isCoordenador ? null : mySection,
        })
      }
      toast.success(list.length === 1 ? `Parabéns enviados para ${list[0].full_name}! 🎂` : `Parabéns enviados para ${list.length} pessoas! 🎂`)
      router.refresh()
    } catch {
      toast.error('Erro ao enviar parabéns.')
    } finally {
      setSending(false)
    }
  }

  // ── Seletor de membros ──
  const normalize = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const q = normalize(memberSearch.trim())
  const filteredMembers = selectableMembers.filter((m) => {
    if (memberSectionFilter !== 'all' && m.section !== memberSectionFilter) return false
    return !q || normalize(m.full_name || '').includes(q)
  })
  const allFilteredSelected = filteredMembers.length > 0 && filteredMembers.every((m) => memberIds.includes(m.id))
  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const toggleAllFiltered = () => {
    const ids = filteredMembers.map((m) => m.id)
    setMemberIds((prev) => (allFilteredSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))))
  }
  const sectionsPresent = Object.keys(SECTION_LABELS).filter((s) => selectableMembers.some((m) => m.section === s))

  const availableAudiences = (Object.keys(AUDIENCES) as Audience[]).filter((a) => isCoordenador || !AUDIENCES[a].coordOnly)
  const needsSection = audience === 'section' || audience === 'section_leaders'

  return (
    <div className="space-y-8">
      {/* ── Aniversariantes ── */}
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
                ? 'Os parabéns são enviados para todo o clube.'
                : `Os parabéns são enviados para a classe ${SECTION_LABELS[mySection]}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {birthdayMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-3 bg-white p-2 pr-3 rounded-full border border-pink-200 shadow-sm">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={m.avatar_url} className="object-cover" />
                    <AvatarFallback className="bg-pink-100 text-pink-600 font-bold text-xs">{m.full_name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-800 leading-tight">{m.full_name}</span>
                    <span className="text-[10px] text-pink-500 font-medium">{SECTION_LABELS[m.section]}</span>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-pink-500 hover:bg-pink-600 text-[11px] font-bold rounded-full ml-1"
                    onClick={() => handleSendBirthday([m])}
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
                  onClick={() => handleSendBirthday(birthdayMembers)}
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

      {/* ── Novo comunicado ── */}
      <Card className="border-2 border-blue-100">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <div className="p-2 bg-blue-700 rounded-lg">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            Novo Comunicado
          </CardTitle>
          <CardDescription>
            Os destinatários ficam fixos no momento do envio: quem mudar de classe depois continua a ver o que recebeu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-6">
            {/* Passo 1: Para quem */}
            <section className="space-y-3">
              <StepLabel n={1} label="Para quem?" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availableAudiences.map((a) => {
                  const cfg = AUDIENCES[a]
                  const active = audience === a
                  const label = !isCoordenador && a === 'section' ? `A minha classe (${SECTION_LABELS[mySection]})` : cfg.label
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => chooseAudience(a)}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        active ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg shrink-0 ${active ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <cfg.icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${active ? 'text-blue-900' : 'text-slate-800'}`}>{label}</p>
                        <p className="text-[11px] text-slate-500 leading-snug">{cfg.hint}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Classe */}
              {needsSection && isCoordenador && (
                <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {Object.entries(SECTION_LABELS).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSection(val)}
                      className={`inline-flex items-center gap-2 h-9 px-3 rounded-full border text-xs font-semibold transition-colors ${
                        section === val ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${SECTION_DOT[val]}`} /> {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Membros */}
              {audience === 'members' && (
                <div className="rounded-xl border bg-white animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="p-3 border-b space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Pesquisar membro..." className="pl-9 h-9" />
                    </div>
                    {sectionsPresent.length > 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        {['all', ...sectionsPresent].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setMemberSectionFilter(s)}
                            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-semibold ${
                              memberSectionFilter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {s !== 'all' && <span className={`h-1.5 w-1.5 rounded-full ${SECTION_DOT[s]}`} />}
                            {s === 'all' ? 'Todas' : SECTION_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <button type="button" onClick={toggleAllFiltered} className="font-semibold text-blue-700 hover:underline disabled:text-slate-400" disabled={filteredMembers.length === 0}>
                        {allFilteredSelected ? 'Desmarcar visíveis' : `Selecionar visíveis (${filteredMembers.length})`}
                      </button>
                      <span className="text-slate-500">{memberIds.length} selecionado{memberIds.length === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y">
                    {filteredMembers.map((m) => {
                      const checked = memberIds.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMember(m.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${checked ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
                        >
                          <span className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-700 border-blue-700 text-white' : 'border-slate-300 bg-white'}`}>
                            {checked && <Check className="w-3.5 h-3.5" />}
                          </span>
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={m.avatar_url} className="object-cover" />
                            <AvatarFallback className="text-[10px] font-bold bg-slate-200 text-slate-600">{m.full_name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{m.full_name}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                            <span className={`h-1.5 w-1.5 rounded-full ${SECTION_DOT[m.section] || 'bg-slate-300'}`} />
                            {SECTION_LABELS[m.section]}
                            {m.role !== 'desbravador' && <span className="text-slate-400">· {ROLE_LABELS[m.role]}</span>}
                          </span>
                        </button>
                      )
                    })}
                    {filteredMembers.length === 0 && (
                      <p className="text-center text-sm text-slate-400 py-6">Nenhum membro encontrado.</p>
                    )}
                  </div>
                  {memberIds.length > 0 && (
                    <div className="p-3 border-t flex flex-wrap gap-1.5">
                      {memberIds.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800">
                          {memberById.get(id)?.full_name || 'Membro'}
                          <button type="button" onClick={() => toggleMember(id)} className="p-0.5 rounded-full hover:bg-amber-200" aria-label="Remover">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Quem vai receber */}
              <div className="rounded-xl bg-slate-50 border px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowPreviewList((v) => !v)}
                  disabled={recipients.length === 0}
                  className="w-full flex items-center gap-2 text-sm text-left"
                >
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600">
                    {recipients.length === 0
                      ? needsSection && !section ? 'Escolhe uma classe para ver quem recebe.' : audience === 'members' ? 'Ainda ninguém selecionado.' : 'Ninguém corresponde a este destinatário.'
                      : <>Vai chegar a <strong className="text-slate-900">{recipients.length} {recipients.length === 1 ? 'pessoa' : 'pessoas'}</strong></>}
                  </span>
                  {recipients.length > 0 && (
                    <>
                      <span className="flex -space-x-2 ml-auto">
                        {recipients.slice(0, 5).map((m) => (
                          <Avatar key={m.id} className="h-6 w-6 ring-2 ring-slate-50">
                            <AvatarImage src={m.avatar_url} className="object-cover" />
                            <AvatarFallback className="text-[9px] font-bold bg-slate-200">{m.full_name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                        ))}
                      </span>
                      {showPreviewList ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </>
                  )}
                </button>
                {showPreviewList && recipients.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    {recipients.map((m) => m.full_name).join(', ')}
                  </p>
                )}
              </div>
            </section>

            {/* Passo 2: Mensagem */}
            <section className="space-y-3">
              <StepLabel n={2} label="Mensagem" />
              <div className="space-y-1">
                <Label htmlFor="ann-title" className="text-xs font-bold uppercase text-slate-500">Título</Label>
                <Input
                  id="ann-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Reunião esta sexta — compareçam todos!"
                  maxLength={80}
                  required
                />
                <p className="text-[10px] text-right text-gray-400">{title.length}/80</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ann-message" className="text-xs font-bold uppercase text-slate-500">Mensagem</Label>
                <Textarea
                  id="ann-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escreve aqui o comunicado detalhado..."
                  rows={5}
                  maxLength={1000}
                  required
                />
                <p className="text-[10px] text-right text-gray-400">{message.length}/1000</p>
              </div>
            </section>

            <Button
              type="submit"
              className="w-full bg-blue-800 hover:bg-blue-900 h-11 text-base font-bold shadow-md"
              disabled={sending || recipients.length === 0 || !title.trim() || !message.trim()}
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? 'A enviar...' : recipients.length > 0 ? `Enviar para ${recipients.length} ${recipients.length === 1 ? 'pessoa' : 'pessoas'}` : 'Enviar comunicado'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Enviados ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Enviados ({sentAnnouncements.length})
          </CardTitle>
          <CardDescription>Vê quem já leu cada comunicado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sentAnnouncements.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-sm">Ainda não enviaste nenhum comunicado.</p>
          )}
          {sentAnnouncements.map((a) => (
            <SentAnnouncement
              key={a.id}
              announcement={a}
              recipients={sentRecipients.filter((r) => r.announcement_id === a.id)}
              memberById={memberById}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Componentes auxiliares ──

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-5 w-5 rounded-full bg-blue-700 text-white text-[11px] font-bold flex items-center justify-center">{n}</span>
      <span className="text-xs font-bold uppercase text-slate-600 tracking-wide">{label}</span>
    </div>
  )
}

function SentAnnouncement({ announcement: a, recipients, memberById }: {
  announcement: any
  recipients: { user_id: string; read_at: string | null }[]
  memberById: Map<string, any>
}) {
  const router = useRouter()
  const [showReaders, setShowReaders] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const total = recipients.length
  const read = recipients.filter((r) => r.read_at).length
  const pct = total ? Math.round((read / total) * 100) : 0
  const badge = audienceLabel(a)
  const nameOf = (id: string) => memberById.get(id)?.full_name || 'Membro'

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await createClient().from('announcements').delete().eq('id', a.id)
    setDeleting(false)
    if (error) return toast.error('Erro ao apagar comunicado.')
    toast.success('Comunicado apagado.')
    router.refresh()
  }

  return (
    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm text-gray-800">{a.title}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.text}</span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{a.message}</p>
          <p className="text-[10px] text-gray-400">
            {new Date(a.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
        {confirmDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancelar</Button>
            <Button size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'A apagar...' : 'Apagar'}
            </Button>
          </div>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
            onClick={() => setConfirmDelete(true)}
            aria-label="Apagar comunicado"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {total > 0 && (
        <div>
          <button type="button" onClick={() => setShowReaders((v) => !v)} className="w-full flex items-center gap-3 text-xs text-slate-500">
            <Eye className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">Lido por <strong className="text-slate-700">{read}</strong> de {total}</span>
            <span className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <span className="block h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </span>
            {showReaders ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showReaders && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
              <div>
                <p className="font-semibold text-emerald-700 mb-1">Leram ({read})</p>
                <p className="text-slate-600 leading-relaxed">
                  {recipients.filter((r) => r.read_at).map((r) => nameOf(r.user_id)).join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-500 mb-1">Ainda não leram ({total - read})</p>
                <p className="text-slate-600 leading-relaxed">
                  {recipients.filter((r) => !r.read_at).map((r) => nameOf(r.user_id)).join(', ') || '—'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
