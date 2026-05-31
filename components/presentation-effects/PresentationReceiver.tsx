'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

// --- WEB AUDIO API SYNTHESIZER FOR PRESENTATION SHORTCUTS ---
class SoundSynth {
  private ctx: AudioContext | null = null

  private getContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  // Plays a soft "Shhhh" sweep
  playShh(duration = 2.5) {
    try {
      const ctx = this.getContext()
      const sampleRate = ctx.sampleRate
      const bufferSize = sampleRate * duration
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
      const data = buffer.getChannelData(0)

      // Create white noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }

      const noiseNode = ctx.createBufferSource()
      noiseNode.buffer = buffer

      // Create a bandpass filter to shape the "shh" sound
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(1500, ctx.currentTime)
      filter.Q.setValueAtTime(1.5, ctx.currentTime)

      // Animate the bandpass frequency to sweep down slightly
      filter.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + duration)

      // Envelope to fade in and out smoothly
      const gainNode = ctx.createGain()
      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.3)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

      noiseNode.connect(filter)
      filter.connect(gainNode)
      gainNode.connect(ctx.destination)

      noiseNode.start()
    } catch (e) {
      console.warn('Audio synth failed:', e)
    }
  }

  // Synthesizes bubble plops
  playBubble() {
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime

      // Bubble pop is a quick pitch sweep upward
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()

      osc.type = 'sine'
      // Sweep frequency from low to high
      osc.frequency.setValueAtTime(400, now)
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12)

      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(0.15, now + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

      osc.connect(gainNode)
      gainNode.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.13)
    } catch (e) {
      console.warn(e)
    }
  }

  // Synthesizes a confetti "pop"
  playConfetti() {
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime

      const osc = ctx.createOscillator()
      const noise = ctx.createBufferSource()
      const oscGain = ctx.createGain()
      const noiseGain = ctx.createGain()

      // 1. Synth pop
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(150, now)
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.15)

      oscGain.gain.setValueAtTime(0.2, now)
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)

      osc.connect(oscGain)
      oscGain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.16)

      // 2. High pass noise burst for paper flutter/pop
      const sampleRate = ctx.sampleRate
      const bufferSize = sampleRate * 0.2
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
      noise.buffer = buffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.setValueAtTime(2000, now)

      noiseGain.gain.setValueAtTime(0.08, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

      noise.connect(filter)
      filter.connect(noiseGain)
      noiseGain.connect(ctx.destination)

      noise.start(now)
    } catch (e) {
      console.warn(e)
    }
  }

  // Synthesizes an epic drumroll ending with a cymbal crash
  private drumrollInterval: any = null
  playDrumroll(duration = 3.5) {
    try {
      const ctx = this.getContext()
      let now = ctx.currentTime

      // Create a noise buffer for drum sounds
      const sampleRate = ctx.sampleRate
      const bufferSize = sampleRate * 0.1 // 100ms drum hit
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }

      // We will play rapid repeated drum hits
      const intervalMs = 45
      const totalHits = (duration * 1000) / intervalMs
      let hitCount = 0

      this.drumrollInterval = setInterval(() => {
        if (hitCount >= totalHits) {
          clearInterval(this.drumrollInterval)
          // Play Cymbal Crash!
          this.playCymbal()
          return
        }

        const hitTime = ctx.currentTime
        const source = ctx.createBufferSource()
        source.buffer = buffer

        // Low-pass filter for drum body
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        // Pitch/Frequency rises as drumroll gets more tense
        const freq = 120 + (hitCount / totalHits) * 160
        filter.frequency.setValueAtTime(freq, hitTime)

        const gainNode = ctx.createGain()
        // Accent volume increases over time
        const vol = 0.05 + (hitCount / totalHits) * 0.15
        gainNode.gain.setValueAtTime(vol, hitTime)
        gainNode.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.08)

        source.connect(filter)
        filter.connect(gainNode)
        gainNode.connect(ctx.destination)

        source.start(hitTime)
        hitCount++
      }, intervalMs)
    } catch (e) {
      console.warn(e)
    }
  }

  stopDrumroll() {
    if (this.drumrollInterval) {
      clearInterval(this.drumrollInterval)
      this.drumrollInterval = null
    }
  }

  private playCymbal() {
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime

      // Cymbal is high-pitched metallic white noise
      const sampleRate = ctx.sampleRate
      const bufferSize = sampleRate * 1.5 // 1.5s decay
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.setValueAtTime(7000, now)

      const gainNode = ctx.createGain()
      gainNode.gain.setValueAtTime(0.2, now)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.4)

      source.connect(filter)
      filter.connect(gainNode)
      gainNode.connect(ctx.destination)

      // Add a low-frequency punch
      const punch = ctx.createOscillator()
      const punchGain = ctx.createGain()
      punch.type = 'sine'
      punch.frequency.setValueAtTime(60, now)
      punch.frequency.exponentialRampToValueAtTime(30, now + 0.15)
      punchGain.gain.setValueAtTime(0.3, now)
      punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)

      punch.connect(punchGain)
      punchGain.connect(ctx.destination)

      source.start(now)
      punch.start(now)
      punch.stop(now + 0.16)
    } catch (e) {
      console.warn(e)
    }
  }

  // Synthesizes a classic mic drop thud with squealing feedback
  playMicDrop() {
    try {
      const ctx = this.getContext()
      const now = ctx.currentTime

      // 1. Initial squealing feedback
      const feedback = ctx.createOscillator()
      const fbGain = ctx.createGain()
      feedback.type = 'sine'
      feedback.frequency.setValueAtTime(2500, now)
      feedback.frequency.exponentialRampToValueAtTime(3500, now + 0.2)

      fbGain.gain.setValueAtTime(0, now)
      fbGain.gain.linearRampToValueAtTime(0.06, now + 0.05)
      fbGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)

      feedback.connect(fbGain)
      fbGain.connect(ctx.destination)
      feedback.start(now)
      feedback.stop(now + 0.35)

      // 2. Heavy bass thud after 0.3s
      const thudTime = now + 0.3
      const thud = ctx.createOscillator()
      const thudGain = ctx.createGain()

      thud.type = 'sawtooth'
      thud.frequency.setValueAtTime(80, thudTime)
      thud.frequency.exponentialRampToValueAtTime(20, thudTime + 0.25)

      // Distort & filter the thud
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(150, thudTime)

      thudGain.gain.setValueAtTime(0.4, thudTime)
      thudGain.gain.exponentialRampToValueAtTime(0.001, thudTime + 0.4)

      thud.connect(filter)
      filter.connect(thudGain)
      thudGain.connect(ctx.destination)

      thud.start(thudTime)
      thud.stop(thudTime + 0.45)
    } catch (e) {
      console.warn(e)
    }
  }
}

// --- PARTICLE / CONFETTI INTERFACE & CLASS ---
interface ConfettiParticle {
  x: number
  y: number
  size: number
  color: string
  shape: 'circle' | 'square' | 'triangle'
  speedX: number
  speedY: number
  rotation: number
  rotationSpeed: number
  opacity: number
}

export default function PresentationReceiver() {
  const [supabase] = useState(() => createClient())
  const [activeEffects, setActiveEffects] = useState({
    silence: false,
    drumroll: false,
    curtain: false,
    blur: false,
    micdrop: false,
  })

  // Audio synthesizer instance
  const synthRef = useRef<SoundSynth | null>(null)
  
  // HTML5 Canvas for confetti
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const confettiParticles = useRef<ConfettiParticle[]>([])
  const animationFrameId = useRef<number | null>(null)

  // Floating bubbles state (array of IDs and settings)
  const [bubblesList, setBubblesList] = useState<Array<{ id: number; left: number; size: number; delay: number; duration: number }>>([])

  // Initialize synthesizer on client mount
  useEffect(() => {
    synthRef.current = new SoundSynth()
    return () => {
      if (synthRef.current) {
        synthRef.current.stopDrumroll()
      }
    }
  }, [])

  // Listen to Supabase Broadcast Realtime
  useEffect(() => {
    const channel = supabase.channel('presentation-effects', {
      config: {
        broadcast: { self: true },
      },
    })

    channel
      .on('broadcast', { event: 'effect' }, ({ payload }) => {
        const { type, active } = payload
        handleIncomingEffect(type, active)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [supabase])

  // Handle triggered effects
  const handleIncomingEffect = (type: string, active?: boolean) => {
    const synth = synthRef.current

    switch (type) {
      case 'silence':
        setActiveEffects((prev) => ({ ...prev, silence: true }))
        if (synth) synth.playShh()
        // Auto remove visual silence overlay after 3 seconds
        setTimeout(() => {
          setActiveEffects((prev) => ({ ...prev, silence: false }))
        }, 3000)
        break

      case 'drumroll':
        setActiveEffects((prev) => ({ ...prev, drumroll: true }))
        if (synth) synth.playDrumroll(3.0)
        // Drumroll shake lasts 3 seconds + cymbal
        setTimeout(() => {
          setActiveEffects((prev) => ({ ...prev, drumroll: false }))
        }, 3000)
        break

      case 'confetti':
        if (synth) synth.playConfetti()
        triggerConfettiVisual()
        break

      case 'bubbles':
        // Generate bubbles
        triggerBubblesVisual()
        break

      case 'micdrop':
        setActiveEffects((prev) => ({ ...prev, micdrop: true }))
        if (synth) synth.playMicDrop()
        // Remove micdrop element after its animation finishes (approx 2s)
        setTimeout(() => {
          setActiveEffects((prev) => ({ ...prev, micdrop: false }))
        }, 2200)
        break

      case 'curtain':
        setActiveEffects((prev) => ({ ...prev, curtain: !!active }))
        break

      case 'blur':
        setActiveEffects((prev) => ({ ...prev, blur: !!active }))
        break

      case 'clear':
        if (synth) synth.stopDrumroll()
        setActiveEffects({
          silence: false,
          drumroll: false,
          curtain: false,
          blur: false,
          micdrop: false,
        })
        setBubblesList([])
        confettiParticles.current = []
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')
          if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        }
        break

      default:
        break
    }
  }

  // --- VISUAL: CONFETTI EXPLOSION ---
  const triggerConfettiVisual = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas dimensions to window size if not already set or changed
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const colors = ['#a78bfa', '#f472b6', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#60a5fa']
    const shapes: Array<'circle' | 'square' | 'triangle'> = ['circle', 'square', 'triangle']

    // Spawn 150 particles from both left and right bottom corners
    const count = 120
    for (let i = 0; i < count; i++) {
      const fromLeft = i % 2 === 0
      confettiParticles.current.push({
        x: fromLeft ? 0 : canvas.width,
        y: canvas.height * 0.8,
        size: Math.random() * 10 + 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        speedX: (fromLeft ? 1 : -1) * (Math.random() * 15 + 10),
        speedY: -(Math.random() * 20 + 15),
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
      })
    }

    // Start animation loop if not running
    if (!animationFrameId.current) {
      animateConfetti()
    }
  }

  const animateConfetti = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const particles = confettiParticles.current
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]

      // Apply physics
      p.x += p.speedX
      p.y += p.speedY
      p.speedY += 0.45; // Gravity
      p.speedX *= 0.98; // Air resistance
      p.rotation += p.rotationSpeed
      p.opacity -= 0.008; // Smooth fade

      if (p.opacity <= 0 || p.y > canvas.height) {
        particles.splice(i, 1)
        continue
      }

      ctx.save()
      ctx.globalAlpha = p.opacity
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = p.color

      // Draw Shape
      ctx.beginPath()
      if (p.shape === 'circle') {
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
      } else if (p.shape === 'triangle') {
        ctx.moveTo(0, -p.size / 2)
        ctx.lineTo(p.size / 2, p.size / 2)
        ctx.lineTo(-p.size / 2, p.size / 2)
        ctx.closePath()
      } else {
        ctx.rect(-p.size / 2, -p.size / 2, p.size, p.size)
      }
      ctx.fill()
      ctx.restore()
    }

    if (particles.length > 0) {
      animationFrameId.current = requestAnimationFrame(animateConfetti)
    } else {
      animationFrameId.current = null
    }
  }

  // --- VISUAL: BUBBLES ---
  const triggerBubblesVisual = () => {
    const synth = synthRef.current
    const newBubbles = Array.from({ length: 25 }).map((_, index) => {
      // Play brief plop sounds staggered
      setTimeout(() => {
        if (synth) synth.playBubble()
      }, Math.random() * 1200)

      return {
        id: Date.now() + index + Math.random(),
        left: Math.random() * 100, // percentage
        size: Math.random() * 45 + 15, // px
        delay: Math.random() * 1.5, // seconds
        duration: Math.random() * 3 + 2, // seconds
      }
    })

    setBubblesList((prev) => [...prev, ...newBubbles])

    // Cleanup bubbles after they float off screen
    setTimeout(() => {
      setBubblesList((prev) => prev.filter((b) => !newBubbles.find((nb) => nb.id === b.id)))
    }, 5500)
  }

  // Handle window resizing for Canvas
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth
        canvasRef.current.height = window.innerHeight
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <>
      {/* 1. Global Blur Overlay applied dynamically */}
      {activeEffects.blur && (
        <style dangerouslySetInnerHTML={{ __html: `
          body > :not(#presentation-receiver-root) {
            filter: blur(12px);
            transition: filter 0.6s ease-in-out;
          }
        `}} />
      )}

      {/* Main Overlay Container */}
      <div 
        id="presentation-receiver-root" 
        className="fixed inset-0 w-screen h-screen pointer-events-none z-[99999] overflow-hidden select-none"
      >
        {/* Fullscreen Canvas for Confetti */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* 2. Theatre Curtains Overlay */}
        <div className="absolute inset-0 flex pointer-events-none">
          {/* Left Curtain */}
          <div 
            className={`h-full bg-gradient-to-r from-red-800 via-red-650 to-red-900 border-r-4 border-amber-500 shadow-[20px_0_30px_rgba(0,0,0,0.6)] transition-transform duration-[1200ms] cubic-bezier(0.25, 1, 0.5, 1) ${
              activeEffects.curtain ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{ 
              width: '50vw',
              backgroundImage: 'repeating-linear-gradient(90deg, #991b1b, #991b1b 15px, #7f1d1d 30px, #b91c1c 45px)'
            }}
          >
            {/* Curtain drapery golden trim */}
            <div className="absolute top-0 right-4 bottom-0 w-2 opacity-30 bg-[linear-gradient(to_bottom,transparent,rgba(251,191,36,0.5)_20%,transparent)]" />
          </div>

          {/* Right Curtain */}
          <div 
            className={`h-full bg-gradient-to-l from-red-800 via-red-650 to-red-900 border-l-4 border-amber-500 shadow-[-20px_0_30px_rgba(0,0,0,0.6)] transition-transform duration-[1200ms] cubic-bezier(0.25, 1, 0.5, 1) ${
              activeEffects.curtain ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{ 
              width: '50vw',
              backgroundImage: 'repeating-linear-gradient(90deg, #991b1b, #991b1b 15px, #7f1d1d 30px, #b91c1c 45px)'
            }}
          >
            {/* Curtain drapery golden trim */}
            <div className="absolute top-0 left-4 bottom-0 w-2 opacity-30 bg-[linear-gradient(to_bottom,transparent,rgba(251,191,36,0.5)_20%,transparent)]" />
          </div>
        </div>

        {/* 3. Silence / "Shh!" Visual Overlay */}
        {activeEffects.silence && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none animate-[fadeIn_0.2s_ease-out]">
            <div className="text-center p-8 bg-slate-900/90 border border-slate-700/80 rounded-3xl shadow-[0_0_50px_rgba(236,72,153,0.3)] animate-[scaleIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]">
              <span className="text-8xl md:text-9xl block animate-[pulse_1s_infinite]">🤫</span>
              <h2 className="text-4xl md:text-5xl font-black mt-6 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-fuchsia-400 to-violet-400 animate-pulse">
                SILÊNCIO, POR FAVOR!
              </h2>
              <p className="text-slate-400 text-sm mt-3 font-medium">O apresentador solicitou silêncio no recinto.</p>
            </div>
          </div>
        )}

        {/* 4. Drumroll / Shaking Screen Overlay */}
        {activeEffects.drumroll && (
          <>
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes shake {
                0%, 100% { transform: translate(0, 0) rotate(0deg); }
                10% { transform: translate(-3px, -2px) rotate(-0.5deg); }
                20% { transform: translate(-1px, 2px) rotate(0.5deg); }
                30% { transform: translate(2px, -1px) rotate(0deg); }
                40% { transform: translate(1px, -2px) rotate(0.5deg); }
                50% { transform: translate(-2px, 2px) rotate(-0.5deg); }
                60% { transform: translate(-3px, -1px) rotate(0deg); }
                70% { transform: translate(2px, 1px) rotate(0.5deg); }
                80% { transform: translate(-1px, -2px) rotate(-0.5deg); }
                90% { transform: translate(2px, 2px) rotate(0deg); }
              }
              body {
                animation: shake 0.25s infinite;
              }
            `}} />
            <div className="absolute top-8 left-1/2 -translate-x-1/2 px-6 py-4 bg-amber-500/10 border border-amber-500/30 backdrop-blur rounded-2xl flex items-center gap-3 animate-bounce">
              <span className="text-3xl animate-[spin_1.5s_linear_infinite]">🥁</span>
              <span className="text-lg font-bold text-amber-400 tracking-wider">PREPAREM-SE... RUFAR DOS TAMBORES!</span>
            </div>
          </>
        )}

        {/* 5. Bubbles Overlay */}
        {bubblesList.map((bubble) => (
          <div
            key={bubble.id}
            className="absolute bottom-0 rounded-full border border-white/40 bg-gradient-to-br from-cyan-400/20 via-transparent to-white/30 backdrop-blur-[1px] animate-[floatUp_5s_ease-in_forwards]"
            style={{
              left: `${bubble.left}%`,
              width: `${bubble.size}px`,
              height: `${bubble.size}px`,
              animationDelay: `${bubble.delay}s`,
              animationDuration: `${bubble.duration}s`,
              boxShadow: 'inset -3px -3px 8px rgba(255,255,255,0.4), inset 3px 3px 8px rgba(6,182,212,0.3)',
            }}
          >
            {/* Bubble shine highlight */}
            <div className="absolute top-1.5 left-1.5 w-1/4 h-1/4 bg-white/60 rounded-full" />
          </div>
        ))}

        {/* 6. Mic Drop Overlay */}
        {activeEffects.micdrop && (
          <div className="absolute inset-x-0 top-0 bottom-0 flex justify-center pointer-events-none">
            <div 
              className="absolute top-[-300px] flex flex-col items-center animate-[micDropAnim_2.2s_cubic-bezier(0.25,1,0.5,1)_forwards]"
            >
              {/* Cable */}
              <div className="w-1 bg-slate-700 h-[320px]" />
              
              {/* Microphone Body */}
              <div className="relative flex flex-col items-center -mt-1">
                {/* Silver grille */}
                <div className="w-14 h-14 bg-gradient-to-b from-slate-200 to-slate-400 border-2 border-slate-500 rounded-full shadow-lg" 
                  style={{ backgroundImage: 'radial-gradient(circle, #e2e8f0 25%, transparent 26%), radial-gradient(circle, #94a3b8 25%, transparent 26%)', backgroundSize: '4px 4px' }}
                />
                {/* Connection Ring */}
                <div className="w-8 h-3 bg-amber-500 rounded-sm -mt-1" />
                {/* Stand attachment / body */}
                <div className="w-6 h-16 bg-slate-800 rounded-b-xl border border-slate-700 shadow-md" />
              </div>

              {/* Dramatic Boom Overlay */}
              <div className="absolute bottom-[-100px] w-48 h-48 bg-radial from-amber-500/20 to-transparent scale-0 animate-[micThudAnim_2.2s_ease-out_forwards]" />
            </div>
          </div>
        )}

      </div>

      {/* Global CSS Styles for Custom Animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        html, body {
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.85); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes floatUp {
          0% {
            transform: translateY(10vh) scale(0.8) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.8;
          }
          90% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-110vh) scale(1.1) rotate(45deg);
            opacity: 0;
          }
        }
        @keyframes micDropAnim {
          0% {
            transform: translateY(0);
          }
          15% {
            /* Falls down rapidly */
            transform: translateY(70vh);
          }
          20% {
            /* Hard impact and bounce */
            transform: translateY(64vh);
          }
          25% {
            transform: translateY(68vh);
          }
          30% {
            transform: translateY(67vh);
          }
          75% {
            /* Holds on screen briefly */
            transform: translateY(67vh);
            opacity: 1;
          }
          100% {
            /* Falls off screen completely */
            transform: translateY(120vh);
            opacity: 0;
          }
        }
        @keyframes micThudAnim {
          0%, 14% {
            transform: scale(0);
            opacity: 0;
          }
          15% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.8);
            opacity: 0;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}} />
    </>
  )
}
