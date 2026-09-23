'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateProfile } from './actions'
import { User, Calendar, ArrowRight, Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { displayFont } from '@/components/landing/fonts'
import { AvatarPicker, type AvatarChoice } from '@/components/profile/AvatarPicker'
import { uploadAvatar, discardUploadedAvatar } from '@/utils/avatar-upload'
import { createClient } from '@/utils/supabase/client'

const D = displayFont.className

const SELECT_CLASS =
  'flex h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-stone-50 px-2.5 text-base text-blue-950 transition-colors focus-visible:border-yellow-400 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-yellow-400/40 invalid:text-stone-400 disabled:cursor-not-allowed disabled:opacity-50'

const INPUT_CLASS =
  'h-12 rounded-xl border-stone-200 bg-stone-50 pl-12 text-base focus-visible:border-yellow-400 focus-visible:ring-yellow-400/40'

export default function OnboardingPage() {
  const [fullName, setFullName] = useState('')
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [avatar, setAvatar] = useState<AvatarChoice>({ file: null, url: '' })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 100 }, (_, i) => (currentYear - i).toString())
  const months = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' }
  ]
  const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!day || !month || !year) {
      toast.error('Por favor, seleciona a data de nascimento completa.')
      return
    }

    const birthDateFormatted = `${year}-${month}-${day}`
    setLoading(true)

    // A foto do telemóvel só vai para o bucket agora; se a gravação falhar, é apagada outra vez.
    let uploadedUrl: string | null = null
    let userId: string | null = null
    try {
      if (avatar.file) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Sessão expirada. Entra outra vez.')
        userId = user.id
        uploadedUrl = await uploadAvatar(supabase, user.id, avatar.file)
      }

      const result = await updateProfile({
        fullName,
        birthDate: birthDateFormatted,
        avatarUrl: (uploadedUrl ?? avatar.url.trim()) || undefined
      })

      if (result.error) {
        if (uploadedUrl && userId) await discardUploadedAvatar(supabase, userId, uploadedUrl)
        toast.error(result.error)
      } else {
        toast.success('Perfil criado com sucesso!')
        router.push('/')
        router.refresh()
      }
    } catch (error: any) {
      console.error('Error updating profile:', error)
      if (uploadedUrl && userId) await discardUploadedAvatar(supabase, userId, uploadedUrl).catch(() => {})
      toast.error('Erro ao guardar: ' + (error?.message || 'tenta novamente.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      showBackLink={false}
      asideTitle={<>Quase <span className="text-yellow-400">lá!</span></>}
      asideText="Só falta completares o teu perfil para entrares no clube, ganhares XP e apareceres no ranking."
    >
      <div className="lp-rise rounded-[2rem] bg-white p-6 shadow-2xl shadow-black/30 sm:p-8" style={{ '--d': '100ms' } as React.CSSProperties}>
        {/* Progresso */}
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500" />
          </div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">Último passo</span>
        </div>

        <h1 className={`${D} mt-7 text-3xl font-extrabold leading-tight text-blue-950 sm:text-4xl`}>
          Bem-vindo, Desbravador!
        </h1>
        <p className="mt-1.5 text-stone-500">Completa o teu perfil para começares a aventura.</p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="full_name" className="text-sm font-bold text-blue-950">Nome Completo</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
              <Input
                id="full_name"
                type="text"
                placeholder="Ex: João Miguel Silva"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-bold text-blue-950">
              <Calendar className="h-4 w-4 text-stone-400" /> Data de Nascimento
            </Label>
            <div className="grid grid-cols-[1fr_1.35fr_1.1fr] gap-2">
              <select required value={day} onChange={(e) => setDay(e.target.value)} className={SELECT_CLASS} aria-label="Dia">
                <option value="" disabled>Dia</option>
                {days.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select required value={month} onChange={(e) => setMonth(e.target.value)} className={SELECT_CLASS} aria-label="Mês">
                <option value="" disabled>Mês</option>
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select required value={year} onChange={(e) => setYear(e.target.value)} className={SELECT_CLASS} aria-label="Ano">
                <option value="" disabled>Ano</option>
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold text-blue-950">
              Foto de Perfil <span className="font-medium text-stone-400">(opcional)</span>
            </Label>
            <AvatarPicker name={fullName} value={avatar} onChange={setAvatar} disabled={loading} />
            {!avatar.file && !avatar.url && (
              <p className="text-xs text-stone-400">Podes adicionar uma foto mais tarde no teu perfil.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-4 text-lg font-extrabold text-blue-950 shadow-[0_14px_30px_-10px_rgba(250,204,21,.7)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300 active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> {avatar.file ? 'A carregar a foto...' : 'A guardar...'}</>
            ) : (
              <>Confirmar e Entrar <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></>
            )}
          </button>
        </form>
      </div>
    </AuthShell>
  )
}
