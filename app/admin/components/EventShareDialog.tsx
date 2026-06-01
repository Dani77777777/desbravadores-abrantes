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
  end_at: string
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
  const dateStr = formatDate(event.start_at)
  const startTime = formatTime(event.start_at)
  const endTime = formatTime(event.end_at)

  return (
    <div style={{
      width: 1920, height: 1080,
      background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 40%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '80px 100px',
      fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
      position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
    }}>
      <div style={{ position: 'absolute', top: -120, right: -120, width: 500, height: 500, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
      <div style={{ position: 'absolute', bottom: -80, left: -80, width: 380, height: 380, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
      <div style={{ position: 'absolute', top: '40%', right: '15%', width: 250, height: 250, borderRadius: '50%', background: 'rgba(96,165,250,0.08)' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUrl} alt="Desbravadores" style={{ height: 90, objectFit: 'contain' }} />
        {section && (
          <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 50, padding: '10px 32px', color: '#fff', fontSize: 28, fontWeight: 600 }}>
            {section}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32 }}>
        <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 20px', width: 'fit-content' }}>
          <span style={{ fontSize: 20, color: '#93c5fd', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>Evento</span>
        </div>
        <h1 style={{ fontSize: 96, fontWeight: 800, color: '#fff', lineHeight: 1.05, margin: 0, textShadow: '0 4px 20px rgba(0,0,0,0.3)', maxWidth: 1400 }}>
          {event.title}
        </h1>
        {event.description && (
          <p style={{ fontSize: 36, color: 'rgba(255,255,255,0.7)', margin: 0, maxWidth: 1100, lineHeight: 1.4 }}>
            {event.description.length > 120 ? event.description.slice(0, 120) + '…' : event.description}
          </p>
        )}
        <div style={{ display: 'flex', gap: 60, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 22, color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Data</span>
            <span style={{ fontSize: 34, color: '#fff', fontWeight: 600 }}>{dateStr}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 22, color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Horário</span>
            <span style={{ fontSize: 34, color: '#fff', fontWeight: 600 }}>{startTime} – {endTime}</span>
          </div>
          {event.location && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 22, color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Local</span>
              <span style={{ fontSize: 34, color: '#fff', fontWeight: 600 }}>{event.location}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', borderRadius: 12, padding: '12px 28px' }}>
            <span style={{ fontSize: 32 }}>🏆</span>
            <span style={{ fontSize: 32, color: '#c7d2fe', fontWeight: 700 }}>{event.xp_reward} XP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(234,179,8,0.2)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 12, padding: '12px 28px' }}>
            <span style={{ fontSize: 32 }}>🪙</span>
            <span style={{ fontSize: 32, color: '#fde047', fontWeight: 700 }}>{event.gold_reward} Gold</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
          {qrDataUrl && (
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR" style={{ width: 120, height: 120, display: 'block' }} />
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 24, color: 'rgba(255,255,255,0.5)', margin: 0, marginBottom: 4 }}>Junta-te a nós em</p>
            <p style={{ fontSize: 28, color: '#93c5fd', fontWeight: 700, margin: 0 }}>{SITE_URL}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 1:1 card (social share) ─────────────────────────────────────────────────

const ShareCard = ({ event, logoDataUrl }: CardProps) => {
  const section = event.target_section ? SECTION_LABELS[event.target_section] : null
  const dateStr = formatDate(event.start_at)
  const startTime = formatTime(event.start_at)
  const endTime = formatTime(event.end_at)

  return (
    <div style={{
      width: 1080, height: 1080,
      background: 'linear-gradient(150deg, #1e3a8a 0%, #1e40af 50%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '72px 80px',
      fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
      position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
    }}>
      {/* decorative circles */}
      <div style={{ position: 'absolute', top: -100, right: -100, width: 450, height: 450, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
      <div style={{ position: 'absolute', bottom: 80, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(96,165,250,0.08)' }} />
      <div style={{ position: 'absolute', bottom: -60, left: -60, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />

      {/* top: logo + section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUrl} alt="Desbravadores" style={{ height: 80, objectFit: 'contain' }} />
        {section && (
          <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 50, padding: '8px 28px', color: '#fff', fontSize: 26, fontWeight: 600 }}>
            {section}
          </div>
        )}
      </div>

      {/* center: content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28, position: 'relative' }}>
        <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 18px', width: 'fit-content' }}>
          <span style={{ fontSize: 18, color: '#93c5fd', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>Evento</span>
        </div>

        <h1 style={{ fontSize: 80, fontWeight: 800, color: '#fff', lineHeight: 1.05, margin: 0, textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          {event.title}
        </h1>

        {event.description && (
          <p style={{ fontSize: 30, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.4 }}>
            {event.description.length > 100 ? event.description.slice(0, 100) + '…' : event.description}
          </p>
        )}

        {/* info blocks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 20, color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, minWidth: 100 }}>Data</span>
            <span style={{ fontSize: 30, color: '#fff', fontWeight: 600 }}>{dateStr}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 20, color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, minWidth: 100 }}>Horário</span>
            <span style={{ fontSize: 30, color: '#fff', fontWeight: 600 }}>{startTime} – {endTime}</span>
          </div>
          {event.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 20, color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, minWidth: 100 }}>Local</span>
              <span style={{ fontSize: 30, color: '#fff', fontWeight: 600 }}>{event.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* bottom: rewards + url */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', borderRadius: 12, padding: '10px 22px' }}>
            <span style={{ fontSize: 26 }}>🏆</span>
            <span style={{ fontSize: 26, color: '#c7d2fe', fontWeight: 700 }}>{event.xp_reward} XP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(234,179,8,0.2)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 12, padding: '10px 22px' }}>
            <span style={{ fontSize: 26 }}>🪙</span>
            <span style={{ fontSize: 26, color: '#fde047', fontWeight: 700 }}>{event.gold_reward} Gold</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.5)', margin: 0, marginBottom: 3 }}>Junta-te a nós em</p>
          <p style={{ fontSize: 24, color: '#93c5fd', fontWeight: 700, margin: 0 }}>{SITE_URL}</p>
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
