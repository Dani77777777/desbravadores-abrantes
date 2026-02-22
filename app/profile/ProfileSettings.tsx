'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useState } from 'react'
import { toast } from 'sonner'
import { updateUserProfile } from './actions'
import { User, Image, Mail, Calendar, Award } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ProfileSettingsProps {
  profile: {
    full_name: string
    avatar_url: string | null
    birth_date: string | null
    section: string
    role: string
    total_xp: number
    current_gold: number
    is_invested: boolean
  }
  userEmail: string
}

export default function ProfileSettings({ profile, userEmail }: ProfileSettingsProps) {
  const [fullName, setFullName] = useState(profile.full_name)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await updateUserProfile({
        fullName,
        avatarUrl: avatarUrl || undefined
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Perfil atualizado com sucesso!')
        router.refresh()
      }
    } catch (error: any) {
      console.error('Error updating profile:', error)
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const SECTION_COLORS: Record<string, string> = {
    rebentos: 'bg-green-500',
    ticoes: 'bg-red-800',
    exploradores: 'bg-yellow-500',
    companheiros: 'bg-blue-600',
    embaixadores: 'bg-slate-500',
  }

  const sectionColor = SECTION_COLORS[profile.section as keyof typeof SECTION_COLORS] || 'bg-green-600'

  return (
    <div className="min-h-screen bg-stone-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile Header */}
        <Card className="border-t-4 border-green-600">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Avatar className="w-24 h-24 border-4 border-green-600">
                <AvatarImage src={avatarUrl || profile.avatar_url || undefined} />
                <AvatarFallback className="bg-green-600 text-white text-2xl">
                  {fullName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <CardTitle className="text-2xl">{fullName}</CardTitle>
            <CardDescription className="flex items-center justify-center gap-2">
              <Mail className="w-4 h-4" />
              {userEmail}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Profile Info */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5" />
                Informação do Clube
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Secção:</span>
                <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${sectionColor}`}>
                  {profile.section.charAt(0).toUpperCase() + profile.section.slice(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Função:</span>
                <span className="font-medium">
                  {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Investido:</span>
                <span className={`font-medium ${profile.is_invested ? 'text-green-600' : 'text-orange-600'}`}>
                  {profile.is_invested ? 'Sim' : 'Aguardando'}
                </span>
              </div>
              {profile.birth_date && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Data de Nascimento:
                  </span>
                  <span className="font-medium">
                    {new Date(profile.birth_date).toLocaleDateString('pt-PT')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Gamificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">XP Total:</span>
                <span className="font-bold text-indigo-600 text-lg">{profile.total_xp} XP</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Gold:</span>
                <span className="font-bold text-yellow-600 text-lg">{profile.current_gold} 🪙</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Nível:</span>
                <span className="font-bold text-green-600 text-lg">
                  {Math.floor(profile.total_xp / 1000) + 1}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edit Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Editar Perfil
            </CardTitle>
            <CardDescription>
              Atualiza o teu nome e foto de perfil
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome Completo</Label>
                <Input
                  id="full_name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar_url" className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  URL da Foto de Perfil
                </Label>
                <Input
                  id="avatar_url"
                  type="url"
                  placeholder="https://exemplo.com/foto.jpg"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Deixa em branco para usar a inicial do teu nome
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-green-700 hover:bg-green-800"
                disabled={loading}
              >
                {loading ? 'A guardar...' : 'Guardar Alterações'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
