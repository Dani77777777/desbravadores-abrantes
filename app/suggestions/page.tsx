'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner'
import { Loader2, MessageSquare, Send, CheckCircle2, Clock, Trash2, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function SuggestionsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [content, setContent] = useState('')
  const [target, setTarget] = useState('dirigente')

  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(profile)

        const { data: suggestions } = await supabase
          .from('suggestions')
          .select('*')
          .order('created_at', { ascending: false })
        setSuggestions(suggestions || [])
      }
      setLoading(false)
    }
    loadData()
  }, [])

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
      user_id: user.id,
      content,
      target,
    })

    if (error) {
      toast.error('Erro ao enviar sugestão')
    } else {
      toast.success('Sugestão enviada com sucesso!')
      setContent('')
      // Refresh list
      const { data } = await supabase
        .from('suggestions')
        .select('*')
        .order('created_at', { ascending: false })
      setSuggestions(data || [])
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-black text-gray-900 flex items-center justify-center sm:justify-start gap-3">
            <div className="p-2.5 bg-blue-800 rounded-2xl shadow-lg shadow-blue-100">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            Sugestões e Críticas
          </h1>
          <p className="text-gray-500 mt-3 text-lg font-medium max-w-2xl">
            A tua voz ajuda-nos a construir um clube melhor. Partilha as tuas ideias ou preocupações de forma segura.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 space-y-10">
            <Card className="border-none shadow-xl shadow-blue-900/5 rounded-3xl overflow-hidden">
              <CardHeader className="bg-white pb-2">
                <CardTitle className="text-xl font-black text-slate-800">Nova Mensagem</CardTitle>
                <CardDescription className="text-slate-500 font-medium leading-relaxed">
                  Escolhe o destinatário e escreve o que sentes. A tua honestidade é valorizada.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-6 pt-4">
                  <div className="space-y-3">
                    <Label htmlFor="target" className="text-xs font-black uppercase text-slate-400 tracking-wider">Destinatário</Label>
                    <Select value={target} onValueChange={setTarget}>
                      <SelectTrigger id="target" className="h-12 border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50">
                        <SelectValue placeholder="Selecione o destinatário" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="dirigente" className="py-3">
                          <div className="flex flex-col">
                            <span className="font-bold">Dirigente da Classe</span>
                            <span className="text-[10px] text-slate-400">Visível para o teu dirigente e para a coordenação</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="coordenador" className="py-3">
                          <div className="flex flex-col">
                            <span className="font-bold">Apenas Coordenação</span>
                            <span className="text-[10px] text-slate-400">Mensagem privada lida apenas pelos coordenadores</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="content" className="text-xs font-black uppercase text-slate-400 tracking-wider">A tua mensagem</Label>
                    <Textarea
                      id="content"
                      placeholder="Escreve aqui o que tens a dizer... Sê específico se possível!"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[160px] border-slate-200 rounded-2xl focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50 p-4 leading-relaxed"
                      required
                    />
                    <p className="text-[10px] text-slate-400 text-right font-medium">{content.length} caracteres</p>
                  </div>
                </CardContent>
                <CardFooter className="pb-8">
                  <Button type="submit" className="w-full bg-blue-800 hover:bg-blue-900 h-14 text-lg font-black rounded-2xl shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        A enviar...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-5 w-5" />
                        Enviar Mensagem
                      </>
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <div className="space-y-6">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                 Histórico
                 <Badge variant="secondary" className="bg-slate-200 text-slate-600 rounded-full font-black px-2">{suggestions.length}</Badge>
              </h2>
              {suggestions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {suggestions.map((s) => (
                    <Card key={s.id} className="border-none shadow-sm bg-white rounded-2xl hover:shadow-md transition-all group overflow-hidden">
                      <div className={`h-1.5 w-full ${s.is_read ? 'bg-green-500' : 'bg-amber-400'}`} />
                      <CardContent className="p-4 pt-3">
                        <div className="flex justify-between items-start mb-3">
                            <Badge className={`text-[9px] font-black uppercase tracking-widest rounded-md ${s.target === 'dirigente' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'}`}>
                                {s.target === 'dirigente' ? 'Dirigente' : 'Coordenação'}
                            </Badge>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-300">
                                  {new Date(s.created_at).toLocaleDateString('pt-PT')}
                              </span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-slate-200 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                                onClick={() => deleteSuggestion(s.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 mb-4 line-clamp-3 italic font-medium">"{s.content}"</p>
                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
                          {s.is_read ? (
                            <div className="flex items-center gap-1.5 text-green-600 text-[10px] font-black uppercase tracking-tighter">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Lida
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-amber-500 text-[10px] font-black uppercase tracking-tighter">
                              <Clock className="w-3.5 h-3.5" />
                              Pendente
                            </div>
                          )}
                          {s.points_awarded && (
                             <Badge className="bg-yellow-100 text-yellow-700 border-none text-[9px] font-black rounded-md px-1.5">
                                RECOMPENSA 🎉
                             </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-12 text-center text-slate-300 bg-white rounded-3xl">
                    <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-lg font-black">Ainda não partilhaste nada.</p>
                    <p className="text-sm font-medium">As tuas mensagens aparecerão aqui.</p>
                </Card>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <Card className="h-fit bg-gradient-to-br from-blue-900 to-blue-800 border-none rounded-3xl overflow-hidden shadow-xl shadow-blue-900/20 text-white">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-black flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-700/50 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-blue-200" />
                  </div>
                  Como funciona?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-blue-100 font-medium leading-relaxed">
                  Este espaço foi criado para ouvirmos o que tens a dizer. Podes dar ideias de atividades, reportar algo ou fazer sugestões.
                </p>
                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <p className="font-black text-xs uppercase tracking-widest text-blue-300 mb-2">Opções de Privacidade</p>
                    <div className="space-y-3">
                       <div className="flex gap-3">
                          <div className="h-5 w-5 rounded-full bg-blue-500/30 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                          <div>
                            <p className="text-sm font-bold">Para o Dirigente</p>
                            <p className="text-xs text-blue-100/70">O teu dirigente lê e responde. A coordenação também tem acesso.</p>
                          </div>
                       </div>
                       <div className="flex gap-3">
                          <div className="h-5 w-5 rounded-full bg-rose-500/30 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                          <div>
                            <p className="text-sm font-bold">Apenas Coordenação</p>
                            <p className="text-xs text-blue-100/70">Mensagem restrita apenas aos coordenadores superiores do clube.</p>
                          </div>
                       </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-yellow-400/10 rounded-2xl border border-yellow-400/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Trophy className="w-4 h-4 text-yellow-400" />
                      <p className="font-black text-xs uppercase tracking-widest text-yellow-400">Recompensas</p>
                    </div>
                    <p className="text-xs text-blue-50/80 font-medium italic">
                      Sabias? Sugestões construtivas e bem fundamentadas podem valer pontos de XP e Ouro para o teu perfil! 
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="bg-slate-200/50 p-6 rounded-3xl border border-slate-200">
               <h3 className="text-slate-800 font-black text-sm uppercase tracking-widest mb-2">Precisa de ajuda urgente?</h3>
               <p className="text-slate-500 text-xs font-medium leading-relaxed">
                 Se tens um assunto urgente ou confidencial que requer resposta imediata, fala diretamente com um dirigente ou coordenador no final da reunião.
               </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
