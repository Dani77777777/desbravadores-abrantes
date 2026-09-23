'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, Lock, Eye, EyeOff, Check, X, ArrowRight, Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { displayFont } from '@/components/landing/fonts'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // @supabase/ssr does NOT automatically process URL hash fragments.
    // We must parse the hash and call setSession() manually.
    const hash = window.location.hash
    if (hash) {
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ data, error }) => {
          if (data.session) {
            setSessionReady(true)
          } else {
            console.error('Failed to set session:', error)
          }
        })
      }
    }
  }, [supabase])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast.error('As passwords não coincidem')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      toast.success('Password atualizada com sucesso!')
      router.push('/')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar password')
    } finally {
      setLoading(false)
    }
  }

  const D = displayFont.className
  const inputClass =
    'h-12 rounded-xl border-stone-200 bg-stone-50 pl-12 pr-12 text-base focus-visible:border-yellow-400 focus-visible:ring-yellow-400/40'
  const matches = confirmPassword.length > 0 && password === confirmPassword

  return (
    <AuthShell
      showBackLink={false}
      asideTitle={<>Uma nova <span className="text-yellow-400">password.</span></>}
      asideText="Escolhe uma password nova e volta à aventura com o clube."
    >
      <div className="lp-rise rounded-[2rem] bg-white p-6 shadow-2xl shadow-black/30 sm:p-8" style={{ '--d': '100ms' } as React.CSSProperties}>
        <div className="flex h-14 w-14 -rotate-6 items-center justify-center rounded-2xl bg-yellow-400 text-blue-950 shadow-md">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className={`${D} mt-6 text-3xl font-extrabold leading-tight text-blue-950 sm:text-4xl`}>Nova Password</h1>
        <p className="mt-1.5 text-stone-500">Introduz a tua nova password para acederes à conta.</p>

        <form onSubmit={handleResetPassword} className="mt-7 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-bold text-blue-950">Nova Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                className={inputClass}
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
            <p className="text-xs text-stone-400">Mínimo de 6 caracteres.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-sm font-bold text-blue-950">Confirmar Nova Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
              {confirmPassword.length > 0 && (
                <span className={`absolute right-4 top-1/2 -translate-y-1/2 ${matches ? 'text-emerald-500' : 'text-red-400'}`}>
                  {matches ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                </span>
              )}
            </div>
            {confirmPassword.length > 0 && !matches && (
              <p className="text-xs font-semibold text-red-500">As passwords ainda não coincidem.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-4 text-lg font-extrabold text-blue-950 shadow-[0_14px_30px_-10px_rgba(250,204,21,.7)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300 active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> A atualizar...</>
            ) : (
              <>Atualizar Password <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></>
            )}
          </button>
        </form>
      </div>
    </AuthShell>
  )
}
