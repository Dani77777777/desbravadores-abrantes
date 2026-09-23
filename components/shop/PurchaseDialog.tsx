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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Coins, CheckCircle2, Copy, Key, AlertCircle, User, Banknote } from 'lucide-react'
import { formatEur, goldCostFor, userMaxDiscountEur } from '@/lib/store-economy'

interface PurchaseDialogProps {
  product: any
  userProfile: any | null
  goldRate: number
  disabled?: boolean
  reason?: string
}

export function PurchaseDialog({ product, userProfile, goldRate, disabled, reason }: PurchaseDialogProps) {
  const supabase = createClient()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [guestName, setGuestName] = useState('')
  const [discount, setDiscount] = useState(0)

  const isGuest = !userProfile
  const priceEur = product.price_eur || 0
  // Limite do slider: o máximo do artigo, cortado pelo Gold que o membro tem.
  const maxDisc = isGuest ? 0 : userMaxDiscountEur(product, userProfile.current_gold || 0, goldRate)
  const goldCost = goldCostFor(discount, goldRate)
  const amountDue = Math.max(0, Math.round((priceEur - discount) * 100) / 100)

  const handlePurchase = async () => {
    if (isGuest && guestName.trim().length < 3) {
      toast.error('Indica o teu nome para registar a compra.')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('process_purchase', {
        p_product_id: product.id,
        p_discount_eur: discount,
        p_buyer_name: isGuest ? guestName.trim() : null,
      })

      if (error) throw error

      if (data.success) {
        setResult(data)
        toast.success('Pedido registado!')
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
    setTimeout(() => {
      setResult(null)
      setDiscount(0)
      setGuestName('')
    }, 300)
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
          className="bg-blue-950 hover:bg-yellow-400 hover:text-blue-950 text-white font-extrabold rounded-full h-auto min-h-11 min-w-0 shrink whitespace-normal py-2 px-5 text-center leading-tight shadow-md transition-all active:scale-95 disabled:bg-stone-100 disabled:text-stone-400 disabled:shadow-none"
          disabled={disabled}
        >
          {reason || 'Comprar'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
        {!result ? (
          <>
            <DialogHeader className="items-center text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mb-2 shadow-sm">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <DialogTitle className="text-xl font-bold">Confirmar Compra</DialogTitle>
              <DialogDescription className="text-gray-500">
                {isGuest
                  ? 'O pagamento é feito em dinheiro, junto da direção do clube.'
                  : 'Podes usar o teu Gold para baixar o preço. O resto pagas em dinheiro.'}
              </DialogDescription>
            </DialogHeader>

            {isGuest && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                  <User className="w-3.5 h-3.5" /> O teu nome
                </Label>
                <Input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Nome completo de quem compra"
                  className="h-11 rounded-xl"
                  maxLength={80}
                />
                <p className="text-[10px] text-gray-400">
                  Não tens conta, por isso o pedido fica registado com o teu nome.
                </p>
              </div>
            )}

            {!isGuest && maxDisc > 0 && (
              <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-black uppercase text-yellow-800 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" /> Desconto com Gold
                  </Label>
                  <span className="text-[10px] font-bold text-yellow-700">1 € ≈ {goldRate} 🪙</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxDisc}
                  step={0.05}
                  value={discount}
                  onChange={e => setDiscount(Number(e.target.value))}
                  className="w-full h-2 accent-yellow-500 cursor-pointer"
                />
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-yellow-900">
                    −{formatEur(discount)}
                    {goldCost > 0 && <span className="text-yellow-700 font-medium"> ({goldCost} 🪙)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDiscount(maxDisc)}
                    className="font-black text-yellow-700 underline underline-offset-2"
                  >
                    Máx: −{formatEur(maxDisc)}
                  </button>
                </div>
                <p className="text-[10px] text-yellow-600">
                  Este artigo aceita até {product.max_discount_percent}% de desconto. Tens {userProfile.current_gold} 🪙.
                </p>
              </div>
            )}

            {!isGuest && maxDisc <= 0 && (product.max_discount_percent || 0) > 0 && (
              <div className="bg-stone-50 border border-stone-100 p-3 rounded-2xl text-[11px] text-gray-500 flex items-center gap-2">
                <Coins className="w-4 h-4 text-gray-400 shrink-0" />
                Ainda não tens Gold suficiente para aplicar desconto ({goldRate} 🪙 por cada 1 €). Participa nas atividades para ganhar mais!
              </div>
            )}

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 my-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-stone-400 uppercase">Artigo</span>
                <span className="text-xs font-bold text-blue-900">{product.type === 'digital' ? 'DIGITAL' : 'FÍSICO'}</span>
              </div>
              <p className="font-bold text-gray-900 text-lg mb-4">{product.name}</p>

              <div className="space-y-2 pt-3 border-t border-stone-200 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Preço</span>
                  <span className="font-bold text-gray-800">{formatEur(priceEur)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-yellow-700 flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> Desconto Gold</span>
                    <span className="font-bold text-yellow-700">−{formatEur(discount)} ({goldCost} 🪙)</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-stone-200">
                  <span className="font-bold text-gray-600 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-green-600" /> A pagar em dinheiro
                  </span>
                  <span className="text-xl font-black text-blue-900">{formatEur(amountDue)}</span>
                </div>
              </div>
            </div>

            <DialogFooter className="sm:flex-col gap-2">
              <Button
                onClick={handlePurchase}
                className="w-full bg-blue-900 hover:bg-black h-12 rounded-2xl font-bold shadow-lg"
                disabled={loading || (isGuest && guestName.trim().length < 3)}
              >
                {loading ? 'A processar...' : amountDue > 0 ? `Encomendar — ${formatEur(amountDue)} em dinheiro` : 'Confirmar (pago com Gold)'}
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
              <h3 className="text-2xl font-black text-gray-900">Pedido feito!</h3>
              <p className="text-gray-500">{result.message}</p>
            </div>

            {Number(result.amount_due_eur) > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-2xl py-4 px-5 text-center">
                <p className="text-[10px] font-black uppercase text-green-700 mb-1">Total a pagar em dinheiro</p>
                <p className="text-3xl font-black text-green-800">{formatEur(Number(result.amount_due_eur))}</p>
                {Number(result.gold_spent) > 0 && (
                  <p className="text-[11px] font-bold text-yellow-700 mt-1">
                    Já poupaste {formatEur(Number(result.discount_eur))} com {result.gold_spent} 🪙
                  </p>
                )}
              </div>
            )}

            {result.digital_key ? (
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">O teu Código de Ativação</Label>
                <div className="flex items-center gap-2 p-4 bg-purple-50 border border-purple-100 rounded-2xl">
                  <Key className="w-5 h-5 text-purple-600 shrink-0" />
                  <code className="flex-1 font-mono font-bold text-purple-900 text-lg tracking-wider break-all">
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
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl py-4 px-5">
                <div className="flex items-center gap-2 text-blue-900 font-bold mb-1">
                  <AlertCircle className="h-5 w-5 text-blue-600" />
                  <span>O que fazer agora?</span>
                </div>
                <div className="text-blue-800 text-sm">
                  {Number(result.amount_due_eur) > 0 ? (
                    <>Procura um elemento da <strong>direção</strong> para pagares{product.type === 'digital' ? ' e receberes a tua chave' : ' e levantares o artigo'}.</>
                  ) : (
                    <>A tua encomenda ficou registada. Dirige-te ao teu <strong>coordenador</strong> para levantar o artigo.</>
                  )}
                </div>
              </div>
            )}

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
