import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { redirect } from 'next/navigation'
import { ShoppingBag, Coins, Trophy } from 'lucide-react'
import { ProductGrid } from '@/components/shop/ProductGrid'

export default async function ShopPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/')

  // Fetch only active products with their available keys count
  const { data: products } = await supabase
    .from('store_products')
    .select('*, digital_keys(count)')
    .eq('is_active', true)
    .eq('digital_keys.is_used', false)
    .order('price', { ascending: true })

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-blue-900" /> Loja de Gold
            </h1>
            <p className="text-gray-600">
              Troca o teu Gold acumulado por artigos exclusivos e recompensas.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="bg-indigo-50 border border-indigo-100 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-sm">
              <div className="p-2 bg-indigo-100 rounded-full text-indigo-700">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] text-indigo-800 font-black uppercase">O teu Nível</p>
                <p className="text-2xl font-black text-indigo-900">{Math.floor((profile.total_xp || 0) / 1000) + 1}</p>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-100 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-sm">
              <div className="p-2 bg-yellow-100 rounded-full text-yellow-700">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] text-yellow-800 font-black uppercase">O teu Saldo</p>
                <p className="text-2xl font-black text-yellow-900">{profile.current_gold}</p>
              </div>
            </div>
          </div>
        </div>

        <ProductGrid 
          products={products || []} 
          userProfile={profile} 
        />
      </main>
    </div>
  )
}
