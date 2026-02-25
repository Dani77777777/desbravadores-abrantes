'use client'

import { useEffect, useState } from 'react'
import { redeemCode } from '@/lib/actions/qr'
import { CheckCircle2, RefreshCw, AlertTriangle, Trophy, Coins } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface AutoClaimHandlerProps {
  code: string
}

export function AutoClaimHandler({ code }: AutoClaimHandlerProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    async function claim() {
      try {
        const result = await redeemCode(code)
        if (result.error) {
          setStatus('error')
          setMessage(result.error)
        } else {
          setStatus('success')
          setMessage(result.message || 'Resgatado com sucesso!')
          setData(result.qrCode)
          toast.success(result.message || 'Pontos recebidos!')
        }
      } catch (err) {
        setStatus('error')
        setMessage('Erro inesperado ao processar o resgate.')
        console.error(err)
      }
    }
    claim()
  }, [code])

  if (status === 'loading') {
    return (
      <div className="py-20 text-center space-y-4 animate-in fade-in duration-500">
        <RefreshCw className="w-12 h-12 text-blue-200 animate-spin mx-auto" />
        <p className="text-slate-500 font-medium">A processar o teu código...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="py-12 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-gray-900">Não foi possível resgatar</h2>
          <p className="text-gray-600 px-8">{message}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Voltar ao Início</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-green-50/50 border border-green-100 rounded-2xl p-8 text-center space-y-6 animate-in zoom-in-95 duration-500">
      <div className="mx-auto w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner">
        <CheckCircle2 className="w-10 h-10" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-green-900 uppercase tracking-tighter">{message}</h2>
        <p className="text-green-700/80 mt-1 font-medium">Os teus pontos foram adicionados ao teu perfil.</p>
      </div>
      
      {data && (
        <div className="flex justify-center gap-10 pt-4">
          <div className="text-center group">
            <div className="flex items-center gap-2 text-indigo-700 font-black text-3xl transition-transform group-hover:scale-110">
              <Trophy className="w-7 h-7" /> +{data.xp_reward}
            </div>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1">XP ACUMULADO</p>
          </div>
          <div className="text-center group">
            <div className="flex items-center gap-2 text-yellow-600 font-black text-3xl transition-transform group-hover:scale-110">
              <Coins className="w-7 h-7" /> +{data.gold_reward}
            </div>
            <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest mt-1">GOLD RECEBIDO</p>
          </div>
        </div>
      )}

      <div className="pt-4">
        <Button asChild className="bg-green-600 hover:bg-green-700 text-white border-none shadow-lg">
          <Link href="/">Continuar a Aventura</Link>
        </Button>
      </div>
    </div>
  )
}
