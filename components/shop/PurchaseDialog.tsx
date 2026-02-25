'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Coins, CheckCircle2, Copy, Key, AlertCircle } from 'lucide-react'

interface PurchaseDialogProps {
  product: any
  userProfile: any
  disabled?: boolean
  reason?: string
}

export function PurchaseDialog({ product, userProfile, disabled, reason }: PurchaseDialogProps) {
  const supabase = createClient()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handlePurchase = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('process_purchase', {
        p_product_id: product.id,
      })

      if (error) throw error

      if (data.success) {
        setResult(data)
        toast.success('Compra realizada!')
        router.refresh()
      } else {
        toast.error(data.error || 'Erro ao processar compra.')
        setIsOpen(false)
      }
    } catch (error: any) {
      toast.error(error.message || 'Ocorreu um erro inesperado.')
      setIsOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Código copiado!')
  }

  const resetAndClose = () => {
    setIsOpen(false)
    setTimeout(() => setResult(null), 300)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!loading) {
        if (!open) resetAndClose()
        else setIsOpen(true)
      }
    }}>
      <DialogTrigger asChild>
        <Button 
          className="bg-blue-900 hover:bg-black text-white rounded-2xl h-11 px-6 shadow-md transition-all active:scale-95 disabled:bg-gray-100 disabled:text-gray-400"
          disabled={disabled}
        >
          {reason || 'Comprar'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-3xl">
        {!result ? (
          <>
            <DialogHeader className="items-center text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mb-2 shadow-sm">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <DialogTitle className="text-xl font-bold">Confirmar Compra</DialogTitle>
              <DialogDescription className="text-gray-500">
                Estás prestes a trocar o teu Gold por este artigo.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 my-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-stone-400 uppercase">Artigo</span>
                <span className="text-xs font-bold text-blue-900">{product.type === 'digital' ? 'DIGITAL' : 'FÍSICO'}</span>
              </div>
              <p className="font-bold text-gray-900 text-lg mb-4">{product.name}</p>
              
              <div className="flex justify-between items-center pt-3 border-t border-stone-200">
                <span className="text-sm font-bold text-gray-600">Total a Pagar</span>
                <div className="flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-yellow-600" />
                  <span className="text-xl font-black text-blue-900">{product.price}</span>
                </div>
              </div>
            </div>

            <DialogFooter className="sm:flex-col gap-2">
              <Button 
                onClick={handlePurchase} 
                className="w-full bg-blue-900 hover:bg-black h-12 rounded-2xl font-bold shadow-lg"
                disabled={loading}
              >
                {loading ? 'A processar...' : 'Confirmar e Pagar'}
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setIsOpen(false)} 
                className="w-full h-11 rounded-2xl text-gray-500 font-medium"
                disabled={loading}
              >
                Cancelar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="py-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in duration-300">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-900">Parabéns!</h3>
              <p className="text-gray-500">{result.message}</p>
            </div>

            {product.type === 'digital' && result.digital_key ? (
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">O teu Código de Ativação</Label>
                <div className="flex items-center gap-2 p-4 bg-purple-50 border border-purple-100 rounded-2xl">
                  <Key className="w-5 h-5 text-purple-600 shrink-0" />
                  <code className="flex-1 font-mono font-bold text-purple-900 text-lg tracking-wider">
                    {result.digital_key}
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 text-purple-600 hover:bg-purple-100 rounded-xl"
                    onClick={() => copyToClipboard(result.digital_key)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-purple-400 text-center font-medium">
                  Guarda este código num sítio seguro!
                </p>
              </div>
            ) : product.type === 'physical' ? (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl py-4 px-5">
                <div className="flex items-center gap-2 text-blue-900 font-bold mb-1">
                  <AlertCircle className="h-5 w-5 text-blue-600" />
                  <span>O que fazer agora?</span>
                </div>
                <div className="text-blue-800 text-sm">
                  A tua encomenda foi registada com sucesso. Dirige-te ao teu <strong>coordenador</strong> para levantar o artigo.
                </div>
              </div>
            ) : null}

            <Button 
              onClick={resetAndClose} 
              className="w-full bg-gray-900 hover:bg-black h-12 rounded-2xl font-bold shadow-md"
            >
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
