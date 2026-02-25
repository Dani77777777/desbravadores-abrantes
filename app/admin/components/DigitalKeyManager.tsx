'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Key, Plus, Trash2, List } from 'lucide-react'

interface DigitalKeyManagerProps {
  productId: string
  productName: string
}

export function DigitalKeyManager({ productId, productName }: DigitalKeyManagerProps) {
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [keys, setKeys] = useState<any[]>([])
  const [newKeysText, setNewKeysText] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchKeys = async () => {
    const { data, error } = await supabase
      .from('digital_keys')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
    
    if (error) {
      toast.error('Erro ao carregar chaves.')
    } else {
      setKeys(data || [])
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchKeys()
    }
  }, [isOpen])

  const handleAddKeys = async (e: React.FormEvent) => {
    e.preventDefault()
    const keyLines = newKeysText.split('\n').map(k => k.trim()).filter(k => k !== '')
    if (keyLines.length === 0) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('digital_keys')
        .insert(keyLines.map(k => ({
          product_id: productId,
          key_value: k
        })))
      
      if (error) throw error
      
      toast.success(`${keyLines.length} chaves adicionadas com sucesso!`)
      setNewKeysText('')
      fetchKeys()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao adicionar chaves.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteKey = async (id: string) => {
    try {
      const { error } = await supabase.from('digital_keys').delete().eq('id', id)
      if (error) throw error
      setKeys(keys.filter(k => k.id !== id))
    } catch (error) {
      toast.error('Erro ao apagar chave.')
    }
  }

  const unusedCount = keys.filter(k => !k.is_used).length

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-purple-600 hover:bg-purple-50" title="Gerir Chaves">
          <Key className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerir Chaves: {productName}</DialogTitle>
          <p className="text-xs text-gray-500">
            {unusedCount} chaves disponíveis / {keys.length} total
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-gray-400">Adicionar em Lote</Label>
            <Textarea 
              placeholder="Cola aqui as chaves (uma por linha)..." 
              value={newKeysText}
              onChange={e => setNewKeysText(e.target.value)}
              rows={4}
              className="text-xs font-mono"
            />
            <Button 
              size="sm" 
              className="w-full bg-purple-600 hover:bg-purple-700 h-9" 
              onClick={handleAddKeys}
              disabled={loading || !newKeysText.trim()}
            >
              <Plus className="w-3 h-3 mr-1" /> Adicionar Chaves
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1">
              <List className="w-3 h-3" /> Chaves Atuais
            </Label>
            <div className="space-y-1.5">
              {keys.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Sem chaves registadas.</p>
              ) : (
                keys.map(k => (
                  <div key={k.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border text-[11px]">
                    <span className={`font-mono truncate max-w-[180px] ${k.is_used ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {k.key_value.length > 8 
                        ? `${k.key_value.slice(0, 3)}${'●'.repeat(k.key_value.length - 6)}${k.key_value.slice(-3)}` 
                        : k.key_value}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={k.is_used ? "secondary" : "outline"} className={`text-[9px] px-1 py-0 ${k.is_used ? 'bg-gray-200' : 'bg-green-50 text-green-700 border-green-100'}`}>
                        {k.is_used ? 'USADA' : 'LIVRE'}
                      </Badge>
                      {!k.is_used && (
                        <button onClick={() => handleDeleteKey(k.id)} className="text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={() => setIsOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
