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
  const [birthDate, setBirthDate] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await updateProfile({
        fullName,
        birthDate,
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-800 via-green-700 to-emerald-900 p-4">
      <Card className="w-full max-w-md shadow-xl bg-white/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center mb-3 shadow-lg">
            <User className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl text-green-900">Bem-vindo, Desbravador!</CardTitle>
          <CardDescription>
            Completa o teu perfil para começares a aventura
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Nome Completo
              </Label>
              <Input
                id="full_name"
                type="text"
                placeholder="João Silva"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="birth_date" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Data de Nascimento
              </Label>
              <Input
                id="birth_date"
                type="date"
                required
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatar_url" className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                URL da Foto de Perfil (opcional)
              </Label>
              <Input
                id="avatar_url"
                type="url"
                placeholder="https://exemplo.com/foto.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Podes adicionar uma foto mais tarde nas definições
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-green-700 hover:bg-green-800 text-white font-medium py-6 text-lg shadow-md transition-all hover:scale-[1.02]"
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
