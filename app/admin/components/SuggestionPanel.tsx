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
      toast.error('Erro ao atribuir pontos')
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
          <h2 className="text-lg font-semibold text-gray-800">Sugestões e Críticas</h2>
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
          className="flex items-center gap-2"
        >
          {showRead ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showRead ? 'Ocultar lidas' : 'Mostrar lidas'}
        </Button>
      </div>

      {filteredSuggestions.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredSuggestions.map((s) => (
            <Card key={s.id} className={`${s.is_read ? 'bg-gray-50 opacity-75' : 'bg-white border-blue-200'}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Badge variant={s.target === 'coordenador' ? 'destructive' : 'secondary'} className="capitalize">
                      Para: {s.target}
                    </Badge>
                    {!s.is_read && (
                      <Badge className="bg-blue-600">Nova</Badge>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(s.created_at).toLocaleString('pt-PT')}
                  </span>
                </div>
                <CardTitle className="text-sm font-bold mt-2">
                  {s.profiles?.full_name || 'Membro'} • {s.profiles?.section || 'Sem secção'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.content}</p>
                {!s.is_read && (
                  <div className="mt-4 flex justify-end">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                      onClick={() => markAsRead(s.id)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Marcar como lido
                    </Button>
                  </div>
                )}
                
                {profile.role === 'coordenador' && !s.points_awarded && (
                  <div className="mt-4 pt-4 border-t border-gray-100 bg-stone-50/50 -mx-6 px-6 -mb-6 pb-6 rounded-b-lg">
                    <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                      <Trophy className="w-3 h-3" /> Atribuir Recompensa
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-gray-400">XP</Label>
                        <Input 
                          type="number" 
                          value={xpAmount} 
                          onChange={(e) => setXpAmount(parseInt(e.target.value) || 0)}
                          className="h-8 w-20 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-gray-400">Gold</Label>
                        <Input 
                          type="number" 
                          value={goldAmount} 
                          onChange={(e) => setGoldAmount(parseInt(e.target.value) || 0)}
                          className="h-8 w-20 text-xs"
                        />
                      </div>
                      <Button 
                        size="sm" 
                        className="h-8 bg-yellow-600 hover:bg-yellow-700 text-xs"
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
                  </div>
                )}

                {(s.is_read || s.points_awarded) && (
                    <div className="mt-4 flex items-center gap-3 justify-end">
                        {s.points_awarded && (
                           <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200 gap-1">
                               <Trophy className="w-2.5 h-2.5" /> Recompensada
                           </Badge>
                        )}
                        {s.is_read && (
                            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                                <CheckCircle2 className="w-4 h-4" />
                                Lida
                            </div>
                        )}
                    </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed flex flex-col items-center justify-center p-12 text-center text-gray-500 bg-transparent">
          <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-lg font-medium">Sem sugestões para mostrar.</p>
          <p className="text-sm mt-1">
            {showRead ? 'Ainda não foram recebidas sugestões.' : 'Todas as sugestões foram lidas!'}
          </p>
        </Card>
      )}
    </div>
  )
}
