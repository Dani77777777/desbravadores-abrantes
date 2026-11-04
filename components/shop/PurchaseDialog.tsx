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
import { ShoppingBag, Coins, CheckCircle2, Copy, Key, AlertCircle, User, Banknote, CalendarClock, Minus, Plus, Undo2, BadgePercent } from 'lucide-react'
import { formatEur, goldCostFor, formatDeadline } from '@/lib/store-economy'
import { pricingFor, amountDueFor, nextVolumeTier, maxQuantityFor, toCents } from '@/lib/store-pricing'
import { addGuestOrder, removeGuestOrder } from '@/lib/guest-orders'

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
  const [cancelling, setCancelling] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [guestName, setGuestName] = useState('')
  const [discount, setDiscount] = useState(0)
  const [quantity, setQuantity] = useState(1)

  const isGuest = !userProfile
  const isPreorder = product.type === 'physical' && !!product.is_preorder
  const unitPrice = product.price_eur || 0
  // Até 10 unidades por encomenda (limite do servidor), cortado pelo stock; digitais sempre 1.
  const maxQty = maxQuantityFor(product)
  // Pré-visualização (o servidor recalcula tudo): desconto por quantidade e teto do Gold,
  // que nunca deixa o total abaixo do custo.
  const userGold = isGuest ? null : userProfile.current_gold || 0
  const pricing = pricingFor(product, quantity, userGold, goldRate)
  const priceEur = pricing.baseEur
  // Limite do slider: o teto do artigo, cortado pelo Gold que o membro tem.
  const maxDisc = pricing.userGoldMaxEur
  const nextTier = nextVolumeTier(product, quantity)

  const changeQuantity = (next: number) => {
    const qty = Math.max(1, Math.min(maxQty, next))
    setQuantity(qty)
    // Quem está a usar todo o Gold continua a usar todo; senão, não deixar o slider
    // acima do novo limite (o máximo muda com as unidades e o desconto por quantidade).
    const nextMax = pricingFor(product, qty, userGold, goldRate).userGoldMaxEur
    setDiscount(d => (d >= maxDisc ? nextMax : Math.min(d, nextMax)))
  }
  const goldCost = goldCostFor(discount, goldRate)
  const amountDue = amountDueFor(pricing, discount)
  // Desconto por usar (o Gold vem todo aplicado por defeito; avisamos se o membro o baixar).
  const unusedDiscount = toCents(maxDisc - discount)

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
        p_quantity: quantity,
      })

      if (error) throw error

      if (data.success) {
        if (data.cancel_token) addGuestOrder({ id: data.purchase_id, token: data.cancel_token })
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

  // Engano? Cancela logo: devolve o Gold, repõe o stock e apaga o registo.
  const handleCancel = async () => {
    if (!confirm('Cancelar este pedido? Foi engano e não o queres?')) return
    setCancelling(true)
    try {
      const { data, error } = await supabase.rpc('cancel_my_purchase', {
        p_purchase_id: result.purchase_id,
        p_cancel_token: result.cancel_token ?? null,
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Não foi possível cancelar.')
      removeGuestOrder(result.purchase_id)
      toast.success(Number(data.gold_returned) > 0 ? `Pedido cancelado. Recebeste de volta ${data.gold_returned} 🪙.` : 'Pedido cancelado.')
      resetAndClose()
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível cancelar.')
    } finally {
      setCancelling(false)
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
      setQuantity(1)
      setGuestName('')
    }, 300)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!loading && !cancelling) {
        if (!open) resetAndClose()
        else {
          // Por defeito usa todo o Gold possível.
          setDiscount(maxDisc)
          setIsOpen(true)
        }
      }
    }}>
      <DialogTrigger asChild>
        <Button
          className="bg-blue-950 hover:bg-yellow-400 hover:text-blue-950 text-white font-extrabold rounded-full h-auto min-h-11 min-w-0 shrink whitespace-normal py-2 px-5 text-center leading-tight shadow-md transition-all active:scale-95 disabled:bg-stone-100 disabled:text-stone-400 disabled:shadow-none"
          disabled={disabled}
        >
          {reason || (isPreorder ? 'Reservar' : 'Comprar')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
        {!result ? (
          <>
            <DialogHeader className="items-center text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mb-2 shadow-sm">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <DialogTitle className="text-xl font-bold">{isPreorder ? 'Confirmar Reserva' : 'Confirmar Compra'}</DialogTitle>
              <DialogDescription className="text-gray-500">
                {isGuest
                  ? 'Pagas em dinheiro a um coordenador do clube.'
                  : 'Podes usar o teu Gold para baixar o preço. O resto pagas em dinheiro a um coordenador do clube.'}
              </DialogDescription>
            </DialogHeader>

            {isPreorder && (
              <div className="bg-teal-50 border border-teal-100 p-3 rounded-2xl text-[11px] text-teal-800 flex items-start gap-2">
                <CalendarClock className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span>
                  Este artigo é <strong>por encomenda</strong>: a direção só o encomenda depois de fechar as reservas
                  {product.preorder_deadline ? <> (<strong>{formatDeadline(product.preorder_deadline)}</strong>)</> : null}.
                  Levantas o teu quando chegar.
                </span>
              </div>
            )}

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
                  {pricing.goldLimitedByCost
                    ? <>Aqui o Gold desconta até {formatEur(pricing.goldCapEur)} (não pode baixar o preço abaixo do custo).</>
                    : <>Este artigo aceita até {product.max_discount_percent}% de desconto.</>}{' '}
                  Tens {userProfile.current_gold} 🪙.
                </p>
              </div>
            )}

            {!isGuest && maxDisc > 0 && unusedDiscount > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-[11px] text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="flex-1">
                  {discount > 0 ? 'Não estás a usar todo o teu Gold.' : 'Não estás a usar Gold.'}{' '}
                  Podes poupar mais <strong>{formatEur(unusedDiscount)}</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => setDiscount(maxDisc)}
                  className="shrink-0 rounded-full bg-amber-500 px-3 py-1 font-black text-white hover:bg-amber-600"
                >
                  Usar
                </button>
              </div>
            )}

            {!isGuest && maxDisc <= 0 && pricing.goldCapEur > 0 && (
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
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="font-bold text-gray-900 text-lg min-w-0">{product.name}</p>
                {maxQty > 1 && (
                  <div className="flex items-center gap-1 shrink-0 rounded-full bg-white border border-stone-200 p-1 shadow-sm">
                    <button
                      type="button"
                      aria-label="Menos uma unidade"
                      onClick={() => changeQuantity(quantity - 1)}
                      disabled={quantity <= 1 || loading}
                      className="h-8 w-8 rounded-full flex items-center justify-center text-blue-900 hover:bg-blue-50 disabled:text-stone-300 disabled:hover:bg-transparent"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-6 text-center font-black text-blue-900 tabular-nums">{quantity}</span>
                    <button
                      type="button"
                      aria-label="Mais uma unidade"
                      onClick={() => changeQuantity(quantity + 1)}
                      disabled={quantity >= maxQty || loading}
                      className="h-8 w-8 rounded-full flex items-center justify-center text-blue-900 hover:bg-blue-50 disabled:text-stone-300 disabled:hover:bg-transparent"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {nextTier && (
                <p className="-mt-2 mb-3 text-[11px] font-semibold text-emerald-700">
                  Mais {nextTier.unitsMissing} {nextTier.unitsMissing === 1 ? 'unidade' : 'unidades'} para {nextTier.percent}% de desconto
                </p>
              )}

              <div className="space-y-2 pt-3 border-t border-stone-200 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">
                    Preço{quantity > 1 && <span className="text-gray-400"> ({quantity} × {formatEur(unitPrice)})</span>}
                  </span>
                  <span className="font-bold text-gray-800">{formatEur(priceEur)}</span>
                </div>
                {pricing.volumeEur > 0 && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-emerald-700 flex items-center gap-1">
                      <BadgePercent className="w-3.5 h-3.5 shrink-0" /> Desconto por quantidade (−{pricing.volumePercent}%)
                    </span>
                    <span className="font-bold text-emerald-700 shrink-0">−{formatEur(pricing.volumeEur)}</span>
                  </div>
                )}
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
                {loading
                  ? 'A processar...'
                  : amountDue > 0
                    ? `${isPreorder ? 'Reservar' : 'Encomendar'} — ${formatEur(amountDue)} em dinheiro`
                    : 'Confirmar (pago com Gold)'}
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
              <h3 className="text-2xl font-black text-gray-900">{isPreorder ? 'Reserva feita!' : 'Pedido feito!'}</h3>
              <p className="text-gray-500">{result.message}</p>
            </div>

            {Number(result.amount_due_eur) > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-2xl py-4 px-5 text-center">
                <p className="text-[10px] font-black uppercase text-green-700 mb-1">Total a pagar em dinheiro</p>
                <p className="text-3xl font-black text-green-800">{formatEur(Number(result.amount_due_eur))}</p>
                {result.payment_ref && (
                  <p className="mt-2 text-xs font-bold text-green-900">
                    Referência: <span className="font-mono text-sm">{result.payment_ref}</span>
                    <span className="block text-[10px] font-medium text-green-800/80">Diz esta referência ao coordenador quando pagares (ou escreve-a na descrição do MB Way).</span>
                  </p>
                )}
                {Number(result.volume_discount_eur) > 0 && (
                  <p className="text-[11px] font-bold text-emerald-700 mt-1">
                    Poupaste {formatEur(Number(result.volume_discount_eur))} pela quantidade (−{Number(result.volume_discount_percent)}%)
                  </p>
                )}
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
                  {isPreorder ? (
                    Number(result.amount_due_eur) > 0
                      ? <>Paga a um <strong>coordenador do clube</strong>. Quando o artigo chegar, levantas o teu com um coordenador.</>
                      : <>A tua reserva ficou registada. Quando o artigo chegar, levantas o teu com um <strong>coordenador do clube</strong>.</>
                  ) : Number(result.amount_due_eur) > 0 ? (
                    <>Paga a um <strong>coordenador do clube</strong>{product.type === 'digital' ? ' para receberes a tua chave' : ' para levantares o artigo'}.</>
                  ) : (
                    <>A tua encomenda ficou registada. Levanta o artigo com um <strong>coordenador do clube</strong>.</>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Button
                onClick={resetAndClose}
                className="w-full bg-gray-900 hover:bg-black h-12 rounded-2xl font-bold shadow-md"
                disabled={cancelling}
              >
                Fechar
              </Button>
              {/* Digital já pago = chave revelada: aí só a coordenação pode reembolsar. */}
              {!(product.type === 'digital' && result.paid) && (
                <Button
                  variant="ghost"
                  onClick={handleCancel}
                  className="w-full h-10 rounded-2xl text-red-600 hover:bg-red-50 hover:text-red-700 font-bold gap-1.5"
                  disabled={cancelling}
                >
                  <Undo2 className="w-4 h-4" /> {cancelling ? 'A cancelar...' : 'Foi engano? Cancelar pedido'}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
