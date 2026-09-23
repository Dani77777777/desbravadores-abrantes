'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, MessageSquare, Send, CheckCircle2, Clock, Trash2, Trophy, Users, ShieldCheck, Lightbulb, AlertCircle } from 'lucide-react'
import { displayFont } from '@/components/landing/fonts'

const D = displayFont.className

interface SuggestionsFormProps {
  initialSuggestions: any[]
  userId: string
}

const TARGETS = [
  {
    value: 'dirigente',
    label: 'Dirigente da Classe',
    description: 'Visível para o teu dirigente e para a coordenação',
    icon: Users,
    active: 'bg-blue-50 ring-blue-500 text-blue-950',
    iconClass: 'bg-blue-600',
  },
  {
    value: 'coordenador',
    label: 'Apenas Coordenação',
    description: 'Mensagem privada lida apenas pelos coordenadores',
    icon: ShieldCheck,
    active: 'bg-rose-50 ring-rose-500 text-blue-950',
    iconClass: 'bg-rose-500',
  },
]

export function SuggestionsForm({ initialSuggestions, userId }: SuggestionsFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>(initialSuggestions)
  const [content, setContent] = useState('')
  const [target, setTarget] = useState('dirigente')

  const supabase = createClient()

  const deleteSuggestion = async (id: string) => {
    if (!confirm('Tens a certeza que queres apagar esta sugestão?')) return

    const { error } = await supabase
      .from('suggestions')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Erro ao apagar sugestão')
    } else {
      toast.success('Sugestão apagada')
      setSuggestions(suggestions.filter(s => s.id !== id))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    setSubmitting(true)
    const { error } = await supabase.from('suggestions').insert({
      user_id: userId,
      content,
      target,
    })

    if (error) {
      toast.error('Erro ao enviar sugestão')
    } else {
      toast.success('Sugestão enviada com sucesso!')
      setContent('')
      // Refresh list (só as do próprio utilizador, como na página)
      const { data } = await supabase
        .from('suggestions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      setSuggestions(data || [])
    }
    setSubmitting(false)
  }

  const readCount = suggestions.filter(s => s.is_read).length

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="space-y-10 lg:col-span-7">
        {/* ── Nova mensagem ───────────────────────────────────── */}
        <section className="rounded-[1.75rem] bg-white p-6 shadow-md shadow-blue-950/5 ring-1 ring-stone-200 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-md">
              <Lightbulb className="h-5 w-5" />
            </span>
            <div>
              <h2 className={`${D} text-2xl font-extrabold leading-tight text-blue-950`}>Nova Mensagem</h2>
              <p className="mt-0.5 text-sm text-stone-500">
                Escolhe o destinatário e escreve o que sentes. A tua honestidade é valorizada.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <fieldset className="space-y-2.5">
              <legend className="mb-2.5 text-xs font-extrabold uppercase tracking-wider text-stone-400">Destinatário</legend>
              <div role="radiogroup" aria-label="Destinatário" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {TARGETS.map((t) => {
                  const selected = target === t.value
                  const Icon = t.icon
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTarget(t.value)}
                      className={`relative flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-left ring-2 ring-inset transition-all ${
                        selected ? t.active : 'bg-stone-50 text-stone-600 ring-stone-200 hover:ring-stone-300'
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${selected ? t.iconClass : 'bg-stone-300'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold leading-tight">{t.label}</span>
                        <span className="mt-0.5 block text-xs text-stone-500">{t.description}</span>
                      </span>
                      {selected && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-emerald-500" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="space-y-2.5">
              <Label htmlFor="content" className="text-xs font-extrabold uppercase tracking-wider text-stone-400">A tua mensagem</Label>
              <Textarea
                id="content"
                placeholder="Escreve aqui o que tens a dizer... Sê específico se possível!"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[170px] rounded-2xl border-stone-200 bg-stone-50 p-4 text-base leading-relaxed focus-visible:border-yellow-400 focus-visible:ring-yellow-400/40"
                required
              />
              <p className="text-right text-xs font-semibold text-stone-400">{content.length} caracteres</p>
            </div>

            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="group flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-yellow-400 text-lg font-extrabold text-blue-950 shadow-[0_14px_30px_-12px_rgba(250,204,21,.8)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {submitting ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> A enviar...</>
              ) : (
                <><Send className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /> Enviar Mensagem</>
              )}
            </button>
          </form>
        </section>

        {/* ── Histórico ───────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className={`${D} text-2xl font-extrabold text-blue-950`}>Histórico</h2>
            <span className="rounded-full bg-blue-950 px-2.5 py-0.5 text-xs font-extrabold text-yellow-300">{suggestions.length}</span>
            {suggestions.length > 0 && (
              <span className="text-sm font-semibold text-stone-400">
                · {readCount} {readCount === 1 ? 'lida' : 'lidas'}
              </span>
            )}
          </div>

          {suggestions.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {suggestions.map((s) => (
                <article
                  key={s.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                      s.target === 'dirigente' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {s.target === 'dirigente' ? <Users className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                      {s.target === 'dirigente' ? 'Dirigente' : 'Coordenação'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-semibold text-stone-400">
                        {new Date(s.created_at).toLocaleDateString('pt-PT')}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteSuggestion(s.id)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-stone-300 transition-all hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                        aria-label="Apagar sugestão"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="relative mb-4 mt-3 line-clamp-4 flex-1 pl-4 text-sm font-medium leading-relaxed text-stone-600">
                    <span aria-hidden className={`${D} absolute -left-0.5 -top-2 text-3xl leading-none text-yellow-400`}>“</span>
                    {s.content}
                  </p>

                  <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                    {s.is_read ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Lida
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-amber-600">
                        <Clock className="h-3.5 w-3.5" /> Pendente
                      </span>
                    )}
                    {s.points_awarded && (
                      <span className="rotate-2 rounded-lg bg-yellow-400 px-2 py-1 text-[10px] font-extrabold text-blue-950 shadow-sm">
                        RECOMPENSA 🎉
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.75rem] border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center">
              <div className="mx-auto flex h-16 w-16 -rotate-6 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-md">
                <MessageSquare className="h-8 w-8" />
              </div>
              <p className={`${D} mt-5 text-xl font-extrabold text-blue-950`}>Ainda não partilhaste nada.</p>
              <p className="mt-1 text-sm text-stone-500">As tuas mensagens aparecerão aqui.</p>
            </div>
          )}
        </section>
      </div>

      {/* ── Lateral ─────────────────────────────────────────── */}
      <aside className="space-y-5 lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-blue-950 p-6 text-white shadow-xl shadow-blue-950/20 sm:p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: 'radial-gradient(60% 50% at 100% 0%, rgba(139,92,246,.35), transparent 70%)' }}
          />
          <div className="relative">
            <h3 className={`${D} flex items-center gap-2.5 text-2xl font-extrabold`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                <CheckCircle2 className="h-5 w-5 text-yellow-300" />
              </span>
              Como funciona?
            </h3>
            <p className="mt-4 leading-relaxed text-blue-100/85">
              Este espaço foi criado para ouvirmos o que tens a dizer. Podes dar ideias de atividades, reportar algo ou fazer sugestões.
            </p>

            <p className="mt-6 text-[11px] font-extrabold uppercase tracking-widest text-blue-300">Opções de Privacidade</p>
            <div className="mt-3 space-y-3">
              <div className="flex gap-3 rounded-2xl bg-white/[0.06] p-3.5 ring-1 ring-inset ring-white/10">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold">Para o Dirigente</p>
                  <p className="text-xs text-blue-100/70">O teu dirigente lê e responde. A coordenação também tem acesso.</p>
                </div>
              </div>
              <div className="flex gap-3 rounded-2xl bg-white/[0.06] p-3.5 ring-1 ring-inset ring-white/10">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold">Apenas Coordenação</p>
                  <p className="text-xs text-blue-100/70">Mensagem restrita apenas aos coordenadores superiores do clube.</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-3 rounded-2xl bg-yellow-400 p-4 text-blue-950">
              <Trophy className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest">Recompensas</p>
                <p className="mt-1 text-sm font-medium text-blue-950/80">
                  Sabias? Sugestões construtivas e bem fundamentadas podem valer pontos de XP e Ouro para o teu perfil!
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 rounded-[1.75rem] bg-white p-5 ring-1 ring-stone-200">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            <AlertCircle className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-blue-950">Precisa de ajuda urgente?</h3>
            <p className="mt-1 text-sm leading-relaxed text-stone-500">
              Se tens um assunto urgente ou confidencial que requer resposta imediata, fala diretamente com um dirigente ou coordenador no final da reunião.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
