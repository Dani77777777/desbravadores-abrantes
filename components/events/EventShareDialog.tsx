'use client'

import { useRef, useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Download, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeCanvas } from 'qrcode.react'

interface Event {
  id: string
  title: string
  description?: string
  location?: string
  start_at: string
  end_at?: string | null
  target_section?: string
  xp_reward: number
  gold_reward: number
}

const SECTION_LABELS: Record<string, string> = {
  rebentos: 'Rebentos',
  ticoes: 'Tições',
  exploradores: 'Exploradores',
  companheiros: 'Companheiros',
  embaixadores: 'Embaixadores',
}

const SITE_URL = 'desbravadores-abrantes.vercel.app'

function formatDate(iso: string) {
  const raw = new Date(iso).toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  // capitalize first letter (weekday) and the month name only
  return (raw.charAt(0).toUpperCase() + raw.slice(1))
    .replace(/ de ([a-záéíóúãõâêô])/, (_, c) => ` de ${c.toUpperCase()}`)
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

function dateParts(iso: string) {
  const d = new Date(iso)
  return {
    day: d.getDate(),
    month: d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '').toUpperCase(),
    weekday: d.toLocaleDateString('pt-PT', { weekday: 'long' }),
  }
}

const CARD_BG = [
  'radial-gradient(ellipse 60% 50% at 15% 0%, rgba(59,130,246,0.35) 0%, rgba(59,130,246,0) 70%)',
  'radial-gradient(ellipse 50% 45% at 90% 100%, rgba(99,102,241,0.3) 0%, rgba(99,102,241,0) 70%)',
  'radial-gradient(ellipse 40% 35% at 75% 15%, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0) 70%)',
  'linear-gradient(160deg, #122a63 0%, #0d1f4e 45%, #0a1228 100%)',
].join(', ')

const ACCENT_BAR = 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 25%, #3b82f6 70%, #6366f1 100%)'

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

// ─── 16:9 card (download) ───────────────────────────────────────────────────

interface CardProps {
  event: Event
  logoDataUrl: string
  qrDataUrl?: string
}

const DownloadCard = ({ event, logoDataUrl, qrDataUrl }: CardProps) => {
  const section = event.target_section ? SECTION_LABELS[event.target_section] : null
  const { day, month, weekday } = dateParts(event.start_at)
  const startTime = formatTime(event.start_at)
  const endTime = event.end_at ? formatTime(event.end_at) : null

  return (
    <div style={{
      width: 1920, height: 1080,
      background: CARD_BG,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '90px 100px 70px',
      fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
      position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
    }}>
      {/* top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: ACCENT_BAR }} />
      {/* decorative rings */}
      <div style={{ position: 'absolute', top: -180, right: -180, width: 620, height: 620, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.07)' }} />
      <div style={{ position: 'absolute', top: -120, right: -120, width: 500, height: 500, borderRadius: '50%', border: '2px solid rgba(251,191,36,0.12)' }} />
      <div style={{ position: 'absolute', bottom: -140, left: -140, width: 420, height: 420, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.06)' }} />

      {/* header: logo + section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        {logoDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoDataUrl} alt="Desbravadores" style={{ height: 95, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }} />
        ) : <div style={{ height: 95 }} />}
        {section && (
          <div style={{ background: 'rgba(251,191,36,0.15)', border: '1.5px solid rgba(251,191,36,0.45)', borderRadius: 50, padding: '12px 36px', color: '#fcd34d', fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>
            {section}
          </div>
        )}
      </div>

      {/* center: date block + content side by side */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 80, position: 'relative' }}>
        {/* big calendar chip */}
        <div style={{
          width: 280, flexShrink: 0,
          background: 'rgba(255,255,255,0.06)',
          border: '1.5px solid rgba(255,255,255,0.14)',
          borderRadius: 28, overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ background: ACCENT_BAR, padding: '14px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#0a1228', letterSpacing: 6 }}>{month}</span>
          </div>
          <div style={{ padding: '24px 0 10px', textAlign: 'center' }}>
            <span style={{ fontSize: 130, fontWeight: 900, color: '#fff', lineHeight: 1, textShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>{day}</span>
          </div>
          <div style={{ padding: '0 0 24px', textAlign: 'center' }}>
            <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.65)', fontWeight: 600, textTransform: 'capitalize' }}>{weekday}</span>
          </div>
        </div>

        {/* text content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 5, background: '#fbbf24', borderRadius: 3 }} />
            <span style={{ fontSize: 22, color: '#fbbf24', fontWeight: 800, letterSpacing: 6, textTransform: 'uppercase' }}>Evento</span>
          </div>
          <h1 style={{ fontSize: 92, fontWeight: 900, color: '#fff', lineHeight: 1.04, margin: 0, textShadow: '0 6px 30px rgba(0,0,0,0.4)', maxWidth: 1250 }}>
            {event.title}
          </h1>
          {event.description && (
            <p style={{ fontSize: 34, color: 'rgba(255,255,255,0.7)', margin: 0, maxWidth: 1100, lineHeight: 1.45 }}>
              {event.description.length > 120 ? event.description.slice(0, 120) + '…' : event.description}
            </p>
          )}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: '14px 28px' }}>
              <span style={{ fontSize: 30 }}>🕐</span>
              <span style={{ fontSize: 30, color: '#fff', fontWeight: 700 }}>{startTime}{endTime ? ` – ${endTime}` : ''}</span>
            </div>
            {event.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: '14px 28px' }}>
                <span style={{ fontSize: 30 }}>📍</span>
                <span style={{ fontSize: 30, color: '#fff', fontWeight: 700 }}>{event.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* footer: rewards + QR + url */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(99,102,241,0.22)', border: '1.5px solid rgba(129,140,248,0.5)', borderRadius: 16, padding: '16px 32px', whiteSpace: 'nowrap', boxShadow: '0 8px 30px rgba(99,102,241,0.25)' }}>
            <span style={{ fontSize: 34 }}>🏆</span>
            <span style={{ fontSize: 34, color: '#c7d2fe', fontWeight: 800, whiteSpace: 'nowrap' }}>+{event.xp_reward} XP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(234,179,8,0.16)', border: '1.5px solid rgba(250,204,21,0.45)', borderRadius: 16, padding: '16px 32px', whiteSpace: 'nowrap', boxShadow: '0 8px 30px rgba(234,179,8,0.2)' }}>
            <span style={{ fontSize: 34 }}>🪙</span>
            <span style={{ fontSize: 34, color: '#fde047', fontWeight: 800, whiteSpace: 'nowrap' }}>+{event.gold_reward} Gold</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
          <div style={{ textAlign: 'right', paddingBottom: 6 }}>
            <p style={{ fontSize: 24, color: 'rgba(255,255,255,0.5)', margin: 0, marginBottom: 6 }}>Junta-te a nós em</p>
            <p style={{ fontSize: 30, color: '#fbbf24', fontWeight: 800, margin: 0 }}>{SITE_URL}</p>
          </div>
          {qrDataUrl && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.35)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR" style={{ width: 130, height: 130, display: 'block' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 1:1 card (social share) ─────────────────────────────────────────────────

const ShareCard = ({ event, logoDataUrl }: CardProps) => {
  const section = event.target_section ? SECTION_LABELS[event.target_section] : null
  const { day, month, weekday } = dateParts(event.start_at)
  const startTime = formatTime(event.start_at)
  const endTime = event.end_at ? formatTime(event.end_at) : null

  return (
    <div style={{
      width: 1080, height: 1080,
      background: CARD_BG,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '76px 80px 64px',
      fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
      position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
    }}>
      {/* top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: ACCENT_BAR }} />
      {/* decorative rings */}
      <div style={{ position: 'absolute', top: -160, right: -160, width: 520, height: 520, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.07)' }} />
      <div style={{ position: 'absolute', top: -110, right: -110, width: 420, height: 420, borderRadius: '50%', border: '2px solid rgba(251,191,36,0.12)' }} />
      <div style={{ position: 'absolute', bottom: -120, left: -120, width: 360, height: 360, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.06)' }} />

      {/* top: logo + section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        {logoDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoDataUrl} alt="Desbravadores" style={{ height: 82, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }} />
        ) : <div style={{ height: 82 }} />}
        {section && (
          <div style={{ background: 'rgba(251,191,36,0.15)', border: '1.5px solid rgba(251,191,36,0.45)', borderRadius: 50, padding: '10px 30px', color: '#fcd34d', fontSize: 25, fontWeight: 700, letterSpacing: 1 }}>
            {section}
          </div>
        )}
      </div>

      {/* center: content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 5, background: '#fbbf24', borderRadius: 3 }} />
          <span style={{ fontSize: 19, color: '#fbbf24', fontWeight: 800, letterSpacing: 5, textTransform: 'uppercase' }}>Evento</span>
        </div>

        <h1 style={{ fontSize: 76, fontWeight: 900, color: '#fff', lineHeight: 1.05, margin: 0, textShadow: '0 6px 30px rgba(0,0,0,0.4)' }}>
          {event.title}
        </h1>

        {event.description && (
          <p style={{ fontSize: 29, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.45 }}>
            {event.description.length > 100 ? event.description.slice(0, 100) + '…' : event.description}
          </p>
        )}

        {/* date chip + info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: 10 }}>
          <div style={{
            width: 150, flexShrink: 0,
            background: 'rgba(255,255,255,0.06)',
            border: '1.5px solid rgba(255,255,255,0.14)',
            borderRadius: 20, overflow: 'hidden',
            boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
          }}>
            <div style={{ background: ACCENT_BAR, padding: '8px 0', textAlign: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#0a1228', letterSpacing: 4 }}>{month}</span>
            </div>
            <div style={{ padding: '12px 0 14px', textAlign: 'center' }}>
              <span style={{ fontSize: 68, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{day}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 28, color: '#fff', fontWeight: 700, textTransform: 'capitalize' }}>{weekday}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 25 }}>🕐</span>
              <span style={{ fontSize: 27, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{startTime}{endTime ? ` – ${endTime}` : ''}</span>
            </div>
            {event.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 25 }}>📍</span>
                <span style={{ fontSize: 27, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{event.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* bottom: rewards + url */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ display: 'flex', gap: 18, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(99,102,241,0.22)', border: '1.5px solid rgba(129,140,248,0.5)', borderRadius: 14, padding: '12px 24px', whiteSpace: 'nowrap', boxShadow: '0 8px 30px rgba(99,102,241,0.25)' }}>
            <span style={{ fontSize: 27 }}>🏆</span>
            <span style={{ fontSize: 27, color: '#c7d2fe', fontWeight: 800, whiteSpace: 'nowrap' }}>+{event.xp_reward} XP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(234,179,8,0.16)', border: '1.5px solid rgba(250,204,21,0.45)', borderRadius: 14, padding: '12px 24px', whiteSpace: 'nowrap', boxShadow: '0 8px 30px rgba(234,179,8,0.2)' }}>
            <span style={{ fontSize: 27 }}>🪙</span>
            <span style={{ fontSize: 27, color: '#fde047', fontWeight: 800, whiteSpace: 'nowrap' }}>+{event.gold_reward} Gold</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 19, color: 'rgba(255,255,255,0.5)', margin: 0, marginBottom: 3, whiteSpace: 'nowrap' }}>Junta-te a nós em</p>
          <p style={{ fontSize: 23, color: '#fbbf24', fontWeight: 800, margin: 0, whiteSpace: 'nowrap' }}>{SITE_URL}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface EventShareDialogProps {
  event: Event
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EventShareDialog({ event, open, onOpenChange }: EventShareDialogProps) {
  const downloadRef = useRef<HTMLDivElement>(null)
  const shareRef = useRef<HTMLDivElement>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState<'download' | 'share' | null>(null)
  const [logoDataUrl, setLogoDataUrl] = useState<string>('')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    if (!open) return
    fetchLogoAsDataUrl()
      .then(setLogoDataUrl)
      .catch(() => setLogoDataUrl(''))
  }, [open])

  // extract QR data URL from canvas after it renders
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      const canvas = qrCanvasRef.current
      if (canvas) setQrDataUrl(canvas.toDataURL('image/png'))
    }, 150)
    return () => clearTimeout(timer)
  }, [open])

  const slug = event.title.toLowerCase().replace(/\s+/g, '-')

  const buildShareText = () => {
    const dateStr = formatDate(event.start_at)
    const startTime = formatTime(event.start_at)
    const location = event.location ? ` em ${event.location}` : ''
    return `📅 ${event.title}\n${dateStr} às ${startTime}${location}\n\nGanha ${event.xp_reward} XP e ${event.gold_reward} Gold por participares!\n\n🌐 ${SITE_URL}`
  }

  const captureNode = async (ref: React.RefObject<HTMLDivElement | null>): Promise<{ blob: Blob; dataUrl: string }> => {
    const { toPng } = await import('html-to-image')
    const node = ref.current
    if (!node) throw new Error('Card não pronto')
    const dataUrl = await toPng(node, { pixelRatio: 1, cacheBust: true })
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    return { blob, dataUrl }
  }

  const handleDownload = async () => {
    setLoading('download')
    try {
      const { dataUrl } = await captureNode(downloadRef)
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `evento-${slug}.png`
      a.click()
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
      const { blob, dataUrl } = await captureNode(shareRef)
      const file = new File([blob], `evento-${slug}.png`, { type: 'image/png' })
      const text = buildShareText()

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text })
        toast.success('Partilhado com sucesso!')
      } else if (navigator.share) {
        await navigator.share({ text })
        toast.success('Partilhado com sucesso!')
      } else {
        await navigator.clipboard.writeText(text)
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `evento-${slug}.png`
        a.click()
        toast.success('Texto copiado e imagem descarregada!')
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Erro ao partilhar.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-blue-700" />
            Partilhar Evento
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-1">
          Escolhe como queres partilhar <span className="font-semibold text-gray-700">{event.title}</span>.
        </p>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={handleDownload}
            disabled={!!loading}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
              <Download className="w-6 h-6 text-blue-700" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-800 text-sm">Descarregar</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Imagem 16:9 para partilhar</p>
            </div>
            {loading === 'download' && <span className="text-[11px] text-blue-600 font-medium">A gerar…</span>}
          </button>

          <button
            onClick={handleShare}
            disabled={!!loading}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
              <Share2 className="w-6 h-6 text-blue-700" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-800 text-sm">Partilhar</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Redes sociais, WhatsApp…</p>
            </div>
            {loading === 'share' && <span className="text-[11px] text-blue-600 font-medium">A preparar…</span>}
          </button>
        </div>

        {/* off-screen: QR canvas to extract data URL, then both image cards */}
        <div style={{ position: 'fixed', top: -99999, left: -99999, pointerEvents: 'none', zIndex: -1 }}>
          <QRCodeCanvas
            ref={qrCanvasRef}
            value={`https://${SITE_URL}`}
            size={240}
            bgColor="#ffffff"
            fgColor="#1e3a8a"
          />
          <div ref={downloadRef} style={{ width: 1920, height: 1080, overflow: 'hidden' }}>
            <DownloadCard event={event} logoDataUrl={logoDataUrl} qrDataUrl={qrDataUrl} />
          </div>
          <div ref={shareRef} style={{ width: 1080, height: 1080, overflow: 'hidden' }}>
            <ShareCard event={event} logoDataUrl={logoDataUrl} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
