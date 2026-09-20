'use client'

import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, Eye, EyeOff } from 'lucide-react'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { getSignedCallbackUrl } from './actions'
import { safeNextPath } from '@/utils/safe-next-path'

function LoginContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const [isSignUp, setIsSignUp] = useState(mode === 'signup')
  const supabase = createClient()

  // Para onde redirecionar após entrar. Só aceita caminhos internos (ver safeNextPath)
  // para evitar open-redirects. Por defeito vai para a home.
  const next = safeNextPath(searchParams.get('next'))

  useEffect(() => {
    // If mode changes in URL, update state
    if (mode === 'signup') setIsSignUp(true)
    if (mode === 'login') setIsSignUp(false)

    // Show success message if user comes from email verification
    // (redirected here because PKCE code exchange failed — different browser)
    if (searchParams.get('verified') === 'true') {
      toast.success('Email verificado com sucesso! Podes entrar agora.', { duration: 6000 })
    }
  }, [mode, searchParams])

  useEffect(() => {
    const hash = window.location.hash

    // Password Recovery links → redirect to the reset-password page with hash
    if (hash.includes('type=recovery')) {
      router.replace('/login/reset-password' + hash)
      return
    }

    // Handle hash fragments with access tokens (magic links, etc.)
    // Since @supabase/ssr forces PKCE, it won't auto-process hash fragments.
    // We need to manually extract tokens and establish the session.
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ data, error }) => {
          if (!error && data.session) {
            // Clear the hash from URL and redirect
            window.location.hash = ''
            router.push(next)
            router.refresh()
          }
        })
        return
      }
    }

    // Listen for auth state changes (e.g. PKCE auto-processing if same browser)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/login/reset-password' + window.location.hash)
      } else if (event === 'SIGNED_IN' && session) {
        router.push(next)
        router.refresh()
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, router])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isSignUp) {
        // Get a signed callback URL that includes the email for auto-login
        const redirectUrl = await getSignedCallbackUrl(email)
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
          },
        })
        if (error) throw error
        toast.success('Conta criada! Verifica o teu email para confirmar.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push(next)
        router.refresh()
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao autenticar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950">
      {/* Decorative overlay pattern */}
      <div className="absolute inset-0 z-0 opacity-10" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />

      <Card className="w-full max-w-md mx-4 z-10 bg-white/95 backdrop-blur-sm shadow-xl border-none">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-white rounded-full flex items-center justify-center mb-2 shadow-lg border-4 border-yellow-400 p-2 overflow-hidden">
            <img src="/images/Logo Desbravadores.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-blue-900">
            Clube de Desbravadores
          </CardTitle>
          <CardDescription className="text-blue-800">
            Abrantes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="teu@email.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Esconder password' : 'Mostrar password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button 
              type="submit"
              className="w-full bg-blue-800 hover:bg-blue-900 text-white font-medium py-6 text-lg shadow-md transition-all hover:scale-[1.02]" 
              disabled={loading}
            >
              {loading ? 'A processar...' : (isSignUp ? 'Criar Conta' : 'Entrar')}
            </Button>
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="w-full text-sm text-blue-700 hover:text-blue-900 underline"
            >
              {isSignUp ? 'Já tens conta? Entrar' : 'Não tens conta? Criar conta'}
            </button>
          </form>

          <p className="text-xs text-center text-gray-500 mt-6">
            Aventura • Amizade • Fé
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-blue-950 flex items-center justify-center text-white">Carregando...</div>}>
      <LoginContent />
    </Suspense>
  )
}
