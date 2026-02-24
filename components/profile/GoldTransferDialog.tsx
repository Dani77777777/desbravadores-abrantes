'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Coins, Search, Send, User as UserIcon } from 'lucide-react'
import { transferGoldAction } from '@/app/profile/actions'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  current_gold: number
  role: string
  section: string
}

interface GoldTransferDialogProps {
  currentUserId: string
  currentGold: number
}

export function GoldTransferDialog({ currentUserId, currentGold }: GoldTransferDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [amount, setAmount] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      fetchProfiles()
    }
  }, [open])

  async function fetchProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, current_gold, role, section')
      .order('full_name', { ascending: true })

    if (error) {
      toast.error('Erro ao procurar membros')
      return
    }

    // Filter out the current user
    setProfiles((data || []).filter(p => p.id !== currentUserId))
  }

  const filteredProfiles = profiles.filter(p => 
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const selectedProfile = profiles.find(p => p.id === selectedProfileId)

  async function handleTransfer() {
    const numAmount = parseInt(amount)
    
    if (!selectedProfileId) {
      toast.error('Por favor, seleciona um destinatário')
      return
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('O valor deve ser superior a zero')
      return
    }

    if (numAmount > currentGold) {
      toast.error('Saldo insuficiente')
      return
    }

    setLoading(true)
    try {
      const result = await transferGoldAction(selectedProfileId, numAmount)
      
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Enviado ${numAmount} 🪙 para ${selectedProfile?.full_name}`)
        setOpen(false)
        setAmount('')
        setSelectedProfileId(null)
      }
    } catch (err) {
      toast.error('Ocorreu um erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-yellow-300 text-yellow-800 hover:bg-yellow-100 flex items-center gap-1">
          <Send className="w-4 h-4" />
          Transferir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-yellow-600" />
            Transferir Gold
          </DialogTitle>
          <DialogDescription>
            Envia moedas de ouro para outro membro do clube.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Para quem?</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Procurar por nome..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="max-h-[200px] overflow-y-auto border rounded-md p-1 space-y-1 mt-2">
              {filteredProfiles.length > 0 ? (
                filteredProfiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfileId(p.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-sm text-left transition-colors ${
                      selectedProfileId === p.id 
                        ? 'bg-yellow-50 border-yellow-200 border' 
                        : 'hover:bg-stone-50 border border-transparent'
                    }`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={p.avatar_url || undefined} />
                      <AvatarFallback><UserIcon className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.full_name}</p>
                      <p className="text-[10px] text-gray-500 capitalize">{p.section} • {p.role}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-gray-500">
                  Nenhum membro encontrado.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="amount">Quantidade</Label>
              <span className="text-[10px] text-gray-500">Saldo disponível: {currentGold} 🪙</span>
            </div>
            <div className="relative">
              <Coins className="absolute left-2.5 top-2.5 h-4 w-4 text-yellow-600" />
              <Input
                id="amount"
                type="number"
                placeholder="0"
                className="pl-9"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max={currentGold}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="ghost" 
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleTransfer}
            disabled={loading || !selectedProfileId || !amount || parseInt(amount) <= 0 || parseInt(amount) > currentGold}
            className="bg-yellow-500 hover:bg-yellow-600 text-white"
          >
            {loading ? 'A enviar...' : 'Confirmar Envio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
