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
import { Loader2, MessageSquare, Send, CheckCircle2, Clock, Trash2 } from 'lucide-react'
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-blue-700" />
            Sugestões e Críticas
          </h1>
          <p className="text-gray-600 mt-1">
            A tua opinião é importante para melhorarmos o nosso clube.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Nova Sugestão / Crítica</CardTitle>
                <CardDescription>
                  Podes mandar para o teu dirigente (que também será visto pela coordenação) ou apenas para a coordenação.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <Label htmlFor="target">Para quem pretendes enviar?</Label>
                    <Select value={target} onValueChange={setTarget}>
                      <SelectTrigger id="target">
                        <SelectValue placeholder="Selecione o destinatário" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dirigente">Dirigente da Unidade (também visível pela Coordenação)</SelectItem>
                        <SelectItem value="coordenador">Apenas para a Coordenação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="content">Mensagem</Label>
                    <Textarea
                      id="content"
                      placeholder="Escreve aqui a tua sugestão ou crítica..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={5}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full bg-blue-700 hover:bg-blue-800" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        A enviar...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Enviar Sugestão
                      </>
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">As Minhas Sugestões Anteriores</h2>
              {suggestions.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.map((s) => (
                    <Card key={s.id} className="bg-white">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                            <Badge variant="outline" className="capitalize">
                                Para: {s.target === 'dirigente' ? 'Dirigente' : 'Coordenação'}
                            </Badge>
                            <span className="text-xs text-gray-400">
                                {new Date(s.created_at).toLocaleDateString('pt-PT')}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-gray-400 hover:text-red-500"
                              onClick={() => deleteSuggestion(s.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-sm text-gray-700 mb-3">{s.content}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          {s.is_read ? (
                            <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                              <CheckCircle2 className="w-4 h-4" />
                              Lido pela liderança
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-amber-500 text-xs font-medium">
                              <Clock className="w-4 h-4" />
                              A aguardar leitura
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-dashed flex flex-col items-center justify-center p-8 text-center text-gray-500 bg-transparent">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                    <p>Ainda não fizeste nenhuma sugestão.</p>
                </Card>
              )}
            </div>
          </div>

          <Card className="h-fit bg-blue-50 border-blue-100">
            <CardHeader>
              <CardTitle className="text-blue-900 text-lg flex items-center gap-2">
                  <Badge className="bg-blue-700">Explicação</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-blue-800 space-y-4">
              <p>
                Este espaço foi criado para ouvirmos o que tens a dizer. Podes dar ideias de atividades, reportar algo que não gostaste ou fazer sugestões de melhoria.
              </p>
              <div className="space-y-2">
                <p className="font-semibold">Privacidade:</p>
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Dirigente:</strong> A mensagem será lida pelo teu dirigente de unidade e pela coordenação geral.</li>
                    <li><strong>Coordenação:</strong> A mensagem será lida <strong>apenas</strong> pela coordenação geral do clube.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
