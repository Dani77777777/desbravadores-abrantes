import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'
import { ShoppingBag, Coins, Trophy, Sparkles } from 'lucide-react'
import { ProductGrid } from '@/components/shop/ProductGrid'
import type { GoldRateInfo } from '@/lib/store-economy'

export default async function ShopPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // A loja é pública: visitantes podem comprar (pagam em dinheiro, sem desconto Gold).
  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    profile = data
  }

  const [{ data: products }, { data: keyStock }, { data: rateData }] = await Promise.all([
    supabase
      .from('store_products')
      .select('*')
      .eq('is_active', true)
      .order('price_eur', { ascending: true }),
    supabase.from('digital_key_stock').select('*'),
    supabase.rpc('get_gold_rate_info'),
  ])

  const rateInfo = (rateData || null) as GoldRateInfo | null
  const goldRate = rateInfo?.gold_per_euro || 100

  const stockByProduct: Record<string, number> = {}
  for (const row of keyStock || []) stockByProduct[row.product_id] = row.available

  const productsWithKeys = (products || []).map(p => ({
    ...p,
    available_keys: stockByProduct[p.id] ?? 0,
  }))

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-blue-900" /> Loja dos Desbravadores
            </h1>
            <p className="text-gray-600">
              Aberta a todos! Membros registados podem usar o seu Gold para obter descontos.
            </p>
          </div>

          {profile ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-indigo-50 border border-indigo-100 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-sm">
                <div className="p-2 bg-indigo-100 rounded-full text-indigo-700">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-indigo-800 font-black uppercase">O teu Nível</p>
                  <p className="text-xl font-black text-indigo-900">{Math.floor((profile.total_xp || 0) / 1000)}</p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-100 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-sm">
                <div className="p-2 bg-yellow-100 rounded-full text-yellow-700">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-yellow-800 font-black uppercase">O teu Gold</p>
                  <p className="text-xl font-black text-yellow-900">{profile.current_gold}</p>
                  <p className="text-[10px] text-yellow-700 font-bold">1 € de desconto ≈ {goldRate} 🪙</p>
                </div>
              </div>
            </div>
          ) : (
            <Link
              href="/login?mode=signup"
              className="group bg-gradient-to-r from-indigo-600 to-blue-700 text-white px-5 py-4 rounded-2xl shadow-md flex items-center gap-3 hover:shadow-lg transition-all"
            >
              <div className="p-2 bg-white/15 rounded-full">
                <Sparkles className="w-5 h-5 text-yellow-300" />
              </div>
              <div>
                <p className="font-bold leading-tight">És desbravador? Regista-te!</p>
                <p className="text-xs text-blue-100">Usa o teu Gold para descontos e desbloqueia artigos por nível.</p>
              </div>
            </Link>
          )}
        </div>

        <ProductGrid
          products={productsWithKeys}
          userProfile={profile}
          goldRate={goldRate}
        />
      </main>
    </div>
  )
}
