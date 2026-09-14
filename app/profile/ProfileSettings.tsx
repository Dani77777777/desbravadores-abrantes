'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useState } from 'react'
import { toast } from 'sonner'
import { updateUserProfile } from './actions'
import { User, Image, Mail, Calendar, Award, History } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { createClient } from '@/utils/supabase/client'
import { useRef } from 'react'
import Link from 'next/link'
import { PurchaseHistory } from './PurchaseHistory'

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
  user: any
  userEmail: string
  purchases: any[]
  vanaTrilhaStations?: number
}

export default function ProfileSettings({ profile, user, userEmail, purchases, vanaTrilhaStations = 0 }: ProfileSettingsProps) {
  const [fullName, setFullName] = useState(profile.full_name)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    console.log('Iniciando upload para o bucket:', process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'imagens')
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Math.random()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError, data } = await supabase.storage
        .from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'imagens')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Erro no upload do Supabase:', uploadError)
        throw uploadError
      }

      console.log('Upload concluído com sucesso:', data)

      const { data: { publicUrl } } = supabase.storage
        .from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'imagens')
        .getPublicUrl(filePath)

      console.log('URL Pública gerada:', publicUrl)
      setAvatarUrl(publicUrl)
      toast.success('Imagem carregada! Não te esqueças de Guardar no final.')
    } catch (error: any) {
      console.error('Error uploading image catch:', error)
      toast.error('Erro ao carregar imagem: ' + (error.message || 'Erro desconhecido'))
    } finally {
      setUploading(false)
    }
  }

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

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newEmail === userEmail) {
      toast.error('O novo email é igual ao atual')
      return
    }
    setEmailLoading(true)
    try {
      const { error } = await supabase.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: `${window.location.origin}/auth/callback` }
      )
      if (error) {
        toast.error('Erro ao alterar email: ' + error.message)
      } else {
        setEmailSent(true)
        setNewEmail('')
      }
    } catch {
      toast.error('Erro ao alterar email. Tenta novamente.')
    } finally {
      setEmailLoading(false)
    }
  }

  const SECTION_COLORS: Record<string, string> = {
    rebentos: 'bg-emerald-600',
    ticoes: 'bg-red-800',
    exploradores: 'bg-yellow-500',
    companheiros: 'bg-blue-600',
    embaixadores: 'bg-slate-500',
  }

  const sectionColor = SECTION_COLORS[profile.section as keyof typeof SECTION_COLORS] || 'bg-blue-700'

  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar user={user} profile={profile} />
      <div className="max-w-4xl mx-auto space-y-6 py-8 px-4">
        {/* Profile Header */}
        <Card className="border-t-4 border-blue-700">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Avatar className="w-24 h-24 border-4 border-blue-700">
                <AvatarImage src={avatarUrl || profile.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-blue-700 text-white text-2xl">
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
                <span className={`font-medium ${profile.is_invested ? 'text-blue-600' : 'text-orange-600'}`}>
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
                <span className="font-bold text-blue-700 text-lg">
                  {Math.floor(profile.total_xp / 1000) + 1}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-gray-600">Insígnias:</span>
                {vanaTrilhaStations >= 7 ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-yellow-300 to-amber-500 px-2.5 py-1 text-xs font-bold text-amber-950 shadow-sm"
                    title="Completou as 7 estações do VanaTrilha"
                  >
                    🏅 Peregrino da Promessa
                  </span>
                ) : (
                  <Link
                    href="/jogos/vana-trilha"
                    className="text-xs font-semibold text-amber-700 hover:underline"
                    title="Completa as 7 estações do VanaTrilha para ganhar a insígnia Peregrino da Promessa"
                  >
                    VanaTrilha: {vanaTrilhaStations}/7 estações
                  </Link>
                )}
              </div>
              <div className="pt-2">
                <Link href="/points-history">
                  <Button variant="outline" size="sm" className="w-full flex items-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                    <History className="w-4 h-4" />
                    Ver Histórico de Pontos
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Purchase History */}
        <PurchaseHistory purchases={purchases} />

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

              <div className="space-y-4">
                <Label htmlFor="avatar_upload" className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Foto de Perfil
                </Label>
                
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16 border-2 border-blue-100">
                    <AvatarImage src={avatarUrl || undefined} className="object-cover" />
                    <AvatarFallback className="bg-blue-700 text-white">
                      {fullName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1">
                    <Input
                      id="avatar_upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'A carregar...' : 'Escolher Nova Foto'}
                    </Button>
                    <p className="text-xs text-gray-500 mt-2">
                      A imagem será carregada automaticamente para o nosso servidor
                    </p>
                  </div>
                </div>

                <div className="space-y-2 opacity-50">
                  <Label htmlFor="avatar_url" className="text-xs">Ou URL da imagem (opcional)</Label>
                  <Input
                    id="avatar_url"
                    type="url"
                    placeholder="https://exemplo.com/foto.jpg"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-800 hover:bg-blue-900"
                disabled={loading}
              >
                {loading ? 'A guardar...' : 'Guardar Alterações'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Alterar Email
            </CardTitle>
            <CardDescription>
              Será enviado um email de confirmação para o novo endereço
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center space-y-2">
                <p className="text-green-800 font-medium">Email de confirmação enviado!</p>
                <p className="text-green-700 text-sm">
                  Verifica a tua caixa de entrada e clica no link para confirmar o novo email.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-green-700 mt-2"
                  onClick={() => setEmailSent(false)}
                >
                  Alterar para outro email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleEmailChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current_email">Email atual</Label>
                  <Input
                    id="current_email"
                    type="email"
                    value={userEmail}
                    disabled
                    className="bg-gray-50 text-gray-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_email">Novo email</Label>
                  <Input
                    id="new_email"
                    type="email"
                    placeholder="novo@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-blue-800 hover:bg-blue-900"
                  disabled={emailLoading || !newEmail}
                >
                  {emailLoading ? 'A enviar...' : 'Confirmar Alteração de Email'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
