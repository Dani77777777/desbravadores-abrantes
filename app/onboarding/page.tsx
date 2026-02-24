'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateProfile } from './actions'
import { User, Calendar, Image } from 'lucide-react'

export default function OnboardingPage() {
  const [fullName, setFullName] = useState('')
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

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

    try {
      const result = await updateProfile({
        fullName,
        birthDate: birthDateFormatted,
        avatarUrl: avatarUrl || undefined
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Perfil criado com sucesso!')
        router.push('/')
        router.refresh()
      }
    } catch (error: any) {
      console.error('Error updating profile:', error)
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 p-4">
      <Card className="w-full max-w-md shadow-xl bg-white/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-3 shadow-lg border-4 border-yellow-400">
            <User className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl text-blue-900 font-bold">Bem-vindo, Desbravador!</CardTitle>
          <CardDescription className="text-blue-800">
            Completa o teu perfil para começares a aventura
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="flex items-center gap-2 text-blue-900 font-semibold">
                <User className="w-4 h-4" />
                Nome Completo
              </Label>
              <Input
                id="full_name"
                type="text"
                placeholder="Ex: João Miguel Silva"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border-blue-100 focus:border-blue-400"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-blue-900 font-semibold">
                <Calendar className="w-4 h-4" />
                Data de Nascimento
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  required
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-blue-100 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>Dia</option>
                  {days.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select
                  required
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-blue-100 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>Mês</option>
                  {months.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  required
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-blue-100 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>Ano</option>
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatar_url" className="flex items-center gap-2 text-blue-900 font-semibold">
                <Image className="w-4 h-4" />
                URL da Foto de Perfil (Opcional)
              </Label>
              <Input
                id="avatar_url"
                type="url"
                placeholder="https://exemplo.com/foto.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="w-full border-blue-100 focus:border-blue-400"
              />
              <p className="text-[10px] text-gray-500 italic">
                Podes adicionar uma foto mais tarde nas definições do teu perfil.
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-blue-800 hover:bg-blue-900 text-white font-bold py-6 text-lg shadow-lg transition-all hover:scale-[1.02] active:scale-95"
              disabled={loading}
            >
              {loading ? 'A guardar...' : 'Confirmar e Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
