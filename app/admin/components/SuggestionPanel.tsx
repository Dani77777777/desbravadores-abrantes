'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, MessageSquare, Clock, Eye, EyeOff, Trophy, Coins } from 'lucide-react'

interface SuggestionPanelProps {
  profile: any
  initialSuggestions: any[]
}

export function SuggestionPanel({ profile, initialSuggestions }: SuggestionPanelProps) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [loading, setLoading] = useState(false)
  const [showRead, setShowRead] = useState(false)
  const [rewardLoading, setRewardLoading] = useState<string | null>(null)
  
  // Reward states
  const [xpAmount, setXpAmount] = useState<number>(50)
  const [goldAmount, setGoldAmount] = useState<number>(10)

  const supabase = createClient()

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from('suggestions')
      .update({ is_read: true })
      .eq('id', id)

    if (error) {
      toast.error('Erro ao marcar como lido')
    } else {
      setSuggestions(suggestions.map(s => s.id === id ? { ...s, is_read: true } : s))
      toast.success('Sugestão marcada como lida')
    }
  }

  const giveReward = async (suggestion: any) => {
    setRewardLoading(suggestion.id)
    
    // 1. Insert into points_log
    const { error: logError } = await supabase
      .from('points_log')
      .insert({
        target_user_id: suggestion.user_id,
        awarded_by_user_id: profile.id,
        amount_xp: xpAmount,
        amount_gold: goldAmount,
        description: `Recompensa por sugestão/crítica: "${suggestion.content.substring(0, 30)}..."`
      })

    if (logError) {
      toast.error(logError.message || 'Erro ao atribuir pontos')
      setRewardLoading(null)
      return
    }

    // 2. Update suggestion
    const { error: sugError } = await supabase
      .from('suggestions')
      .update({ 
        points_awarded: true,
        is_read: true 
      })
      .eq('id', suggestion.id)

    if (sugError) {
      toast.error('Pontos atribuídos, mas erro ao atualizar sugestão')
    } else {
      toast.success('Recompensa atribuída com sucesso!')
      setSuggestions(suggestions.map(s => 
        s.id === suggestion.id ? { ...s, points_awarded: true, is_read: true } : s
      ))
    }
    
    setRewardLoading(null)
  }

  const filteredSuggestions = suggestions.filter(s => showRead ? true : !s.is_read)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
             <MessageSquare className="w-5 h-5 text-blue-800" />
             Sugestões e Críticas
          </h2>
          <p className="text-sm text-gray-500">
            {profile.role === 'coordenador' 
              ? 'Todas as sugestões enviadas ao clube.' 
              : 'Sugestões enviadas para a tua classe.'}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowRead(!showRead)}
          className="flex items-center gap-2 h-10 px-4 rounded-xl border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
        >
          {showRead ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showRead ? 'Ocultar Lidas' : 'Mostrar Lidas'}
        </Button>
      </div>

      {filteredSuggestions.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredSuggestions.map((s) => (
            <Card key={s.id} className={`overflow-hidden transition-all duration-300 ${s.is_read ? 'bg-slate-50/50 border-slate-100 opacity-80' : 'bg-white border-blue-100 shadow-sm hover:shadow-md'}`}>
              <CardHeader className="pb-3 border-b border-slate-50">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`font-black text-[10px] uppercase tracking-wider rounded-md ${s.target === 'coordenador' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-700'}`}>
                      Para: {s.target}
                    </Badge>
                    {!s.is_read && (
                      <Badge className="bg-blue-800 text-white font-black text-[10px] uppercase tracking-wider">Nova</Badge>
                    )}
                    {s.points_awarded && (
                      <Badge className="bg-yellow-50 text-yellow-700 border-none font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> Recompensada
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-slate-100 px-2 py-0.5 rounded-full">
                    {new Date(s.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 text-xs font-black">
                      {s.profiles?.full_name?.charAt(0).toUpperCase()}
                   </div>
                   <div>
                      <CardTitle className="text-sm font-bold text-slate-800">
                        {s.profiles?.full_name || 'Membro'}
                      </CardTitle>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{s.profiles?.section || 'Sem secção'}</p>
                   </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed italic">"{s.content}"</p>
                </div>
                
                <div className="mt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  {profile.role === 'coordenador' && !s.points_awarded ? (
                    <div className="w-full sm:w-auto flex flex-wrap items-end gap-3 p-4 bg-yellow-50/50 rounded-2xl border border-yellow-100">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-yellow-700 uppercase">XP</Label>
                        <Input 
                          type="number" 
                          value={xpAmount} 
                          onChange={(e) => setXpAmount(parseInt(e.target.value) || 0)}
                          className="h-8 w-20 text-xs border-yellow-200 focus-visible:ring-yellow-400 rounded-lg"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-yellow-700 uppercase">Gold</Label>
                        <Input 
                          type="number" 
                          value={goldAmount} 
                          onChange={(e) => setGoldAmount(parseInt(e.target.value) || 0)}
                          className="h-8 w-20 text-xs border-yellow-200 focus-visible:ring-yellow-400 rounded-lg"
                        />
                      </div>
                      <Button 
                        size="sm" 
                        className="h-8 bg-yellow-600 hover:bg-yellow-700 text-xs font-bold px-4 rounded-lg shadow-sm shadow-yellow-200 ml-auto sm:ml-0"
                        disabled={rewardLoading === s.id}
                        onClick={() => giveReward(s)}
                      >
                        {rewardLoading === s.id ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Coins className="w-3 h-3 mr-1" />
                        )}
                        Dar Recompensa
                      </Button>
                    </div>
                  ) : <div />}

                  {!s.is_read ? (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="w-full sm:w-auto text-blue-700 hover:text-white hover:bg-blue-800 font-bold text-xs h-9 rounded-xl transition-all"
                      onClick={() => markAsRead(s.id)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Marcar como Lido
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 font-black uppercase tracking-wider ml-auto">
                        <CheckCircle2 className="w-4 h-4" />
                        Lida
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-16 text-center text-slate-400 bg-white rounded-3xl">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 opacity-20" />
          </div>
          <p className="text-xl font-black text-slate-300">Sem sugestões</p>
          <p className="text-sm mt-1 font-medium">
            {showRead ? 'Ainda não foram recebidas sugestões.' : 'Todas as sugestões foram lidas! 🎉'}
          </p>
        </Card>
      )}
    </div>
  )
}
