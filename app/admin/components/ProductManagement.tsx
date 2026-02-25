'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Plus, Edit, Trash2, Key, Image as ImageIcon, Package, Check, ShoppingBag } from 'lucide-react'
import { DigitalKeyManager } from './DigitalKeyManager'

interface ProductManagementProps {
  products: any[]
  profile: any
}

const SECTION_OPTIONS = [
  { value: 'rebentos', label: 'Rebentos' },
  { value: 'ticoes', label: 'Tições' },
  { value: 'exploradores', label: 'Exploradores' },
  { value: 'companheiros', label: 'Companheiros' },
  { value: 'embaixadores', label: 'Embaixadores' },
]

export function ProductManagement({ products, profile }: ProductManagementProps) {
  const supabase = createClient()
  const router = useRouter()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  
  // Form State
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState(0)
  const [type, setType] = useState<'physical' | 'digital'>('physical')
  const [stock, setStock] = useState(0)
  const [imageUrl, setImageUrl] = useState('')
  const [restrictions, setRestrictions] = useState<string[]>([])
  const [minLevel, setMinLevel] = useState(0)
  const [loading, setLoading] = useState(false)

  const resetForm = () => {
    setName('')
    setDescription('')
    setPrice(0)
    setType('physical')
    setStock(0)
    setImageUrl('')
    setRestrictions([])
    setMinLevel(0)
    setEditingProduct(null)
  }

  const handleEdit = (product: any) => {
    setEditingProduct(product)
    setName(product.name)
    setDescription(product.description || '')
    setPrice(product.price)
    setType(product.type)
    setStock(product.stock)
    setImageUrl(product.image_url || '')
    setRestrictions(product.restrictions || [])
    setMinLevel(product.min_level || 0)
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const productData = {
        name,
        description,
        price,
        type,
        stock: type === 'digital' ? 0 : stock,
        image_url: imageUrl || null,
        restrictions,
        min_level: minLevel,
        is_active: true
      }

      if (editingProduct) {
        const { error } = await supabase
          .from('store_products')
          .update(productData)
          .eq('id', editingProduct.id)
        if (error) throw error
        toast.success('Produto atualizado com sucesso!')
      } else {
        const { error } = await supabase
          .from('store_products')
          .insert(productData)
        if (error) throw error
        toast.success('Produto criado com sucesso!')
      }

      setIsDialogOpen(false)
      resetForm()
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao guardar produto.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem a certeza que deseja apagar este produto?')) return
    try {
      const { error } = await supabase.from('store_products').delete().eq('id', id)
      if (error) throw error
      toast.success('Produto apagado.')
      router.refresh()
    } catch (error: any) {
      toast.error('Erro ao apagar produto.')
    }
  }

  const toggleRestriction = (section: string) => {
    setRestrictions(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-800 hover:bg-blue-900 gap-2">
              <Plus className="w-4 h-4" /> Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Editar Produto' : 'Adicionar Novo Produto'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Nome do Produto</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Manual do Explorador" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Descrição</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição do produto..." />
                </div>
                <div className="space-y-2 text-indigo-700">
                  <Label>Preço (Gold)</Label>
                  <Input type="number" min={0} value={price} onChange={e => setPrice(Number(e.target.value))} required />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={(val: any) => setType(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Físico</SelectItem>
                      <SelectItem value="digital">Digital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {type === 'physical' && (
                  <div className="space-y-2">
                    <Label>Stock Atual</Label>
                    <Input type="number" min={0} value={stock} onChange={e => setStock(Number(e.target.value))} />
                  </div>
                )}
                <div className="space-y-2 col-span-2">
                  <Label>URL da Imagem (Opcional)</Label>
                  <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://exemplo.com/imagem.jpg" />
                </div>
                <div className="space-y-2">
                  <Label>Nível Mínimo (0 = Livre)</Label>
                  <Input type="number" min={0} value={minLevel} onChange={e => setMinLevel(Number(e.target.value))} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Restrições de Secção (Vazio = Todos)</Label>
                  <div className="flex flex-wrap gap-2 pt-1 font-bold">
                    {SECTION_OPTIONS.map(opt => (
                      <Badge 
                        key={opt.value}
                        variant={restrictions.includes(opt.value) ? "default" : "outline"}
                        className={`cursor-pointer px-3 py-1.5 ${restrictions.includes(opt.value) ? 'bg-blue-900 border-none' : 'text-gray-500 hover:bg-gray-100'}`}
                        onClick={() => toggleRestriction(opt.value)}
                      >
                        {opt.label}
                        {restrictions.includes(opt.value) && <Check className="w-3 h-3 ml-1" />}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full bg-blue-800 hover:bg-blue-900" disabled={loading}>
                  {loading ? 'A guardar...' : editingProduct ? 'Atualizar Produto' : 'Criar Produto'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {products.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-xl bg-gray-50/50">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Nenhum produto registado.</p>
          </div>
        ) : (
          products.map(product => (
            <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="flex items-center p-4 gap-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-8 h-8 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-gray-900 truncate">{product.name}</h4>
                      <Badge variant="outline" className={`text-[10px] font-black uppercase ${product.type === 'digital' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                        {product.type === 'digital' ? 'Digital' : 'Físico'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-black text-blue-900 flex items-center gap-1">
                         {product.price} 🪙
                      </span>
                      {product.type === 'physical' && (
                        <span className={`font-bold flex items-center gap-1 ${product.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          • Stock: {product.stock}
                        </span>
                      )}
                      {product.restrictions && product.restrictions.length > 0 && (
                        <span className="text-gray-400 font-bold truncate">• {product.restrictions.join(', ')}</span>
                      )}
                      {product.min_level > 1 && (
                        <span className="text-indigo-600 font-bold">• Nível {product.min_level}+</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {product.type === 'digital' && (
                      <DigitalKeyManager productId={product.id} productName={product.name} />
                    )}
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => handleEdit(product)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(product.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
