'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useState } from 'react'
import { toast } from 'sonner'
import { updateUserProfile } from './actions'
import { User, Image as ImageIcon, Mail, Calendar, Award, History, Trophy, Coins, Zap, ShieldCheck, Hourglass, Loader2, CheckCircle2, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { AvatarPicker, type AvatarChoice } from '@/components/profile/AvatarPicker'
import { uploadAvatar, discardUploadedAvatar } from '@/utils/avatar-upload'
import { displayFont } from '@/components/landing/fonts'
import { SiteFooter } from '@/components/landing/SiteFooter'
import { PurchaseHistory } from './PurchaseHistory'
import { DeleteAccountCard } from './DeleteAccountCard'
import { GenderChoice } from '@/components/profile/GenderChoice'
import type { Gender } from '@/utils/name-gender'
import { ClubFamilyPanel } from '@/components/profile/ClubFamilyPanel'
import type { MyClubFamily } from '@/lib/actions/club-families'
import { isManagedEmail } from '@/utils/club-families'

const D = displayFont.className

interface ProfileSettingsProps {
  profile: {
    full_name: string
    avatar_url: string | null
    birth_date: string | null
    gender?: string | null
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
  clubFamily: MyClubFamily
  familyCode?: string
}

const SECTION_COLORS: Record<string, string> = {
  rebentos: 'bg-emerald-600',
  ticoes: 'bg-red-800',
  exploradores: 'bg-yellow-500',
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500',
}

const INPUT_CLASS =
  'h-12 rounded-xl border-stone-200 bg-stone-50 text-base focus-visible:border-yellow-400 focus-visible:ring-yellow-400/40'

/** Cartão branco das secções do perfil. */
function Panel({ icon: Icon, iconClass, title, description, children, className = '' }: {
  icon: React.ElementType
  iconClass: string
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[1.75rem] bg-white p-6 shadow-md shadow-blue-950/5 ring-1 ring-stone-200 sm:p-7 ${className}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className={`${D} text-xl font-extrabold leading-tight text-blue-950`}>{title}</h2>
          {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export default function ProfileSettings({ profile, user, userEmail, purchases, vanaTrilhaStations = 0, clubFamily, familyCode }: ProfileSettingsProps) {
  const [fullName, setFullName] = useState(profile.full_name)
  const [avatar, setAvatar] = useState<AvatarChoice>({ file: null, url: profile.avatar_url || '' })
  const savedGender: Gender | null = profile.gender === 'm' || profile.gender === 'f' ? profile.gender : null
  const [gender, setGender] = useState<Gender | null>(savedGender)
  const [loading, setLoading] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  // Perfil criado pela família: o email é interno e não recebe nada (ver ClubFamilyPanel).
  const managedProfile = isManagedEmail(userEmail)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // A foto nova só vai para o bucket agora; se a gravação falhar, é apagada outra vez.
    // A foto antiga (trocada ou removida) é apagada no servidor pelo updateUserProfile.
    let uploadedUrl: string | null = null
    try {
      if (avatar.file) uploadedUrl = await uploadAvatar(supabase, user.id, avatar.file)
      const finalUrl = uploadedUrl ?? avatar.url.trim()

      const result = await updateUserProfile({
        fullName,
        avatarUrl: finalUrl,
        // Só contas antigas que nunca indicaram o sexo o escolhem aqui (uma vez)
        ...(!savedGender && gender ? { gender } : {}),
      })

      if (result.error) {
        if (uploadedUrl) await discardUploadedAvatar(supabase, user.id, uploadedUrl)
        toast.error(result.error)
      } else {
        setAvatar({ file: null, url: finalUrl })
        toast.success('Perfil atualizado com sucesso!')
        router.refresh()
      }
    } catch (error: any) {
      console.error('Error updating profile:', error)
      if (uploadedUrl) await discardUploadedAvatar(supabase, user.id, uploadedUrl).catch(() => {})
      toast.error('Erro ao guardar: ' + (error?.message || 'tenta novamente.'))
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

  const sectionColor = SECTION_COLORS[profile.section as keyof typeof SECTION_COLORS] || 'bg-blue-700'
  const sectionLabel = profile.section.charAt(0).toUpperCase() + profile.section.slice(1)
  const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
  const level = Math.floor(profile.total_xp / 1000) + 1
  const xpInLevel = profile.total_xp % 1000

  return (
    <div className="min-h-screen overflow-x-clip bg-blue-950">
      <Navbar user={user} profile={profile} />

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-24 pt-12 text-white md:pt-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(40% 50% at 15% 30%, rgba(250,204,21,.18), transparent 70%), radial-gradient(45% 60% at 90% 20%, rgba(99,102,241,.3), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="lp-rise flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <div className="relative shrink-0">
              <div aria-hidden className="absolute -inset-3 rounded-full bg-yellow-400/25 blur-xl" />
              <Avatar className="relative h-28 w-28 ring-4 ring-yellow-400 ring-offset-4 ring-offset-blue-950">
                <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className={`${D} bg-blue-700 text-4xl font-extrabold text-white`}>
                  {fullName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {profile.is_invested && (
                <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-blue-950 shadow-md ring-4 ring-blue-950" title="Investido">
                  <ShieldCheck className="h-5 w-5" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className={`${D} text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl`}>{fullName}</h1>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-blue-100/70 sm:justify-start">
                <Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{managedProfile ? 'Perfil da família, sem email próprio' : userEmail}</span>
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white ${sectionColor}`}>
                  {sectionLabel}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-100 ring-1 ring-inset ring-white/15">
                  {roleLabel}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${
                  profile.is_invested ? 'bg-yellow-400/15 text-yellow-300 ring-yellow-400/30' : 'bg-orange-400/15 text-orange-300 ring-orange-400/30'
                }`}>
                  {profile.is_invested ? <><ShieldCheck className="h-3.5 w-3.5" /> Investido</> : <><Hourglass className="h-3.5 w-3.5" /> A aguardar investidura</>}
                </span>
              </div>
            </div>
          </div>

          {/* Estatísticas */}
          <div className="lp-rise grid grid-cols-2 gap-3" style={{ '--d': '150ms' } as React.CSSProperties}>
            <div className="col-span-2 relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-violet-700 p-5 shadow-xl shadow-indigo-950/40">
              <Trophy aria-hidden className="absolute -bottom-5 -right-5 h-28 w-28 text-white/10" />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-100">Nível</p>
                  <p className={`${D} text-5xl font-extrabold leading-none`}>{level}</p>
                </div>
                <p className="text-sm font-bold text-indigo-100">{profile.total_xp} XP</p>
              </div>
              <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-pink-400"
                  style={{ width: `${Math.max(3, xpInLevel / 10)}%` }}
                />
              </div>
              <p className="mt-1.5 text-right text-xs font-semibold text-indigo-100">Faltam {1000 - xpInLevel} XP</p>
            </div>
            <Link
              href="/points-history"
              className="group relative overflow-hidden rounded-[1.5rem] bg-yellow-400 p-5 text-blue-950 shadow-xl shadow-yellow-900/30 transition-transform hover:-translate-y-0.5"
            >
              <Coins aria-hidden className="absolute -bottom-4 -right-4 h-20 w-20 text-amber-600/20" />
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-950/70">Gold</p>
              <p className={`${D} text-3xl font-extrabold leading-none`}>{profile.current_gold}</p>
              <p className="mt-2 flex items-center gap-1 text-xs font-bold">
                <History className="h-3.5 w-3.5" /> Histórico
              </p>
            </Link>
            {vanaTrilhaStations >= 7 ? (
              <div
                className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-amber-300 to-orange-500 p-5 text-amber-950 shadow-xl"
                title="Completou as 7 estações do VanaTrilha"
              >
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-950/70">Insígnia</p>
                <p className="mt-1 text-2xl">🏅</p>
                <p className="text-xs font-extrabold leading-tight">Peregrino da Promessa</p>
              </div>
            ) : (
              <Link
                href="/jogos/vana-trilha"
                className="relative overflow-hidden rounded-[1.5rem] bg-white/[0.07] p-5 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.12]"
                title="Completa as 7 estações do VanaTrilha para ganhar a insígnia Peregrino da Promessa"
              >
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-100/70">Insígnia</p>
                <p className={`${D} text-3xl font-extrabold leading-none`}>{vanaTrilhaStations}/7</p>
                <p className="mt-2 text-xs font-bold text-yellow-300">Estações VanaTrilha</p>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── Conteúdo ──────────────────────────────────────────── */}
      <div className="relative -mt-10 rounded-t-[2.5rem] bg-stone-50 pb-20 pt-10">
        <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            {/* Editar perfil */}
            <Panel icon={Pencil} iconClass="bg-blue-600" title="Editar Perfil" description="Atualiza o teu nome e foto de perfil.">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name" className="text-sm font-bold text-blue-950">Nome Completo</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                    <Input
                      id="full_name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className={`${INPUT_CLASS} pl-12`}
                    />
                  </div>
                </div>

                {!savedGender && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold text-blue-950">Sexo</Label>
                    <p className="rounded-xl bg-yellow-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-yellow-300">
                      Ainda não indicaste. Escolhe e carrega em &quot;Guardar Alterações&quot;. Serve para organizar as tendas nas saídas
                      e depois já não se muda aqui.
                    </p>
                    <GenderChoice value={gender} onChange={setGender} disabled={loading} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-bold text-blue-950">
                    <ImageIcon className="h-4 w-4 text-stone-400" /> Foto de Perfil
                  </Label>
                  <AvatarPicker name={fullName} value={avatar} onChange={setAvatar} disabled={loading} />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-3.5 text-base font-extrabold text-blue-950 shadow-[0_12px_28px_-12px_rgba(250,204,21,.8)] transition-all hover:-translate-y-0.5 hover:bg-yellow-300 disabled:cursor-wait disabled:opacity-70"
                >
                  {loading ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> {avatar.file ? 'A carregar a foto...' : 'A guardar...'}</>
                  ) : (
                    'Guardar Alterações'
                  )}
                </button>
              </form>
            </Panel>

            {/* Informação do clube */}
            <Panel icon={Award} iconClass="bg-emerald-500" title="Informação do Clube">
              <dl className="divide-y divide-stone-100">
                <div className="flex items-center justify-between py-3 first:pt-0">
                  <dt className="text-sm text-stone-500">Secção</dt>
                  <dd className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white ${sectionColor}`}>{sectionLabel}</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-sm text-stone-500">Função</dt>
                  <dd className="font-bold text-blue-950">{roleLabel}</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-sm text-stone-500">Investido</dt>
                  <dd className={`font-bold ${profile.is_invested ? 'text-blue-600' : 'text-orange-600'}`}>
                    {profile.is_invested ? 'Sim' : 'Aguardando'}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-sm text-stone-500">Sexo</dt>
                  <dd>
                    {savedGender ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                          savedGender === 'm' ? 'bg-sky-100 text-sky-800' : 'bg-pink-100 text-pink-800'
                        }`}
                      >
                        <span className="text-sm leading-none">{savedGender === 'm' ? '♂' : '♀'}</span>
                        {savedGender === 'm' ? 'Masculino' : 'Feminino'}
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-amber-600">Por indicar</span>
                    )}
                  </dd>
                </div>
                {profile.birth_date && (
                  <div className="flex items-center justify-between py-3">
                    <dt className="flex items-center gap-1 text-sm text-stone-500">
                      <Calendar className="h-4 w-4" /> Data de Nascimento
                    </dt>
                    <dd className="font-bold text-blue-950">{new Date(profile.birth_date).toLocaleDateString('pt-PT')}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between py-3 last:pb-0">
                  <dt className="flex items-center gap-1 text-sm text-stone-500">
                    <Zap className="h-4 w-4" /> XP Total
                  </dt>
                  <dd className="font-bold text-indigo-600">{profile.total_xp} XP</dd>
                </div>
              </dl>
              <Link
                href="/points-history"
                className="mt-5 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-indigo-700 ring-1 ring-inset ring-indigo-200 transition-colors hover:bg-indigo-50"
              >
                <History className="h-4 w-4" /> Ver Histórico de Pontos
              </Link>
            </Panel>
          </div>

          {/* Histórico de compras */}
          <PurchaseHistory purchases={purchases} />

          <ClubFamilyPanel data={clubFamily} userId={user.id} fullName={profile.full_name} initialCode={familyCode} />

          {/* Alterar email */}
          <Panel
            icon={Mail}
            iconClass="bg-violet-500"
            title={managedProfile ? 'Email próprio' : 'Alterar Email'}
            description={managedProfile ? 'Este perfil foi criado pela família e ainda não tem email.' : 'Será enviado um email de confirmação para o novo endereço.'}
          >
            {managedProfile ? (
              <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600 ring-1 ring-inset ring-stone-200">
                Um adulto da família pode dar-lhe um email na conta dele, em <b>A minha família</b> (ícone do envelope). Depois chega a esse
                email um link para escolher a palavra-passe.
              </p>
            ) : emailSent ? (
              <div className="rounded-2xl bg-emerald-50 p-5 text-center ring-1 ring-inset ring-emerald-200">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-2 font-bold text-emerald-800">Email de confirmação enviado!</p>
                <p className="mt-1 text-sm text-emerald-700">
                  Verifica a tua caixa de entrada e clica no link para confirmar o novo email.
                </p>
                <button
                  type="button"
                  className="mt-3 cursor-pointer text-sm font-bold text-emerald-700 hover:underline"
                  onClick={() => setEmailSent(false)}
                >
                  Alterar para outro email
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmailChange} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="current_email" className="text-sm font-bold text-blue-950">Email atual</Label>
                  <Input id="current_email" type="email" value={userEmail} disabled className={`${INPUT_CLASS} text-stone-500`} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new_email" className="text-sm font-bold text-blue-950">Novo email</Label>
                  <Input
                    id="new_email"
                    type="email"
                    placeholder="novo@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  />
                </div>
                <button
                  type="submit"
                  disabled={emailLoading || !newEmail}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-950 py-3.5 font-extrabold text-white transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
                >
                  {emailLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> A enviar...</> : 'Confirmar Alteração de Email'}
                </button>
              </form>
            )}
          </Panel>

          {/* Apagar conta */}
          <DeleteAccountCard userEmail={userEmail} />
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
