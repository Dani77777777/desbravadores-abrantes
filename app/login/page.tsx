'use client'

import { createClient } from '@/utils/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, Eye, EyeOff, Lock, ArrowRight, Loader2, MailCheck } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { PageLoader } from '@/components/layout/PageLoader'
import { displayFont } from '@/components/landing/fonts'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
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
  // Email para onde foi enviada a confirmação depois de criar conta
  const [sentTo, setSentTo] = useState<string | null>(null)
  const supabase = createClient()

  // Para onde redirecionar após entrar. Só aceita caminhos internos (ver safeNextPath)
  // para evitar open-redirects. Por defeito vai para a home.
  const next = safeNextPath(searchParams.get('next'))

  // Depois de entrar: navegação completa (o servidor vê logo a sessão nova, sem a
  // página em cache de quando não havia sessão) e o ecrã "A entrar..." fica visível
  // até o painel aparecer. O ref evita navegar duas vezes (o SIGNED_IN também dispara).
  const redirectingRef = useRef(false)
  const [entering, setEntering] = useState(false)
  const goToApp = useCallback(() => {
    if (redirectingRef.current) return
    redirectingRef.current = true
    setEntering(true)
    window.location.assign(next)
  }, [next])

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
            goToApp()
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
        goToApp()
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, router, goToApp])

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
        setSentTo(email)
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        // Não desliga o loading: fica o ecrã "A entrar..." até a página mudar
        goToApp()
        return
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao autenticar')
    }
    setLoading(false)
  }

  const D = displayFont.className

  if (entering) {
    return <PageLoader overlay title="A entrar na tua conta..." subtitle="Estamos a preparar o teu painel." />
  }

  return (
    <AuthShell
      asideTitle={isSignUp ? <>A tua aventura <span className="text-yellow-400">começa aqui.</span></> : <>Bom ver-te <span className="text-yellow-400">outra vez!</span></>}
      asideText={
        isSignUp
          ? 'Cria a tua conta para ganhares XP, acumulares Gold e subires no ranking do clube.'
          : 'Entra para veres os avisos, as tarefas e continuares a subir de nível.'
      }
    >
      <div className="lp-rise rounded-[2rem] bg-white p-6 shadow-2xl shadow-black/30 sm:p-8" style={{ '--d': '100ms' } as React.CSSProperties}>
        {sentTo ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-20 w-20 -rotate-6 items-center justify-center rounded-3xl bg-emerald-500 text-white shadow-lg">
              <MailCheck className="h-10 w-10" />
            </div>
            <h1 className={`${D} mt-6 text-3xl font-extrabold text-blue-950`}>Verifica o teu email!</h1>
            <p className="mt-3 text-stone-600">
              Enviámos um link de confirmação para{' '}
              <span className="break-all font-bold text-blue-950">{sentTo}</span>. Abre-o para ativar a tua conta.
            </p>
            <p className="mt-2 text-sm text-stone-400">Não encontras? Espreita a pasta de spam.</p>
            <button
              type="button"
              onClick={() => { setSentTo(null); setIsSignUp(false) }}
              className="mt-7 w-full cursor-pointer rounded-2xl bg-blue-950 py-3.5 font-extrabold text-white transition-colors hover:bg-blue-900"
            >
              Já confirmei, quero entrar
            </button>
          </div>
        ) : (
          <>
            {/* Entrar / Criar conta */}
            <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1">
              {[
                { value: false, label: 'Entrar' },
                { value: true, label: 'Criar conta' },
              ].map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setIsSignUp(tab.value)}
                  className={`cursor-pointer rounded-full py-2.5 text-sm font-extrabold transition-all ${
                    isSignUp === tab.value ? 'bg-blue-950 text-white shadow-md' : 'text-stone-500 hover:text-blue-950'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <h1 className={`${D} mt-7 text-3xl font-extrabold leading-tight text-blue-950 sm:text-4xl`}>
              {isSignUp ? 'Junta-te à aventura!' : 'Bem-vindo de volta!'}
            </h1>
            <p className="mt-1.5 text-stone-500">
              {isSignUp ? 'Cria a tua conta em menos de um minuto.' : 'Entra para continuares a tua jornada.'}
            </p>

            <form onSubmit={handleEmailLogin} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-bold text-blue-950">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="teu@email.com"
                    autoComplete="email"
                    className="h-12 rounded-xl border-stone-200 bg-stone-50 pl-12 text-base focus-visible:border-yellow-400 focus-visible:ring-yellow-400/40"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-bold text-blue-950">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    className="h-12 rounded-xl border-stone-200 bg-stone-50 pl-12 pr-12 text-base focus-visible:border-yellow-400 focus-visible:ring-yellow-400/40"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-stone-400 hover:text-blue-950"
                    aria-label={showPassword ? 'Esconder password' : 'Mostrar password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {isSignUp && <p className="text-xs text-stone-400">Mínimo de 6 caracteres.</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-4 text-lg font-extrabold text-blue-950 shadow-[0_14px_30px_-10px_rgba(250,204,21,.7)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300 active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
              >
                {loading ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> A processar...</>
                ) : (
                  <>
                    {isSignUp ? 'Criar Conta' : 'Entrar'}
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-stone-500">
              {isSignUp ? 'Já tens conta?' : 'Ainda não tens conta?'}{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="cursor-pointer font-extrabold text-blue-950 underline decoration-yellow-400 decoration-2 underline-offset-4 hover:text-blue-700"
              >
                {isSignUp ? 'Entrar' : 'Criar conta'}
              </button>
            </p>
          </>
        )}
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-blue-950 text-white">A carregar...</div>}>
      <LoginContent />
    </Suspense>
  )
}
