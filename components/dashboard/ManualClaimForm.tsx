'use client'

import { useState } from 'react'
import { claimManualReward } from '@/lib/actions/qr'
import { Button } from '@/components/ui/button'
import { Trophy, Loader2, AlertTriangle, Coins } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ManualClaimFormProps {
  qrCodeId: string
  xpReward: number
  goldReward: number
  maxUses?: number | null
  currentUses?: number
}

export function ManualClaimForm({ qrCodeId, xpReward, goldReward, maxUses, currentUses }: ManualClaimFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleClaim() {
    setLoading(true)
    setError(null)
    try {
      const result = await claimManualReward(qrCodeId)
      if (result.error) {
        setError(result.error)
        toast.error(result.error)
      } else {
        toast.success('Recompensa resgatada com sucesso!')
        router.refresh()
      }
    } catch (err) {
      setError('Ocorreu um erro ao processar o resgate.')
      toast.error('Ocorreu um erro ao processar o resgate.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-8 py-4 border-y border-gray-100">
        <div className="text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Recompensa</p>
          <div className="flex items-center gap-1.5 text-indigo-700 font-black text-2xl">
            <Trophy className="w-6 h-6" /> {xpReward} XP
          </div>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bónus</p>
          <div className="flex items-center gap-1.5 text-yellow-600 font-black text-2xl">
            <Coins className="w-6 h-6" /> {goldReward} Gold
          </div>
        </div>
      </div>

      {maxUses && (
        <p className="text-center text-xs text-gray-400">
          Disponível para os primeiros {maxUses} membros. ({currentUses} já resgataram)
        </p>
      )}

      {error ? (
        <div className="text-center p-6 bg-red-50 rounded-xl border border-red-100">
          <p className="text-red-600 font-medium flex items-center justify-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </p>
        </div>
      ) : (
        <Button 
          onClick={handleClaim} 
          disabled={loading}
          className="w-full bg-blue-800 hover:bg-blue-900 h-14 text-lg font-bold shadow-lg shadow-blue-900/10"
        >
          {loading ? (
            <>A processar... <Loader2 className="ml-2 w-5 h-5 animate-spin" /></>
          ) : (
            <>Receber Recompensa <Trophy className="ml-2 w-5 h-5" /></>
          )}
        </Button>
      )}
    </div>
  )
}
