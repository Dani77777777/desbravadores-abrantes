'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { KeyRound, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

export function CodeEntryDialog() {
  const [code, setCode] = useState('')
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) {
      toast.error('Insere um código válido.')
      return
    }
    
    // Redirecionar para a página do código
    setOpen(false)
    router.push(`/codes/${code.trim().toUpperCase()}`)
    setCode('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full mt-4 flex items-center gap-2 border-dashed border-2 hover:border-blue-500 hover:bg-blue-50 text-gray-600 hover:text-blue-700 h-12 transition-all"
        >
          <KeyRound className="w-4 h-4" />
          Inserir Código Manual
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-700" />
            Inserir Código
          </DialogTitle>
          <DialogDescription>
            Encontraste um código num QR ou pista? Insere-o aqui para resgatar a tua recompensa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Input 
              placeholder="Ex: CAÇA01" 
              value={code} 
              onChange={(e) => setCode(e.target.value)}
              className="text-center font-bold tracking-widest uppercase h-12 text-lg"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full bg-blue-800 hover:bg-blue-900 h-11">
              Continuar <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
