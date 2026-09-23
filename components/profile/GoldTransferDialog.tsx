'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Coins, Loader2, Search, Send, User as UserIcon, X } from 'lucide-react'
import { transferGoldAction } from '@/app/profile/actions'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { displayFont } from '@/components/landing/fonts'

const D = displayFont.className

const SECTION_DOTS: Record<string, string> = {
  rebentos: 'bg-emerald-500',
  ticoes: 'bg-red-700',
  exploradores: 'bg-yellow-500',
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500',
}

const QUICK_AMOUNTS = [10, 25, 50, 100]

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
  /** Substitui o estilo do botão que abre o diálogo. */
  triggerClassName?: string
}

export function GoldTransferDialog({ currentUserId, currentGold, triggerClassName }: GoldTransferDialogProps) {
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

  const numAmount = parseInt(amount)
  const validAmount = !isNaN(numAmount) && numAmount > 0
  const tooMuch = validAmount && numAmount > currentGold
  const canSend = !!selectedProfileId && validAmount && !tooMuch && !loading

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
        setSearch('')
      }
    } catch (err) {
      toast.error('Ocorreu um erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  const initial = (name?: string) => name?.trim().charAt(0).toUpperCase() || <UserIcon className="h-4 w-4" />

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!loading) setOpen(value) }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={triggerClassName ?? 'border-yellow-300 text-yellow-800 hover:bg-yellow-100 flex items-center gap-1'}>
          <Send className="w-4 h-4" />
          Transferir
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto rounded-[1.75rem] border-none p-0 sm:max-w-md">
        {/* Cabeçalho amarelo com o saldo */}
        <div className="relative overflow-hidden bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 px-6 pb-6 pt-7 text-blue-950">
          <Coins aria-hidden className="absolute -bottom-6 -right-4 h-32 w-32 rotate-12 text-amber-700/15" />
          <DialogHeader className="relative text-left">
            <div className="flex h-12 w-12 -rotate-6 items-center justify-center rounded-2xl bg-blue-950 text-yellow-300 shadow-lg">
              <Send className="h-6 w-6" />
            </div>
            <DialogTitle className={`${D} mt-3 text-3xl font-extrabold leading-none`}>Transferir Gold</DialogTitle>
            <DialogDescription className="text-blue-950/70">
              Envia moedas de ouro para outro membro do clube.
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-blue-950/10 px-3.5 py-1.5 text-sm font-bold">
            <Coins className="h-4 w-4" /> O teu saldo: <span className={`${D} text-base font-extrabold`}>{currentGold}</span>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* 1. Para quem */}
          <div className="space-y-2.5">
            <p className="flex items-center gap-2 text-sm font-extrabold text-blue-950">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-950 text-[11px] text-yellow-300">1</span>
              Para quem?
            </p>

            {selectedProfile ? (
              <div className="flex items-center gap-3 rounded-2xl bg-yellow-50 p-3 ring-2 ring-yellow-400">
                <Avatar className="h-11 w-11 ring-2 ring-white">
                  <AvatarImage src={selectedProfile.avatar_url || undefined} className="object-cover" />
                  <AvatarFallback className="bg-blue-700 font-bold text-white">{initial(selectedProfile.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-blue-950">{selectedProfile.full_name}</p>
                  <p className="flex items-center gap-1.5 text-xs capitalize text-stone-500">
                    <span className={`h-2 w-2 rounded-full ${SECTION_DOTS[selectedProfile.section] || 'bg-stone-400'}`} />
                    {selectedProfile.section} • {selectedProfile.role}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProfileId(null)}
                  disabled={loading}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-yellow-100 hover:text-blue-950"
                  aria-label="Escolher outra pessoa"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    placeholder="Procurar por nome..."
                    className="h-11 rounded-xl border-stone-200 bg-stone-50 pl-10 focus-visible:border-yellow-400 focus-visible:ring-yellow-400/40"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="max-h-[220px] space-y-1 overflow-y-auto rounded-2xl bg-stone-50 p-1.5 ring-1 ring-inset ring-stone-200">
                  {filteredProfiles.length > 0 ? (
                    filteredProfiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProfileId(p.id)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white hover:shadow-sm"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={p.avatar_url || undefined} className="object-cover" />
                          <AvatarFallback className="bg-blue-700 text-sm font-bold text-white">{initial(p.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-blue-950">{p.full_name}</p>
                          <p className="flex items-center gap-1.5 text-[11px] capitalize text-stone-500">
                            <span className={`h-1.5 w-1.5 rounded-full ${SECTION_DOTS[p.section] || 'bg-stone-400'}`} />
                            {p.section} • {p.role}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-6 text-center text-sm text-stone-500">
                      {profiles.length === 0 ? 'A carregar membros...' : 'Nenhum membro encontrado.'}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 2. Quanto */}
          <div className="space-y-2.5">
            <p className="flex items-center gap-2 text-sm font-extrabold text-blue-950">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-950 text-[11px] text-yellow-300">2</span>
              Quanto?
            </p>

            <div className={`flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-2 ring-2 ring-inset transition-colors focus-within:ring-yellow-400 ${tooMuch ? 'ring-red-300' : 'ring-stone-200'}`}>
              <Coins className="h-7 w-7 shrink-0 text-amber-500" />
              <input
                id="amount"
                type="number"
                inputMode="numeric"
                placeholder="0"
                className={`${D} w-full min-w-0 bg-transparent text-4xl font-extrabold text-blue-950 outline-none placeholder:text-stone-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max={currentGold}
                disabled={loading}
              />
              <span className="text-sm font-bold text-stone-400">Gold</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.filter((q) => q <= currentGold).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  disabled={loading}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    numAmount === q ? 'bg-blue-950 text-yellow-300' : 'bg-stone-100 text-stone-600 hover:bg-yellow-100 hover:text-blue-950'
                  }`}
                >
                  {q}
                </button>
              ))}
              {currentGold > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(currentGold))}
                  disabled={loading}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    numAmount === currentGold ? 'bg-blue-950 text-yellow-300' : 'bg-stone-100 text-stone-600 hover:bg-yellow-100 hover:text-blue-950'
                  }`}
                >
                  Tudo
                </button>
              )}
            </div>

            <p className={`text-xs font-semibold ${tooMuch ? 'text-red-500' : 'text-stone-400'}`}>
              {tooMuch
                ? `Só tens ${currentGold} Gold disponíveis.`
                : validAmount
                  ? `Depois do envio ficas com ${currentGold - numAmount} Gold.`
                  : `Saldo disponível: ${currentGold} Gold.`}
            </p>
          </div>

          {/* Enviar */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="cursor-pointer rounded-2xl px-5 py-3.5 font-bold text-stone-500 transition-colors hover:bg-stone-100 hover:text-blue-950 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleTransfer}
              disabled={!canSend}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-5 py-3.5 font-extrabold text-blue-950 shadow-[0_12px_28px_-12px_rgba(250,204,21,.8)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> A enviar...</>
              ) : canSend ? (
                <><Check className="h-5 w-5" /> Enviar {numAmount} para {selectedProfile?.full_name.split(' ')[0]}</>
              ) : (
                'Confirmar Envio'
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
