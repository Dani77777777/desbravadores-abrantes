'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShoppingBag, Package, ClipboardList, Plus } from 'lucide-react'
import { ProductManagement } from './ProductManagement'
import { OrderManagement } from './OrderManagement'

interface StorePanelProps {
  profile: any
  products: any[]
  initialPurchases: any[]
}

export function StorePanel({ profile, products, initialPurchases }: StorePanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-900" /> Gestão da Loja
          </h2>
          <p className="text-sm text-gray-500">
            Gere os produtos disponíveis e as encomendas pendentes.
          </p>
        </div>
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
            {initialPurchases.filter(p => p.status === 'pending').length > 0 && (
              <span className="ml-2 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">
                {initialPurchases.filter(p => p.status === 'pending').length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          <ProductManagement products={products} profile={profile} />
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <OrderManagement initialPurchases={initialPurchases} profile={profile} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
