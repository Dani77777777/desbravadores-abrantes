'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Package, ClipboardList, Coins, TrendingUp } from 'lucide-react'
import { ProductManagement } from './ProductManagement'
import { OrderManagement } from './OrderManagement'
import type { GoldRateInfo } from '@/lib/store-economy'

interface StorePanelProps {
  profile: any
  products: any[]
  initialPurchases: any[]
  members: any[]
  events: any[]
  rateInfo: GoldRateInfo | null
  settings: any | null
}

export function StorePanel({ profile, products, initialPurchases, members, events, rateInfo, settings }: StorePanelProps) {
  const supabase = createClient()
  const router = useRouter()
  const [ecoOpen, setEcoOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [baseRate, setBaseRate] = useState<number>(Number(settings?.base_gold_per_euro) || 100)
  const [refGold, setRefGold] = useState<number>(Number(settings?.reference_total_gold) || 10000)

  const goldRate = rateInfo?.gold_per_euro || 100
  const totalGold = Number(rateInfo?.total_gold) || 0

  const handleSaveEconomy = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase
        .from('store_settings')
        .upsert({ id: true, base_gold_per_euro: baseRate, reference_total_gold: refGold, updated_at: new Date().toISOString() })
      if (error) throw error
      toast.success('Economia atualizada!')
      setEcoOpen(false)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao guardar definições.')
    } finally {
      setSaving(false)
    }
  }

  const pendingCount = initialPurchases.filter(p => p.status === 'pending').length

  // Reservas ativas por artigo (reembolsadas/canceladas não contam).
  const reservationCounts: Record<string, number> = {}
  for (const p of initialPurchases) {
    if (p.status !== 'refunded') reservationCounts[p.product_id] = (reservationCounts[p.product_id] || 0) + 1
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-900" /> Gestão da Loja
          </h2>
          <p className="text-sm text-gray-500">
            Preços fixos em €. O Gold dá desconto a uma taxa dinâmica.
          </p>
        </div>

        <Dialog open={ecoOpen} onOpenChange={setEcoOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2 border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100">
              <Coins className="w-4 h-4" />
              <span className="font-black">1 € ≈ {goldRate} 🪙</span>
              <TrendingUp className="w-3.5 h-3.5 text-yellow-600" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-yellow-600" /> Economia do Gold
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveEconomy} className="space-y-4 py-2">
              <div className="rounded-xl border border-yellow-100 bg-yellow-50/50 p-3 space-y-1 text-xs text-gray-600">
                <p>Gold em circulação: <span className="font-black text-gray-900">{totalGold.toLocaleString()} 🪙</span></p>
                <p>Taxa atual: <span className="font-black text-yellow-700">1 € ≈ {goldRate} 🪙</span> (multiplicador ×{rateInfo?.multiplier ?? 1})</p>
                <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
                  A taxa ajusta-se sozinha: com mais Gold em circulação do que a referência, o desconto fica mais caro em Gold; com menos, fica mais barato (entre ×{Number(settings?.min_rate_multiplier) || 0.5} e ×{Number(settings?.max_rate_multiplier) || 3}).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Gold por 1 € (base)</Label>
                  <Input type="number" min={1} value={baseRate} onChange={e => setBaseRate(Number(e.target.value))} required />
                </div>
                <div className="space-y-2">
                  <Label>Gold de referência</Label>
                  <Input type="number" min={1} value={refGold} onChange={e => setRefGold(Number(e.target.value))} required />
                </div>
              </div>
              <p className="text-[10px] text-gray-400">
                Quando o Gold em circulação = referência, 1 € custa exatamente a base.
              </p>
              <DialogFooter>
                <Button type="submit" className="w-full bg-blue-800 hover:bg-blue-900" disabled={saving}>
                  {saving ? 'A guardar...' : 'Guardar Economia'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="bg-white border p-1 rounded-xl h-auto gap-1">
          <TabsTrigger
            value="products"
            className="rounded-lg data-[state=active]:bg-blue-900 data-[state=active]:text-white px-6 py-2"
          >
            <Package className="w-4 h-4 mr-2" /> Produtos
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="rounded-lg data-[state=active]:bg-blue-900 data-[state=active]:text-white px-6 py-2 flex items-center"
          >
            <ClipboardList className="w-4 h-4 mr-2" /> Encomendas
            {pendingCount > 0 && (
              <span className="ml-2 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          <ProductManagement products={products} profile={profile} members={members} events={events} goldRate={goldRate} reservationCounts={reservationCounts} />
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <OrderManagement initialPurchases={initialPurchases} profile={profile} products={products} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
