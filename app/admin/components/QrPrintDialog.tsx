'use client'

import { useState, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, Download, Eye, FileText, Share2, QrCode } from 'lucide-react'
import { toast } from 'sonner'

interface QrPrintDialogProps {
  code: string
  title: string
}

export function QrPrintDialog({ code, title }: QrPrintDialogProps) {
  const [open, setOpen] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  
  // No client-side we need the host
  const getFullUrl = () => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/codes/${code}`
  }

  const handlePrint = (format: 'A4' | 'A5') => {
    const content = printRef.current
    if (!content) return

    // Create a temporary hidden iframe for printing
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    document.body.appendChild(iframe)
    
    const doc = iframe.contentWindow?.document
    if (!doc) return

    const qrSvg = content.querySelector('svg')?.outerHTML || ''
    
    doc.write(`
      <html>
        <head>
          <title>Imprimir QR - ${title}</title>
          <style>
            @page {
              size: ${format === 'A4' ? 'A4' : 'A5'};
              margin: 0mm !important;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background-color: white;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .container {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              width: 100%;
              height: 100%;
              padding: 20mm;
              box-sizing: border-box;
            }
            .club-name {
                font-size: 24pt;
                font-weight: 800;
                color: #1e3a8a;
                margin-bottom: 8mm;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .qr-wrapper {
              width: ${format === 'A4' ? '140mm' : '90mm'};
              height: ${format === 'A4' ? '140mm' : '90mm'};
              padding: 10mm;
              border: 2mm solid #1e3a8a;
              border-radius: 10mm;
              display: flex;
              align-items: center;
              justify-content: center;
              background: white;
            }
            .qr-wrapper svg {
              width: 100%;
              height: 100%;
            }
            .code-title {
              margin-top: 10mm;
              font-size: 20pt;
              font-weight: 700;
              color: #1e293b;
            }
            .code-text {
                margin-top: 3mm;
                font-family: monospace;
                font-size: 16pt;
                font-weight: 800;
                letter-spacing: 6px;
                color: #64748b;
            }
            .footer-text {
                margin-top: 15mm;
                font-size: 12pt;
                color: #94a3b8;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 2px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="club-name">Desbravadores Abrantes</div>
            <div class="qr-wrapper">
              ${qrSvg}
            </div>
            <div class="code-title">${title}</div>
            <div class="code-text">${code}</div>
            <div class="footer-text">Aventura • Amizade • Fé</div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
                setTimeout(() => {
                  window.parent.document.body.removeChild(window.frameElement);
                }, 500);
              }, 500);
            }
          </script>
        </body>
      </html>
    `)
    doc.close()
  }

  const handleDownload = () => {
    const svg = printRef.current?.querySelector('svg')
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    img.onload = () => {
      canvas.width = 1000
      canvas.height = 1000
      ctx?.drawImage(img, 0, 0, 1000, 1000)
      const pngFile = canvas.toDataURL('image/png')
      const downloadLink = document.createElement('a')
      downloadLink.download = `QR_${code}_${title}.png`
      downloadLink.href = pngFile
      downloadLink.click()
    }
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
    toast.success('Imagem descarregada!')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full gap-2 text-[10px] border-blue-100 h-8 text-blue-700 hover:bg-blue-50 hover:border-blue-200">
          <Eye className="w-3 h-3" /> Visualizar & Imprimir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-stone-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-900" />
            Configuração de Impressão
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center space-y-6 py-6">
          {/* Beautiful Preview Card */}
          <div 
            ref={printRef}
            className="bg-white p-8 rounded-3xl shadow-xl border border-blue-50 flex flex-col items-center space-y-4 animate-in fade-in zoom-in duration-300"
          >
            <div className="text-blue-900 font-black text-lg tracking-tighter uppercase mb-2">Desbravadores Abrantes</div>
            
            <div className="relative p-4 bg-white border-4 border-blue-900 rounded-2xl">
                <QRCodeSVG
                value={getFullUrl()}
                size={220}
                level="H"
                includeMargin={false}
                imageSettings={{
                    src: "/images/Logo Desbravadores.png",
                    x: undefined,
                    y: undefined,
                    height: 50,
                    width: 50,
                    excavate: true,
                }}
                />
            </div>

            <div className="text-center">
                <div className="font-bold text-slate-800 text-xl">{title}</div>
                <div className="font-mono text-sm text-slate-400 font-bold tracking-[0.3em] uppercase">{code}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <Button 
                onClick={() => handlePrint('A4')} 
                className="bg-blue-900 hover:bg-blue-800 flex flex-col items-center h-auto py-4 gap-1"
            >
                <Printer className="w-5 h-5" />
                <span className="text-xs font-bold">Imprimir A4</span>
                <span className="text-[9px] opacity-70">Folha Inteira</span>
            </Button>
            <Button 
                onClick={() => handlePrint('A5')} 
                variant="outline"
                className="border-blue-200 text-blue-900 hover:bg-blue-50 flex flex-col items-center h-auto py-4 gap-1"
            >
                <FileText className="w-5 h-5" />
                <span className="text-xs font-bold">Imprimir A5</span>
                <span className="text-[9px] opacity-70">Meia Folha</span>
            </Button>
          </div>
        </div>

        <DialogFooter className="sm:justify-center border-t pt-4">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-500" onClick={handleDownload}>
            <Download className="w-4 h-4" /> Guardar como PNG
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 text-slate-500" onClick={() => {
            navigator.clipboard.writeText(getFullUrl());
            toast.success('Link copiado!');
          }}>
            <Share2 className="w-4 h-4" /> Copiar Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
