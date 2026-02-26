'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, QrCode, Trash2, Trophy, Coins, ExternalLink, RefreshCw, Clock, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function QrPanel({ profile }: { profile: any }) {
  const isCoordenador = profile?.role === 'coordenador'
  const supabase = createClient()
  const [codes, setCodes] = useState<any[]>([])
  const [scans, setScans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [content, setContent] = useState('')
  const [xpReward, setXpReward] = useState(10)
  const [goldReward, setGoldReward] = useState(0)
  const [autoClaim, setAutoClaim] = useState(true)
  const [maxUsesGlobal, setMaxUsesGlobal] = useState<string>('')
  const [creating, setCreating] = useState(false)

  const fetchData = async () => {
    try {
      const { data: codesData } = await supabase.from('qr_codes').select('*').order('created_at', { ascending: false })
      const { data: scansData } = await supabase
        .from('qr_scans')
        .select(`
          *,
          profiles (full_name, avatar_url),
          qr_codes (title)
        `)
        .order('created_at', { ascending: false })
        .limit(20)

      setCodes(codesData || [])
      setScans(scansData || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Real-time subscription
    const channelName = `qr-scans-${Math.random().toString(36).substring(7)}`
    const scanSubscription = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'qr_scans' 
        }, 
        async (payload) => {
          console.log('Realtime insert received:', payload)
          
          // Buscar dados completos com joins
          const { data: fullScan, error } = await supabase
            .from('qr_scans')
            .select('*, profiles(full_name, avatar_url), qr_codes(title)')
            .eq('id', payload.new.id)
            .single()
          
          if (error) {
            console.error('Error fetching full scan data:', error)
            // Fallback: tentar buscar apenas o scan sem joins se falhar por RLS
            const { data: simpleScan } = await supabase
              .from('qr_scans')
              .select('*, qr_codes(title)')
              .eq('id', payload.new.id)
              .single()
            if (simpleScan) {
              setScans(prev => [simpleScan, ...prev].slice(0, 20))
            }
          } else if (fullScan) {
            setScans(prev => [fullScan, ...prev].slice(0, 20))
            toast.info(`Novo resgate: ${fullScan.profiles?.full_name || 'Desconhecido'}`)
          }
        }
      )
      .subscribe((status) => {
        console.log(`Realtime subscription status (${channelName}):`, status)
      })

    return () => {
      console.log('Cleaning up realtime subscription')
      supabase.removeChannel(scanSubscription)
    }
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCoordenador) {
      toast.error('Apenas coordenadores podem criar códigos.')
      return
    }
    setCreating(true)
    try {
      const { error } = await supabase.from('qr_codes').insert({
        title,
        code: code.toUpperCase(),
        content: content || null,
        xp_reward: xpReward,
        gold_reward: goldReward,
        auto_claim: autoClaim,
        max_uses_global: maxUsesGlobal ? parseInt(maxUsesGlobal) : null
      })

      if (error) throw error
      toast.success('Código criado com sucesso!')
      setIsCreateOpen(false)
      resetForm()
      fetchData()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar código.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!isCoordenador) {
      toast.error('Apenas coordenadores podem eliminar códigos.')
      return
    }
    if (!confirm('Eliminar este código?')) return
    const { error } = await supabase.from('qr_codes').delete().eq('id', id)
    if (error) toast.error('Erro ao eliminar.')
    else {
      toast.success('Código eliminado.')
      fetchData()
    }
  }

  const resetForm = () => {
    setTitle('')
    setCode('')
    setContent('')
    setXpReward(10)
    setGoldReward(0)
    setAutoClaim(true)
    setMaxUsesGlobal('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Questões e QRs Dinâmicos</h2>
          <p className="text-sm text-gray-500">Gere códigos curtos para competições ou pistas.</p>
        </div>
        {isCoordenador && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-800 hover:bg-blue-900 gap-2">
                <Plus className="w-4 h-4" /> Novo Código
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Criar Novo Código</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título do Código (Admin)</Label>
                    <Input id="title" placeholder="Ex: Pista 1" value={title} onChange={e => setTitle(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Código Curto</Label>
                    <Input id="code" placeholder="Ex: ARVORE01" value={code} onChange={e => setCode(e.target.value)} required className="uppercase font-mono" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Conteúdo (Se Auto-Claim OFF)</Label>
                  <Textarea id="content" placeholder="A próxima pista está..." value={content} onChange={e => setContent(e.target.value)} rows={3} />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Trophy className="w-3 h-3 text-indigo-500" /> XP</Label>
                    <Input type="number" value={xpReward} onChange={e => setXpReward(parseInt(e.target.value))} min={0} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Coins className="w-3 h-3 text-yellow-500" /> GOLD</Label>
                    <Input type="number" value={goldReward} onChange={e => setGoldReward(parseInt(e.target.value))} min={0} />
                  </div>
                  <div className="space-y-2">
                    <Label>Limite Global</Label>
                    <Input type="number" placeholder="Ilimitado" value={maxUsesGlobal} onChange={e => setMaxUsesGlobal(e.target.value)} min={1} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border">
                  <div className="space-y-0.5 text-left">
                    <Label className="text-base font-bold">Atribuição Automática</Label>
                    <p className="text-[10px] text-slate-500 leading-tight">ON: Ganha pontos na hora, conteúdo escondido.<br/>OFF: Vê conteúdo, precisa clicar para ganhar.</p>
                  </div>
                  <Switch checked={autoClaim} onCheckedChange={setAutoClaim} />
                </div>

                <DialogFooter>
                  <Button type="submit" className="w-full bg-blue-800" disabled={creating}>
                    {creating ? 'A criar...' : 'Criar Código'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
             <div className="col-span-full flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-blue-200" /></div>
          ) : codes.length === 0 ? (
             <p className="col-span-full text-center py-12 text-slate-400 border-2 border-dashed rounded-2xl">Nenhum código configurado.</p>
          ) : (
            codes.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow group">
                <CardContent className="p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors truncate">{c.title}</h3>
                      <p className="text-xs font-mono text-slate-400 mt-0.5 font-bold uppercase tracking-widest">{c.code}</p>
                    </div>
                    {isCoordenador && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500 shrink-0" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="flex gap-3">
                     <span className="flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                       <Trophy className="w-3 h-3" /> {c.xp_reward} XP
                     </span>
                     <span className="flex items-center gap-1 text-[10px] font-black text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">
                       <Coins className="w-3 h-3" /> {c.gold_reward}
                     </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-[10px] font-medium text-slate-400">
                    <span className="flex items-center gap-1">
                      {c.auto_claim ? <Badge className="bg-green-100 text-green-700 border-none h-4 px-1 text-[8px]">AUTO</Badge> : <Badge className="bg-amber-100 text-amber-700 border-none h-4 px-1 text-[8px]">MANUAL</Badge>}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {c.max_uses_global || '∞'} total
                    </span>
                  </div>

                  <Button asChild size="sm" variant="outline" className="w-full gap-2 text-[10px] border-slate-100 h-8">
                    <a href={`/codes/${c.code}`} target="_blank" rel="noreferrer">
                      Ver Página <ExternalLink className="w-3 h-3" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Real-time Feed Side */}
        <div className="space-y-4">
           <h3 className="text-sm font-bold text-gray-500 flex items-center gap-2 px-1">
             <Clock className="w-4 h-4" /> Feed de Resgates
           </h3>
           <div className="space-y-2">
             {scans.map(s => (
               <div key={s.id} className="flex items-center gap-3 p-2.5 bg-white border rounded-lg shadow-sm animate-in fade-in slide-in-from-right-2 duration-300">
                 <Avatar className="h-7 w-7 border shadow-sm shrink-0">
                   <AvatarImage src={s.profiles?.avatar_url} className="object-cover" />
                   <AvatarFallback className="bg-blue-600 text-white text-[10px]">{s.profiles?.full_name?.charAt(0)}</AvatarFallback>
                 </Avatar>
                 <div className="flex-1 min-w-0">
                   <p className="text-[10px] font-bold text-gray-900 truncate">{s.profiles?.full_name}</p>
                   <p className="text-[9px] text-slate-400 truncate">{s.qr_codes?.title}</p>
                 </div>
                 <div className="text-[9px] text-slate-300 font-medium shrink-0">
                    {new Date(s.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                 </div>
               </div>
             ))}
             {scans.length === 0 && (
               <div className="text-center py-8 text-slate-300 text-[10px] italic">Sem resgates recentes.</div>
             )}
           </div>
        </div>
      </div>
    </div>
  )
}
