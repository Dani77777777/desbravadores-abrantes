'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { 
  VolumeX, 
  Sparkles, 
  EyeOff, 
  Trash2, 
  HelpCircle, 
  Mic, 
  Keyboard,
  X
} from 'lucide-react'

// Custom Drum Icon since 'Drum' might not exist in this lucide-react version
const DrumIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M2 10V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4" />
    <path d="M22 10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
    <path d="M2 10v8a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4v-8" />
    <path d="m7 4 4 4" />
    <path d="m17 4-4 4" />
  </svg>
)

// Custom Curtain Icon
const CurtainIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M2 4h20" />
    <path d="M4 4v16c0 1 1 2 2 2h12c1 0 2-1 2-2V4" />
    <path d="M4 8c4 0 6 3 8 8 2-5 4-8 8-8" />
    <path d="M12 4v18" />
  </svg>
)

// Custom Bubble Icon
const BubbleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="8" />
    <circle cx="9" cy="9" r="1.5" />
    <circle cx="16" cy="16" r="3" />
    <circle cx="6" cy="16" r="2" />
  </svg>
)

export default function PresentationController() {
  const [supabase] = useState(() => createClient())
  const [channel, setChannel] = useState<any>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [enableKeyboard, setEnableKeyboard] = useState(true)
  const [activeToggles, setActiveToggles] = useState({
    blur: false,
    curtain: false,
  })

  // Initialize Realtime Channel
  useEffect(() => {
    const mainChannel = supabase.channel('presentation-effects', {
      config: {
        broadcast: { self: true },
      },
    })

    mainChannel
      .on('system', { event: 'subscribe' }, () => {
        setIsConnected(true)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
        } else {
          setIsConnected(false)
        }
      })

    setChannel(mainChannel)

    return () => {
      mainChannel.unsubscribe()
    }
  }, [supabase])

  // Function to send effect
  const triggerEffect = (type: string, data: any = {}) => {
    if (!channel) return

    channel.send({
      type: 'broadcast',
      event: 'effect',
      payload: { type, ...data },
    })

    // Update internal toggles if applicable
    if (type === 'blur') {
      setActiveToggles((prev) => ({ ...prev, blur: data.active }))
    } else if (type === 'curtain') {
      setActiveToggles((prev) => ({ ...prev, curtain: data.active }))
    } else if (type === 'clear') {
      setActiveToggles({ blur: false, curtain: false })
    }
  }

  // Keyboard Event Handlers
  useEffect(() => {
    if (!enableKeyboard) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is typing in an input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return
      }

      const key = e.key.toLowerCase()

      switch (key) {
        case 'q':
          triggerEffect('silence')
          break
        case 'd':
          triggerEffect('drumroll')
          break
        case 'c':
          triggerEffect('confetti')
          break
        case 'o':
        case 'b':
          if (e.key === 'b' || e.key === 'B') {
            triggerEffect('blur', { active: !activeToggles.blur })
          } else {
            triggerEffect('bubbles')
          }
          break
        case 'r':
          triggerEffect('curtain', { active: !activeToggles.curtain })
          break
        case 'm':
          triggerEffect('micdrop')
          break
        case 'escape':
          if (isOpen) {
            setIsOpen(false)
          } else {
            triggerEffect('clear')
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enableKeyboard, activeToggles, channel, isOpen])

  return (
    <>
      {/* FLOATING ACTION BUTTON (FAB) Trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[999] flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-violet-600 via-fuchsia-600 to-pink-600 text-white rounded-full shadow-[0_4px_25px_rgba(139,92,246,0.45)] border border-violet-400/40 hover:scale-110 active:scale-95 transition-all duration-300 hover:rotate-12 cursor-pointer focus:outline-none"
        title="Abrir Efeitos de Apresentação"
      >
        <Sparkles className="w-6 h-6 animate-pulse" />
      </button>

      {/* POPUP / MODAL OVERLAY */}
      {isOpen && (
        <div 
          className="fixed inset-0 w-screen h-screen bg-black/60 backdrop-blur-sm z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden select-none cursor-default animate-[fadeIn_0.2s_ease-out_forwards]"
          onClick={() => setIsOpen(false)}
        >
          {/* Main Modal Card */}
          <div 
            className="w-full max-w-2xl bg-slate-950 border-t sm:border border-slate-800 rounded-t-[2.5rem] sm:rounded-3xl p-6 text-white shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-y-auto cursor-default animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]" />
                <h3 className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                  Efeitos Canva
                </h3>
              </div>

              <div className="flex items-center gap-3">
                {/* Connection Status Indicator */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold backdrop-blur ${
                  isConnected 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {isConnected ? 'Ativo' : 'A ligar...'}
                </div>

                {/* Keyboard toggle */}
                <button
                  onClick={() => setEnableKeyboard(!enableKeyboard)}
                  title="Ativar/Desativar atalhos de teclado"
                  className={`p-1.5 rounded-lg border transition-all ${
                    enableKeyboard 
                      ? 'bg-violet-600/20 text-violet-400 border-violet-500/40 hover:bg-violet-600/30' 
                      : 'bg-slate-800 text-slate-500 border-slate-700/60 hover:text-slate-400'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                </button>

                {/* Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-rose-400 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Grid of Interactive Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mb-5">
              
              {/* Confetti Button */}
              <button
                onClick={() => triggerEffect('confetti')}
                className="group relative flex flex-col items-center justify-center p-5 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-violet-500/50 rounded-2xl transition-all duration-200 active:scale-95 shadow-md overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-violet-600/5 to-fuchsia-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-10 h-10 flex items-center justify-center bg-violet-500/10 text-violet-400 rounded-xl group-hover:bg-violet-500/20 transition-all mb-2.5">
                  <Sparkles className="w-5 h-5 animate-bounce" />
                </div>
                <span className="font-bold text-xs">🎉 Confetis</span>
                <span className="text-[9px] text-slate-500 mt-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-900">Teclado: C</span>
              </button>

              {/* Silence (Shh) Button */}
              <button
                onClick={() => triggerEffect('silence')}
                className="group relative flex flex-col items-center justify-center p-5 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-pink-500/50 rounded-2xl transition-all duration-200 active:scale-95 shadow-md overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-pink-600/5 to-rose-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-10 h-10 flex items-center justify-center bg-pink-500/10 text-pink-400 rounded-xl group-hover:bg-pink-500/20 transition-all mb-2.5">
                  <VolumeX className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs">🤫 Silêncio (Shh)</span>
                <span className="text-[9px] text-slate-500 mt-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-900">Teclado: Q</span>
              </button>

              {/* Drumroll Button */}
              <button
                onClick={() => triggerEffect('drumroll')}
                className="group relative flex flex-col items-center justify-center p-5 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl transition-all duration-200 active:scale-95 shadow-md overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-600/5 to-orange-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-10 h-10 flex items-center justify-center bg-amber-500/10 text-amber-400 rounded-xl group-hover:bg-amber-500/20 transition-all mb-2.5">
                  <DrumIcon className="w-5 h-5 animate-pulse" />
                </div>
                <span className="font-bold text-xs">🥁 Tambores</span>
                <span className="text-[9px] text-slate-500 mt-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-900">Teclado: D</span>
              </button>

              {/* Bubbles Button */}
              <button
                onClick={() => triggerEffect('bubbles')}
                className="group relative flex flex-col items-center justify-center p-5 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-2xl transition-all duration-200 active:scale-95 shadow-md overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-cyan-600/5 to-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-10 h-10 flex items-center justify-center bg-cyan-500/10 text-cyan-400 rounded-xl group-hover:bg-cyan-500/20 transition-all mb-2.5">
                  <BubbleIcon className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs">🫧 Bolhas</span>
                <span className="text-[9px] text-slate-500 mt-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-900">Teclado: O</span>
              </button>

              {/* Mic Drop Button */}
              <button
                onClick={() => triggerEffect('micdrop')}
                className="group relative flex flex-col items-center justify-center p-5 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl transition-all duration-200 active:scale-95 shadow-md overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600/5 to-sky-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-10 h-10 flex items-center justify-center bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:bg-indigo-500/20 transition-all mb-2.5">
                  <Mic className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs">🎤 Mic Drop</span>
                <span className="text-[9px] text-slate-500 mt-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-900">Teclado: M</span>
              </button>

              {/* Curtain (Toggle) Button */}
              <button
                onClick={() => triggerEffect('curtain', { active: !activeToggles.curtain })}
                className={`group relative flex flex-col items-center justify-center p-5 border rounded-2xl transition-all duration-200 active:scale-95 shadow-md overflow-hidden cursor-pointer ${
                  activeToggles.curtain
                    ? 'bg-rose-950/40 border-rose-500 text-rose-200'
                    : 'bg-slate-900/50 hover:bg-slate-900 border-slate-800 hover:border-rose-500/50'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-rose-600/5 to-red-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all mb-2.5 ${
                  activeToggles.curtain ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-500/10 text-rose-400'
                }`}>
                  <CurtainIcon className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs">🎭 Cortinas</span>
                <span className="text-[9px] text-slate-500 mt-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-900">Teclado: R (Toggle)</span>
              </button>

              {/* Blur (Toggle) Button */}
              <button
                onClick={() => triggerEffect('blur', { active: !activeToggles.blur })}
                className={`group relative flex flex-col items-center justify-center p-5 border rounded-2xl transition-all duration-200 active:scale-95 shadow-md overflow-hidden cursor-pointer ${
                  activeToggles.blur
                    ? 'bg-blue-950/40 border-blue-500 text-blue-200'
                    : 'bg-slate-900/50 hover:bg-slate-900 border-slate-800 hover:border-blue-500/50'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/5 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all mb-2.5 ${
                  activeToggles.blur ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-500/10 text-blue-400'
                }`}>
                  <EyeOff className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs">✨ Desfocar</span>
                <span className="text-[9px] text-slate-500 mt-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-900">Teclado: B (Toggle)</span>
              </button>

              {/* Clear Button */}
              <button
                onClick={() => triggerEffect('clear')}
                className="group relative flex flex-col items-center justify-center p-5 bg-slate-950/40 hover:bg-rose-950/20 border border-slate-800 hover:border-rose-500/50 rounded-2xl transition-all duration-200 active:scale-95 shadow-md overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-rose-950/5 to-red-950/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-10 h-10 flex items-center justify-center bg-rose-500/10 text-rose-400 rounded-xl group-hover:bg-rose-500/20 transition-all mb-2.5">
                  <Trash2 className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs text-rose-400 group-hover:text-rose-300">Limpar Tudo</span>
                <span className="text-[9px] text-rose-600 mt-1 px-1.5 py-0.5 bg-slate-950 rounded border border-rose-950/20">ESC</span>
              </button>

            </div>

            {/* Shortcut Guide Footer */}
            <div className="bg-slate-900/50 border border-slate-900 rounded-xl p-3 flex items-center gap-2.5 text-[10px] text-slate-400 mt-auto">
              <HelpCircle className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span>Podes usar o teclado do teu computador para acionar instantaneamente!</span>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS animations for Modal Popup */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}} />
    </>
  )
}

