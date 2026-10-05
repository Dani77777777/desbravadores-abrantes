'use client'

import { useRef, useState, useEffect, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlarmClock, Calendar, Clock, Coins, Download, MapPin, Share2, Trophy, Loader2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeCanvas } from 'qrcode.react'
import { displayFont } from '@/components/landing/fonts'
import { isRsvpOpen } from '@/utils/event-rsvp'
import { googleMapsUrl } from '@/utils/maps'
import { isOnlineEvent, onlineLabel } from '@/utils/online-event'

interface Event {
  id: string
  title: string
  description?: string | null
  location?: string | null
  location_lat?: number | null
  location_lng?: number | null
  is_online?: boolean | null
  online_url?: string | null
  start_at: string
  end_at?: string | null
  target_section?: string | null
  xp_reward: number
  gold_reward: number
  is_finished?: boolean | null
  rsvp_enabled?: boolean | null
  rsvp_deadline?: string | null
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

const SITE_URL = 'desbravadores-abrantes.vercel.app'
const TZ = 'Europe/Lisbon'

// Cores da marca (as mesmas da página inicial)
const C = {
  navy: '#172554',
  navyDeep: '#0b1433',
  yellow: '#facc15',
  yellowSoft: '#fde68a',
  red: '#ef4444',
  white: '#ffffff',
  muted: 'rgba(219,234,254,0.72)',
  line: 'rgba(255,255,255,0.12)',
}

const DISPLAY = displayFont.style.fontFamily
const BODY = '"Inter", "Helvetica Neue", Arial, sans-serif'

// ─── Datas (sempre no fuso do clube) ──────────────────────────────────────────

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('pt-PT', { timeZone: TZ, ...o })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const sameDay = (a: string, b: string) => fmt(a, { dateStyle: 'short' }) === fmt(b, { dateStyle: 'short' })
const time = (iso: string) => fmt(iso, { hour: '2-digit', minute: '2-digit' })
const monthShort = (iso: string) => fmt(iso, { month: 'short' }).replace('.', '')
/** "18 out" (o pt-PT junta dia + mês curto como "18/10", por isso monta-se à mão). */
const dayMonthShort = (iso: string) => `${fmt(iso, { day: 'numeric' })} ${monthShort(iso)}`

/** "Sábado, 12 de outubro" ou "12 – 14 de outubro" (vários dias). */
function dateLine(e: Event) {
  if (e.end_at && !sameDay(e.start_at, e.end_at)) {
    const sameMonth = fmt(e.start_at, { month: 'long' }) === fmt(e.end_at, { month: 'long' })
    return sameMonth
      ? `${fmt(e.start_at, { day: 'numeric' })} a ${fmt(e.end_at, { day: 'numeric', month: 'long' })}`
      : `${dayMonthShort(e.start_at)} a ${dayMonthShort(e.end_at)}`
  }
  return cap(fmt(e.start_at, { weekday: 'long', day: 'numeric', month: 'long' }))
}

/** "18:00 – 20:00", "18:00" ou "Sáb. 09:00 → seg. 18:00". */
function timeLine(e: Event) {
  if (!e.end_at) return time(e.start_at)
  if (sameDay(e.start_at, e.end_at)) return `${time(e.start_at)} – ${time(e.end_at)}`
  const wd = (iso: string) => fmt(iso, { weekday: 'short' }).replace('.', '')
  return `${cap(wd(e.start_at))} ${time(e.start_at)} → ${wd(e.end_at)} ${time(e.end_at)}`
}

/** "Sábado, 12 out · 18:00" */
function deadlineLine(iso: string) {
  const wd = cap(fmt(iso, { weekday: 'long' }).replace('-feira', ''))
  return `${wd}, ${dayMonthShort(iso)} · ${time(iso)}`
}

type RsvpInfo = { label: string; when: string | null }

/** Confirmação de presença (null se o evento não pede ou já fechou). */
function rsvpInfo(e: Event): RsvpInfo | null {
  if (!e.rsvp_enabled || !isRsvpOpen({ ...e, rsvp_enabled: true }, Date.now())) return null
  return e.rsvp_deadline
    ? { label: 'Confirma a presença até', when: deadlineLine(e.rsvp_deadline) }
    : { label: 'Confirma a tua presença', when: null }
}

/** Para o texto da partilha. */
function rsvpText(r: RsvpInfo) {
  return r.when ? `${r.label} ${r.when.replace(' · ', ' às ')}` : r.label
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s)

/**
 * Linha do local: "Online · Zoom" ou o texto do local físico. null sem local.
 * A imagem é pública (redes sociais), por isso o link da reunião fica só no Painel.
 */
function PlaceRow({ e, size, max }: { e: Event; size: number; max: number }) {
  if (isOnlineEvent(e)) {
    return (
      <InfoRow size={size} icon={<Video size={size} strokeWidth={2.4} />}>
        {onlineLabel(e)}
        <span style={{ display: 'block', fontSize: size * 0.68, fontWeight: 600, color: C.muted, marginTop: size * 0.1 }}>
          Link para entrar no Painel do site
        </span>
      </InfoRow>
    )
  }
  if (!e.location) return null
  return <InfoRow size={size} icon={<MapPin size={size} strokeWidth={2.4} />}>{truncate(e.location, max)}</InfoRow>
}

async function fetchLogoAsDataUrl(): Promise<string> {
  const url = window.location.origin + '/images/Logo%20Desbravadores.png'
  const res = await fetch(url)
  if (!res.ok) throw new Error('logo fetch failed')
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ─── Peças comuns ─────────────────────────────────────────────────────────────

/** Fundo: azul da marca, brilhos amarelo/índigo, grelha de pontos e o logo em marca de água. */
function Backdrop({ logo, logoSize, logoPos }: { logo: string; logoSize: number; logoPos: { right: number; bottom: number } }) {
  return (
    <>
      <div style={{
        position: 'absolute', inset: 0,
        background: [
          'radial-gradient(ellipse 55% 60% at 100% 0%, rgba(250,204,21,0.26) 0%, rgba(250,204,21,0) 70%)',
          'radial-gradient(ellipse 50% 60% at 0% 100%, rgba(99,102,241,0.42) 0%, rgba(99,102,241,0) 70%)',
          `linear-gradient(155deg, #1e3a8a 0%, ${C.navy} 45%, ${C.navyDeep} 100%)`,
        ].join(', '),
      }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.09,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1.5px, transparent 1.5px)',
        backgroundSize: '34px 34px',
      }} />
      {logo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={logo} alt="" style={{
          position: 'absolute', width: logoSize, height: logoSize, objectFit: 'contain',
          right: logoPos.right, bottom: logoPos.bottom, opacity: 0.06, transform: 'rotate(-12deg)',
        }} />
      )}
      {/* faixa amarela em cima */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: `linear-gradient(90deg, ${C.yellow} 0%, #f59e0b 50%, ${C.yellow} 100%)` }} />
    </>
  )
}

/** Folha de calendário inclinada (igual à do "Próximo evento" da página inicial). */
function CalendarLeaf({ e, scale }: { e: Event; scale: number }) {
  const multi = e.end_at && !sameDay(e.start_at, e.end_at)
  return (
    <div style={{
      width: 300 * scale, transform: 'rotate(-4deg)', borderRadius: 40 * scale, overflow: 'hidden',
      background: C.white, textAlign: 'center', color: C.navy,
      boxShadow: `0 0 0 ${7 * scale}px ${C.yellow}, 0 ${30 * scale}px ${70 * scale}px rgba(0,0,0,0.45)`,
    }}>
      <div style={{ background: C.red, color: C.white, padding: `${14 * scale}px 0`, fontSize: 30 * scale, fontWeight: 800, letterSpacing: 8 * scale, fontFamily: BODY }}>
        {monthShort(e.start_at).toUpperCase()}
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 168 * scale, fontWeight: 800, lineHeight: 1, padding: `${18 * scale}px 0 ${4 * scale}px` }}>
        {fmt(e.start_at, { day: 'numeric' })}
      </div>
      <div style={{ fontFamily: BODY, fontSize: 28 * scale, fontWeight: 700, color: '#78716c', paddingBottom: 24 * scale, textTransform: 'capitalize' }}>
        {multi ? `até ${dayMonthShort(e.end_at!)}` : fmt(e.start_at, { weekday: 'long' }).replace('-feira', '')}
      </div>
    </div>
  )
}

function InfoRow({ icon, children, size }: { icon: ReactNode; children: ReactNode; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.6 }}>
      <div style={{
        width: size * 1.9, height: size * 1.9, borderRadius: size * 0.6, flexShrink: 0,
        background: 'rgba(250,204,21,0.14)', border: '1.5px solid rgba(250,204,21,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.yellow,
      }}>
        {icon}
      </div>
      <span style={{ fontFamily: BODY, fontSize: size, fontWeight: 700, color: C.white, lineHeight: 1.25 }}>{children}</span>
    </div>
  )
}

function RewardChip({ kind, value, size }: { kind: 'xp' | 'gold'; value: number; size: number }) {
  const xp = kind === 'xp'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: size * 0.45, whiteSpace: 'nowrap',
      padding: `${size * 0.45}px ${size * 0.9}px`, borderRadius: 999,
      background: xp ? 'rgba(129,140,248,0.2)' : 'rgba(250,204,21,0.16)',
      border: `1.5px solid ${xp ? 'rgba(165,180,252,0.55)' : 'rgba(250,204,21,0.5)'}`,
      color: xp ? '#c7d2fe' : C.yellowSoft, fontFamily: BODY, fontSize: size, fontWeight: 800,
    }}>
      {xp ? <Trophy size={size} strokeWidth={2.5} /> : <Coins size={size} strokeWidth={2.5} />}
      +{value} {xp ? 'XP' : 'Gold'}
    </div>
  )
}

/** Faixa amarela "Confirma até …". */
function RsvpBanner({ info, size }: { info: RsvpInfo; size: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: size * 0.8,
      background: C.yellow, color: C.navy, borderRadius: size * 0.9,
      padding: `${size * 0.7}px ${size * 1.1}px`,
      boxShadow: `0 ${size * 0.6}px ${size * 1.6}px rgba(250,204,21,0.3)`,
    }}>
      <div style={{
        width: size * 2.2, height: size * 2.2, borderRadius: 999, background: C.navy, color: C.yellow, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlarmClock size={size * 1.15} strokeWidth={2.5} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: size * 0.62, fontWeight: 800, letterSpacing: size * 0.08, textTransform: 'uppercase', opacity: 0.75 }}>
          {info.label}
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: size * 1.15, fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap' }}>
          {info.when ?? 'no Painel'}
        </div>
        <div style={{ fontFamily: BODY, fontSize: size * 0.62, fontWeight: 600, opacity: 0.75, marginTop: size * 0.1 }}>
          {info.when ? 'No Painel: Vou / Não vou' : 'Vou / Não vou'}
        </div>
      </div>
    </div>
  )
}

function Kicker({ section, size }: { section: string; size: number }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: size * 0.6, alignSelf: 'flex-start',
      padding: `${size * 0.5}px ${size * 1.1}px`, borderRadius: 999,
      background: 'rgba(255,255,255,0.08)', border: `1.5px solid ${C.line}`,
      fontFamily: BODY, fontSize: size, fontWeight: 800, letterSpacing: size * 0.18, textTransform: 'uppercase', color: C.yellow,
    }}>
      <span style={{ width: size * 0.55, height: size * 0.55, borderRadius: 999, background: '#34d399', boxShadow: '0 0 0 5px rgba(52,211,153,0.25)' }} />
      Evento · {section}
    </div>
  )
}

// ─── 16:9 (descarregar) ───────────────────────────────────────────────────────

interface CardProps {
  event: Event
  logoDataUrl: string
  qrDataUrl?: string
}

const WideCard = ({ event, logoDataUrl, qrDataUrl }: CardProps) => {
  const section = event.target_section ? SECTION_LABELS[event.target_section] : 'Todo o clube'
  const rsvp = rsvpInfo(event)
  const titleSize = event.title.length > 34 ? 84 : event.title.length > 22 ? 100 : 116

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', fontFamily: BODY, color: C.white }}>
      <Backdrop logo={logoDataUrl} logoSize={900} logoPos={{ right: -160, bottom: -220 }} />

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: '74px 100px 64px', boxSizing: 'border-box' }}>
        {/* topo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            {logoDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoDataUrl} alt="" style={{ height: 92, objectFit: 'contain', filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.4))' }} />
            )}
            <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
              Desbravadores<br /><span style={{ color: C.yellow }}>Abrantes</span>
            </div>
          </div>
          <Kicker section={section} size={24} />
        </div>

        {/* centro */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 110 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 30 }}>
            <h1 style={{ fontFamily: DISPLAY, fontSize: titleSize, fontWeight: 800, lineHeight: 1, letterSpacing: -2, margin: 0, textShadow: '0 8px 30px rgba(0,0,0,0.35)' }}>
              {event.title}
            </h1>
            <div style={{ width: 120, height: 8, borderRadius: 8, background: C.yellow }} />
            {event.description && (
              <p style={{ fontSize: 32, color: C.muted, margin: 0, lineHeight: 1.45, maxWidth: 1050 }}>
                {truncate(event.description, 130)}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 6 }}>
              <InfoRow size={32} icon={<Calendar size={32} strokeWidth={2.4} />}>{dateLine(event)}</InfoRow>
              <InfoRow size={32} icon={<Clock size={32} strokeWidth={2.4} />}>{timeLine(event)}</InfoRow>
              <PlaceRow e={event} size={32} max={60} />
            </div>
          </div>

          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 60, width: 520 }}>
            <CalendarLeaf e={event} scale={1.25} />
            {rsvp && <RsvpBanner info={rsvp} size={30} />}
          </div>
        </div>

        {/* rodapé */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 34, borderTop: `1.5px solid ${C.line}` }}>
          <div style={{ display: 'flex', gap: 18 }}>
            <RewardChip kind="xp" value={event.xp_reward} size={32} />
            <RewardChip kind="gold" value={event.gold_reward} size={32} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, color: C.muted, marginBottom: 4 }}>Junta-te a nós em</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 800, color: C.yellow }}>{SITE_URL}</div>
            </div>
            {qrDataUrl && (
              <div style={{ background: C.white, borderRadius: 20, padding: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="" style={{ width: 120, height: 120, display: 'block' }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 1:1 (redes sociais) ──────────────────────────────────────────────────────

const SquareCard = ({ event, logoDataUrl }: CardProps) => {
  const section = event.target_section ? SECTION_LABELS[event.target_section] : 'Todo o clube'
  const rsvp = rsvpInfo(event)
  const titleSize = event.title.length > 30 ? 66 : event.title.length > 18 ? 78 : 92

  return (
    <div style={{ width: 1080, height: 1080, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', fontFamily: BODY, color: C.white }}>
      <Backdrop logo={logoDataUrl} logoSize={620} logoPos={{ right: -150, bottom: -150 }} />

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: '64px 72px 56px', boxSizing: 'border-box' }}>
        {/* topo: logo + calendário */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {logoDataUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoDataUrl} alt="" style={{ height: 76, objectFit: 'contain', filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.4))' }} />
              )}
              <div style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 800, lineHeight: 1.1 }}>
                Desbravadores<br /><span style={{ color: C.yellow }}>Abrantes</span>
              </div>
            </div>
            <Kicker section={section} size={19} />
          </div>
          <div style={{ marginTop: 14, marginRight: 8 }}>
            <CalendarLeaf e={event} scale={0.78} />
          </div>
        </div>

        {/* título + info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
          <h1 style={{ fontFamily: DISPLAY, fontSize: titleSize, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1.5, margin: 0, textShadow: '0 8px 30px rgba(0,0,0,0.35)' }}>
            {event.title}
          </h1>
          <div style={{ width: 90, height: 7, borderRadius: 7, background: C.yellow }} />
          {event.description && !rsvp && (
            <p style={{ fontSize: 27, color: C.muted, margin: 0, lineHeight: 1.45 }}>{truncate(event.description, 110)}</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <InfoRow size={27} icon={<Calendar size={27} strokeWidth={2.4} />}>{dateLine(event)}</InfoRow>
            <InfoRow size={27} icon={<Clock size={27} strokeWidth={2.4} />}>{timeLine(event)}</InfoRow>
            <PlaceRow e={event} size={27} max={48} />
          </div>
        </div>

        {rsvp && <div style={{ marginBottom: 30 }}><RsvpBanner info={rsvp} size={25} /></div>}

        {/* rodapé */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, borderTop: `1.5px solid ${C.line}` }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <RewardChip kind="xp" value={event.xp_reward} size={25} />
            <RewardChip kind="gold" value={event.gold_reward} size={25} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, color: C.muted, marginBottom: 2 }}>Junta-te a nós em</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 800, color: C.yellow }}>{SITE_URL}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Diálogo ──────────────────────────────────────────────────────────────────

interface EventShareDialogProps {
  event: Event
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Format = 'wide' | 'square'

export function EventShareDialog({ event, open, onOpenChange }: EventShareDialogProps) {
  const wideRef = useRef<HTMLDivElement>(null)
  const squareRef = useRef<HTMLDivElement>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState<'download' | 'share' | null>(null)
  const [logoDataUrl, setLogoDataUrl] = useState<string>('')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [format, setFormat] = useState<Format>('square')

  useEffect(() => {
    if (!open) return
    fetchLogoAsDataUrl()
      .then(setLogoDataUrl)
      .catch(() => setLogoDataUrl(''))
  }, [open])

  // extrair o QR do canvas depois de desenhado
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      const canvas = qrCanvasRef.current
      if (canvas) setQrDataUrl(canvas.toDataURL('image/png'))
    }, 150)
    return () => clearTimeout(timer)
  }, [open])

  const slug = event.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const fileName = `evento-${slug}${format === 'wide' ? '' : '-quadrado'}.png`

  const buildShareText = () => {
    const lines = [`📅 ${event.title}`, `${dateLine(event)} · ${timeLine(event)}`]
    if (isOnlineEvent(event)) {
      lines.push(`💻 ${onlineLabel(event)} · link para entrar no Painel`)
    } else {
      if (event.location) lines.push(`📍 ${event.location}`)
      const map = googleMapsUrl(event)
      if (map && event.location_lat != null) lines.push(`🗺️ ${map}`)
    }
    const rsvp = rsvpInfo(event)
    if (rsvp) lines.push('', `⏰ ${rsvpText(rsvp)} (no Painel: Vou / Não vou)`)
    lines.push('', `Ganha ${event.xp_reward} XP e ${event.gold_reward} Gold por participares!`, '', `🌐 ${SITE_URL}`)
    return lines.join('\n')
  }

  const captureNode = async (): Promise<{ blob: Blob; dataUrl: string }> => {
    const { toPng } = await import('html-to-image')
    const node = (format === 'wide' ? wideRef : squareRef).current
    if (!node) throw new Error('Card não pronto')
    await document.fonts?.ready
    const dataUrl = await toPng(node, { pixelRatio: 1, cacheBust: true })
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    return { blob, dataUrl }
  }

  const downloadDataUrl = (dataUrl: string) => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = fileName
    a.click()
  }

  const handleDownload = async () => {
    setLoading('download')
    try {
      const { dataUrl } = await captureNode()
      downloadDataUrl(dataUrl)
      toast.success('Imagem descarregada!')
    } catch {
      toast.error('Erro ao gerar imagem.')
    } finally {
      setLoading(null)
    }
  }

  const handleShare = async () => {
    setLoading('share')
    try {
      const { blob, dataUrl } = await captureNode()
      const file = new File([blob], fileName, { type: 'image/png' })
      const text = buildShareText()

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text })
        toast.success('Partilhado com sucesso!')
      } else if (navigator.share) {
        await navigator.share({ text })
        toast.success('Partilhado com sucesso!')
      } else {
        await navigator.clipboard.writeText(text)
        downloadDataUrl(dataUrl)
        toast.success('Texto copiado e imagem descarregada!')
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Erro ao partilhar.')
    } finally {
      setLoading(null)
    }
  }

  // Pré-visualização: o mesmo cartão, encolhido
  const PREVIEW_W = 380
  const previewScale = format === 'wide' ? PREVIEW_W / 1920 : 300 / 1080
  const previewH = format === 'wide' ? 1080 * previewScale : 300

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-blue-700" />
            Partilhar Evento
          </DialogTitle>
        </DialogHeader>

        {/* formato */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-sm font-bold">
          {([['square', 'Quadrado · redes sociais'], ['wide', '16:9 · ecrã / projetor']] as const).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${format === f ? 'bg-white text-blue-950 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* pré-visualização */}
        <div className="flex justify-center rounded-2xl bg-stone-100 p-3">
          <div
            className="overflow-hidden rounded-xl shadow-lg ring-1 ring-black/5"
            style={{ width: format === 'wide' ? PREVIEW_W : 300, height: previewH }}
            aria-label="Pré-visualização da imagem"
          >
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              {format === 'wide'
                ? <WideCard event={event} logoDataUrl={logoDataUrl} qrDataUrl={qrDataUrl} />
                : <SquareCard event={event} logoDataUrl={logoDataUrl} />}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDownload}
            disabled={!!loading}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-blue-100 py-3 text-sm font-bold text-blue-900 transition-all hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descarregar
          </button>
          <button
            onClick={handleShare}
            disabled={!!loading}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-950 py-3 text-sm font-bold text-white transition-all hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Partilhar
          </button>
        </div>
        <p className="-mt-1 text-center text-[11px] text-stone-400">
          {rsvpInfo(event) ? 'Inclui o prazo para confirmar a presença.' : 'WhatsApp, Instagram, redes sociais…'}
        </p>

        {/* fora do ecrã: QR para extrair e os cartões em tamanho real para a captura */}
        <div style={{ position: 'fixed', top: -99999, left: -99999, pointerEvents: 'none', zIndex: -1 }} aria-hidden>
          <QRCodeCanvas
            ref={qrCanvasRef}
            value={`https://${SITE_URL}`}
            size={240}
            bgColor="#ffffff"
            fgColor={C.navy}
          />
          <div ref={wideRef} style={{ width: 1920, height: 1080, overflow: 'hidden' }}>
            <WideCard event={event} logoDataUrl={logoDataUrl} qrDataUrl={qrDataUrl} />
          </div>
          <div ref={squareRef} style={{ width: 1080, height: 1080, overflow: 'hidden' }}>
            <SquareCard event={event} logoDataUrl={logoDataUrl} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
