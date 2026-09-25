import type { CSSProperties } from 'react'
import { createClient } from '@/utils/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, Coins, Star, Crown, Sparkles, type LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { displayFont } from '@/components/landing/fonts'
import { SiteFooter } from '@/components/landing/SiteFooter'

const D = displayFont.className

const SECTION_COLORS = {
  rebentos: 'bg-emerald-600',
  ticoes: 'bg-red-800',
  exploradores: 'bg-yellow-500',
  companheiros: 'bg-blue-600',
  embaixadores: 'bg-slate-500',
}

const SECTION_LABELS = {
    rebentos: 'Rebentos',
    ticoes: 'Tições',
    exploradores: 'Exploradores',
    companheiros: 'Companheiros',
    embaixadores: 'Embaixadores'
}

type RankingType = 'xp' | 'gold' | 'combined'

/** Linha da vista pública `leaderboard`. */
type Member = {
  id: string
  full_name: string | null
  avatar_url: string | null
  section: string
  role: 'desbravador' | 'dirigente' | 'coordenador'
  total_xp: number
  current_gold: number
  combined_score: number
  is_invested: boolean
}

const RANKING_META: Record<RankingType, { unit: string; icon: LucideIcon; iconClass: string; bar: string }> = {
  xp: { unit: 'XP', icon: Trophy, iconClass: 'text-indigo-300', bar: 'from-indigo-400 to-violet-500' },
  gold: { unit: 'Gold', icon: Coins, iconClass: 'text-yellow-300', bar: 'from-yellow-300 to-amber-500' },
  combined: { unit: 'Pontos', icon: Star, iconClass: 'fill-orange-300 text-orange-300', bar: 'from-yellow-300 via-orange-400 to-red-500' },
}

/** Pódio: cores, alturas e tamanhos por posição (0 = 1.º lugar). */
const PODIUM = [
  { pedestal: 'from-yellow-300 to-amber-500 text-amber-950', height: 'h-32 sm:h-40', avatar: 'h-20 w-20 sm:h-24 sm:w-24', ring: 'ring-yellow-400' },
  { pedestal: 'from-slate-100 to-slate-400 text-slate-800', height: 'h-24 sm:h-28', avatar: 'h-16 w-16 sm:h-20 sm:w-20', ring: 'ring-slate-300' },
  { pedestal: 'from-orange-300 to-amber-700 text-orange-950', height: 'h-16 sm:h-20', avatar: 'h-16 w-16 sm:h-20 sm:w-20', ring: 'ring-orange-400' },
]

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/** Quando cada lugar do pódio aparece (ms): 3.º → 2.º → 1.º. */
const REVEAL_MS = [1500, 850, 250]

async function getLeaderboardData(): Promise<Member[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')

  if (error) {
    console.error('Error fetching leaderboard:', error)
    return []
  }
  return data || []
}

function scoreOf(member: Member, type: RankingType) {
  return type === 'xp' ? member.total_xp : type === 'gold' ? member.current_gold : member.combined_score
}

function SectionBadge({ section }: { section: string }) {
  const label = SECTION_LABELS[section as keyof typeof SECTION_LABELS]
  if (!label) return null
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${SECTION_COLORS[section as keyof typeof SECTION_COLORS]}`}>
      {label}
    </span>
  )
}

/** `onYellow`: na linha do próprio (fundo amarelo). */
function LeaderBadge({ member, onYellow }: { member: Member; onYellow?: boolean }) {
  if (member.role !== 'dirigente') return null
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        onYellow ? 'bg-blue-950 text-yellow-300' : 'bg-yellow-400/15 text-yellow-200 ring-1 ring-inset ring-yellow-300/50'
      }`}
    >
      Dirigente
    </span>
  )
}

function Podium({ data, type, userId }: { data: Member[]; type: RankingType; userId?: string }) {
  const top = data.slice(0, 3)
  if (top.length === 0) return null
  const meta = RANKING_META[type]
  // Ordem visual: 2.º, 1.º, 3.º
  const order = [1, 0, 2].filter((i) => i < top.length)

  return (
    <div className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((place) => {
        const member = top[place]
        const style = PODIUM[place]
        const isMe = userId && member.id === userId
        const Icon = meta.icon
        // Suspense: o 3.º aparece primeiro, depois o 2.º e por fim o 1.º (com a coroa a cair)
        const revealAt = REVEAL_MS[place]
        return (
          <div
            key={member.id}
            className={`flex flex-col items-center ${top.length < 3 && place === 0 ? 'col-start-2' : ''}`}
          >
            <div className="lp-rise flex w-full flex-col items-center" style={delay(revealAt + 250)}>
              <div className="relative mb-3">
                {place === 0 && (
                  <span className="lp-crown absolute -top-9 left-1/2 -translate-x-1/2" style={delay(revealAt + 650)}>
                    <Crown className="lp-float block h-9 w-9 fill-yellow-400 text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,.7)]" />
                  </span>
                )}
                {place === 0 && (
                  <div aria-hidden className="absolute -inset-3 rounded-full bg-yellow-400/30 blur-xl" />
                )}
                <Avatar className={`relative ${style.avatar} ring-4 ${style.ring} ring-offset-4 ring-offset-blue-950`}>
                  <AvatarImage src={member.avatar_url ?? undefined} alt={member.full_name ?? ''} className="object-cover" />
                  <AvatarFallback className="bg-blue-800 text-2xl font-bold text-white">
                    {member.full_name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                {isMe && (
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-extrabold text-blue-950">
                    TU
                  </span>
                )}
              </div>
              <p className="w-full truncate px-1 text-center text-sm font-bold text-white sm:text-base">
                {member.full_name?.split(' ')[0]}
              </p>
              {member.role === 'dirigente' && (
                <div className="mt-1">
                  <LeaderBadge member={member} />
                </div>
              )}
              <p className="mb-3 mt-0.5 flex items-center gap-1 text-sm font-extrabold text-blue-100">
                {scoreOf(member, type)} <Icon className={`h-3.5 w-3.5 ${meta.iconClass}`} />
              </p>
            </div>
            <div
              className={`lp-grow relative flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b pt-2 shadow-[inset_0_2px_0_rgba(255,255,255,.5)] ${style.pedestal} ${style.height}`}
              style={delay(revealAt)}
            >
              <span className={`${D} text-4xl font-extrabold sm:text-5xl`}>{place + 1}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RankList({ data, type, userId }: { data: Member[]; type: RankingType; userId?: string }) {
  const meta = RANKING_META[type]
  const Icon = meta.icon
  const best = Math.max(1, data[0] ? scoreOf(data[0], type) : 0)
  const rest = data.slice(3)

  if (data.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-white/15 py-14 text-center text-blue-200/70">
        Nenhum membro encontrado no ranking.
      </div>
    )
  }

  if (rest.length === 0) return null

  return (
    <ol className="space-y-2.5">
      {rest.map((member, i) => {
        const index = i + 3
        const score = scoreOf(member, type) || 0
        const isMe = userId && member.id === userId
        return (
          <li
            key={member.id}
            className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl p-3 pr-4 transition-all sm:gap-4 sm:p-4 ${
              isMe
                ? 'bg-yellow-400 text-blue-950 shadow-[0_0_0_4px_rgba(250,204,21,.25)]'
                : 'bg-white/[0.06] text-white ring-1 ring-inset ring-white/10 hover:bg-white/10'
            }`}
          >
            <span className={`${D} w-8 shrink-0 text-center text-xl font-extrabold sm:w-10 sm:text-2xl ${isMe ? 'text-blue-950' : 'text-blue-200/60'}`}>
              {index + 1}
            </span>

            <Avatar className={`h-11 w-11 shrink-0 ring-2 ${isMe ? 'ring-blue-950' : 'ring-white/15'}`}>
              <AvatarImage src={member.avatar_url ?? undefined} alt={member.full_name ?? ''} className="object-cover" />
              <AvatarFallback className="bg-blue-800 font-bold text-white">
                {member.full_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-bold">{member.full_name}</span>
                {isMe && (
                  <span className="rounded-full bg-blue-950 px-1.5 py-0.5 text-[10px] font-extrabold text-yellow-300">TU</span>
                )}
                {member.is_invested && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400 ring-2 ring-yellow-400/30" title="Investido" />
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <SectionBadge section={member.section} />
                <LeaderBadge member={member} onYellow={!!isMe} />
                <div className={`hidden h-1.5 flex-1 overflow-hidden rounded-full sm:block ${isMe ? 'bg-blue-950/15' : 'bg-white/10'}`}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${isMe ? 'from-blue-950 to-blue-800' : meta.bar}`}
                    style={{ width: `${Math.max(4, Math.round((score / best) * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className={`${D} flex items-center justify-end gap-1 text-xl font-extrabold`}>
                {score}
                <Icon className={`h-4 w-4 ${isMe ? 'text-blue-950' : meta.iconClass}`} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isMe ? 'text-blue-950/70' : 'text-blue-200/50'}`}>
                {meta.unit}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default async function LeaderboardPage() {
  const supabase = await createClient()

  // Try to get current user for personal highlighting
  const { data: { user } } = await supabase.auth.getUser()
  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  const allData = await getLeaderboardData()

  const rankings: Record<RankingType, Member[]> = {
    xp: [...allData].sort((a, b) => b.total_xp - a.total_xp),
    gold: [...allData].sort((a, b) => b.current_gold - a.current_gold),
    combined: [...allData].sort((a, b) => b.combined_score - a.combined_score),
  }

  const myPosition = user ? rankings.combined.findIndex((m) => m.id === user.id) + 1 : 0

  const tabs: { value: RankingType; label: string; short: string; icon: LucideIcon }[] = [
    { value: 'combined', label: 'Top Global', short: 'Global', icon: Star },
    { value: 'xp', label: 'Ranking XP', short: 'XP', icon: Trophy },
    { value: 'gold', label: 'Ranking Gold', short: 'Gold', icon: Coins },
  ]

  return (
    <div className="min-h-screen overflow-x-clip bg-blue-950">
      <Navbar user={user} profile={profile} />

      <main className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(40% 30% at 50% 0%, rgba(250,204,21,.22), transparent 70%), radial-gradient(40% 40% at 0% 40%, rgba(99,102,241,.25), transparent 70%), radial-gradient(40% 40% at 100% 70%, rgba(239,68,68,.15), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl px-4 pb-24 pt-14 sm:px-6 md:pt-20 lg:px-8">
          <header className="text-center text-white">
            <div
              className="lp-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300 backdrop-blur"
              style={delay(0)}
            >
              <Trophy className="h-3.5 w-3.5" /> Ranking
            </div>
            <h1
              className={`${D} lp-rise mt-5 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl`}
              style={delay(100)}
            >
              Conquista o{' '}
              <span className="lp-shimmer bg-clip-text text-transparent [background-image:linear-gradient(90deg,#fde047,#fb923c,#ef4444,#fb923c,#fde047)]">
                topo!
              </span>
            </h1>
            <p className="lp-rise mx-auto mt-5 max-w-md text-lg text-blue-100/80" style={delay(200)}>
              Os melhores Desbravadores do clube. Esforça-te e conquista o teu lugar lá em cima!
            </p>
            {myPosition > 0 && (
              <div
                className="lp-rise mt-6 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-2 font-extrabold text-blue-950 shadow-[0_12px_30px_-10px_rgba(250,204,21,.7)]"
                style={delay(300)}
              >
                <Sparkles className="h-4 w-4" /> Estás em #{myPosition} no Top Global
              </div>
            )}
          </header>

          <Tabs defaultValue="combined" className="mt-10 w-full">
            <div className="lp-rise flex justify-center" style={delay(350)}>
              <TabsList className="h-auto gap-1 rounded-full bg-white/[0.07] p-1.5 ring-1 ring-inset ring-white/10 group-data-[orientation=horizontal]/tabs:h-auto">
                {tabs.map(({ value, label, short, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="cursor-pointer gap-2 rounded-full px-4 py-2.5 font-bold text-blue-100/80 hover:text-white data-[state=active]:bg-yellow-400 data-[state=active]:text-blue-950 data-[state=active]:shadow-lg sm:px-6"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {tabs.map(({ value }) => (
              <TabsContent key={value} value={value} className="mt-14 space-y-8">
                <Podium data={rankings[value]} type={value} userId={user?.id} />
                <RankList data={rankings[value]} type={value} userId={user?.id} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
