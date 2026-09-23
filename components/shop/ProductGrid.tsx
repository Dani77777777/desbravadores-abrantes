'use client'

import { useState } from 'react'
import { ProductCard } from './ProductCard'
import { ShoppingBag, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface ProductGridProps {
  products: any[]
  userProfile: any | null
  goldRate: number
}

export function ProductGrid({ products, userProfile, goldRate }: ProductGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine' | 'physical' | 'digital'>('all')

  const filteredProducts = products.filter(product => {
    // 1. Search filter
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase()))

    if (!matchesSearch) return false

    // 2. Section restrictions filter (convidados não pertencem a nenhuma secção)
    const isRestricted = product.restrictions && product.restrictions.length > 0
    const canSee = !isRestricted || (userProfile && (product.restrictions.includes(userProfile.section) || userProfile.role === 'coordenador'))

    if (!canSee) return false

    // 3. Category filter
    if (filter === 'mine' && isRestricted && !product.restrictions.includes(userProfile?.section)) return false
    if (filter === 'physical' && product.type !== 'physical') return false
    if (filter === 'digital' && product.type !== 'digital') return false

    return true
  })

  // Count relevant for user
  const relevantProducts = products.filter(p => !p.restrictions || p.restrictions.length === 0 || (userProfile && p.restrictions.includes(userProfile.section))).length

  const filters: { key: typeof filter; label: string; show: boolean }[] = [
    { key: 'all', label: `Todos (${products.length})`, show: true },
    { key: 'mine', label: `Para a minha Classe (${relevantProducts})`, show: !!userProfile },
    { key: 'physical', label: 'Físicos', show: true },
    { key: 'digital', label: 'Digitais', show: true },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-stretch justify-between gap-4 rounded-[1.75rem] bg-white p-3 shadow-xl shadow-blue-950/10 ring-1 ring-stone-200 md:flex-row md:items-center">
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
          {filters.filter(f => f.show).map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 cursor-pointer rounded-full px-4 py-2.5 text-sm font-bold transition-all ${
                filter === f.key
                  ? 'bg-blue-950 text-white shadow-md'
                  : 'text-stone-500 hover:bg-stone-100 hover:text-blue-950'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Procurar artigos..."
            className="h-11 rounded-full border-stone-200 bg-stone-50 pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="rounded-[2rem] border-2 border-dashed border-stone-200 bg-white py-20 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 -rotate-6 items-center justify-center rounded-3xl bg-yellow-400 text-blue-950 shadow-lg">
            <ShoppingBag className="h-10 w-10" />
          </div>
          <p className="text-lg font-bold text-blue-950">Nenhum produto encontrado.</p>
          <p className="text-sm text-stone-500">Tenta ajustar os filtros ou pesquisar outra coisa.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              userProfile={userProfile}
              goldRate={goldRate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
