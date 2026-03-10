'use client'

import { useState } from 'react'
import { submitQuestAnswer } from '@/lib/actions/qr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { HelpCircle, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import { Trophy, Coins } from 'lucide-react'

interface QuestQuestionFormProps {
  qrCodeId: string
  questionText: string
  xpReward: number
  goldReward: number
  alreadyRedeemed: boolean
}

export function QuestQuestionForm({ 
  qrCodeId, 
  questionText, 
  xpReward, 
  goldReward,
  alreadyRedeemed: initialAlreadyRedeemed 
}: QuestQuestionFormProps) {
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(initialAlreadyRedeemed)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!answer.trim()) return

    setLoading(true)
    try {
      const result = await submitQuestAnswer(qrCodeId, answer)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.message || 'Resposta correta!')
        setIsSuccess(true)
      }
    } catch (err) {
      toast.error('Ocorreu um erro ao submeter a resposta.')
    } finally {
      setLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-green-900">Questão Resolvida!</h2>
          <p className="text-green-700/80 font-medium">Acertaste na resposta e garantiste a tua recompensa.</p>
        </div>
        
        <div className="flex justify-center gap-8 pt-2">
          <div className="flex items-center gap-2 text-indigo-700 font-bold">
            <Trophy className="w-5 h-5" /> +{xpReward} XP
          </div>
          <div className="flex items-center gap-2 text-yellow-600 font-bold">
            <Coins className="w-5 h-5" /> +{goldReward} Gold
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-blue-600 p-4 flex items-center gap-3 text-white">
        <HelpCircle className="w-5 h-5" />
        <h3 className="font-bold uppercase tracking-tight text-sm">Desafio de Texto</h3>
      </div>
      
      <div className="p-6 space-y-6">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 italic text-slate-700 leading-relaxed whitespace-pre-wrap">
          {questionText}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="answer" className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
              A tua resposta
            </label>
            <Input 
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Escreve aqui a tua resposta..."
              className="h-12 border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-xl"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl gap-2 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
            disabled={loading || !answer.trim()}
          >
            {loading ? 'A validar...' : (
              <>
                Submeter Resposta <Send className="w-4 h-4" />
              </>
            )}
          </Button>

          <p className="text-[10px] text-slate-400 text-center px-4">
            Dica: A resposta não é sensível a maiúsculas ou acentos, mas certifica-te de que a ortografia está correta.
          </p>
        </form>
      </div>
    </div>
  )
}
