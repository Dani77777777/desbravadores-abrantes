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

// --- CANVAS PARTICLE FX ENGINE ---

const CONFETTI_COLORS = ['#a78bfa', '#f472b6', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#facc15', '#e879f9']
const GOLD_COLORS = ['#fbbf24', '#fde68a', '#f59e0b', '#fff7ed', '#fcd34d']

type ParticleKind = 'confetto' | 'spark' | 'ring' | 'bubble' | 'droplet' | 'dust' | 'glitter' | 'flash'

interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  life: number // seconds remaining
  maxLife: number
  size: number
  color: string
  delay?: number // seconds before the particle becomes active
  rot?: number
  vrot?: number
  tilt?: number
  vtilt?: number
  swayPhase?: number
  swaySpeed?: number
  swayAmp?: number
  baseX?: number
  shape?: 'rect' | 'circle' | 'strip'
  terminal?: number // terminal fall velocity for confetti
  growth?: number // radius growth per second (rings/dust)
  popY?: number // bubbles pop above this height
}

class FxEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private particles: Particle[] = []
  private raf = 0
  private lastT = 0
  private running = false
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private intervals = new Set<ReturnType<typeof setInterval>>()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  private resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = window.innerWidth * dpr
    this.canvas.height = window.innerHeight * dpr
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  get width() {
    return window.innerWidth
  }
  get height() {
    return window.innerHeight
  }

  destroy() {
    this.clear()
    window.removeEventListener('resize', this.resize)
  }

  clear() {
    this.particles = []
    this.timers.forEach((t) => clearTimeout(t))
    this.timers.clear()
    this.intervals.forEach((i) => clearInterval(i))
    this.intervals.clear()
    if (this.running) {
      cancelAnimationFrame(this.raf)
      this.running = false
    }
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  private schedule(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
  }

  private spawn(p: Particle) {
    this.particles.push(p)
    if (!this.running) {
      this.running = true
      this.lastT = performance.now()
      this.raf = requestAnimationFrame(this.loop)
    }
  }

  private loop = (t: number) => {
    const dt = Math.min((t - this.lastT) / 1000, 0.05)
    this.lastT = t
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    const next: Particle[] = []
    for (const p of this.particles) {
      if (p.delay && p.delay > 0) {
        p.delay -= dt
        next.push(p)
        continue
      }
      const alive = this.update(p, dt, next)
      if (alive) {
        this.draw(p)
        next.push(p)
      }
    }
    this.particles = next

    if (this.particles.length > 0 || this.intervals.size > 0 || this.timers.size > 0) {
      this.raf = requestAnimationFrame(this.loop)
    } else {
      this.running = false
      ctx.clearRect(0, 0, this.width, this.height)
    }
  }

  private update(p: Particle, dt: number, out: Particle[]): boolean {
    p.life -= dt
    if (p.life <= 0) {
      if (p.kind === 'bubble') this.popBubble(p, out)
      return false
    }

    switch (p.kind) {
      case 'confetto': {
        // Drift towards terminal velocity for that fluttering paper feel
        const terminal = p.terminal ?? 160
        p.vy += (terminal - p.vy) * Math.min(1, 2.2 * dt)
        p.vx *= 1 - 1.4 * dt
        p.swayPhase! += p.swaySpeed! * dt
        p.x += p.vx * dt + Math.sin(p.swayPhase!) * p.swayAmp! * dt
        p.y += p.vy * dt
        p.rot! += p.vrot! * dt
        p.tilt! += p.vtilt! * dt
        if (p.y > this.height + 30) return false
        break
      }
      case 'spark': {
        p.vy += 340 * dt
        p.vx *= 1 - 2.2 * dt
        p.vy *= 1 - 0.8 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        break
      }
      case 'glitter': {
        p.vy += 30 * dt
        p.x += p.vx * dt + Math.sin((p.swayPhase! += p.swaySpeed! * dt)) * 14 * dt
        p.y += p.vy * dt
        break
      }
      case 'ring':
      case 'dust': {
        p.size += (p.growth ?? 0) * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        break
      }
      case 'bubble': {
        p.swayPhase! += p.swaySpeed! * dt
        p.vy -= 14 * dt // gentle buoyancy acceleration
        p.y += p.vy * dt
        p.x = p.baseX! + Math.sin(p.swayPhase!) * p.swayAmp!
        if (p.y < (p.popY ?? this.height * 0.08)) {
          this.popBubble(p, out)
          return false
        }
        break
      }
      case 'droplet': {
        p.vy += 700 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        break
      }
      case 'flash':
        break
    }
    return true
  }

  private draw(p: Particle) {
    const ctx = this.ctx
    const frac = p.life / p.maxLife
    ctx.save()

    switch (p.kind) {
      case 'confetto': {
        ctx.globalAlpha = Math.min(1, frac * 4)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot!)
        const flip = Math.cos(p.tilt!)
        ctx.scale(1, Math.max(0.18, Math.abs(flip)))
        ctx.fillStyle = p.color
        if (p.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.shape === 'strip') {
          ctx.fillRect(-p.size * 0.35, -p.size * 1.7, p.size * 0.7, p.size * 3.4)
        } else {
          ctx.fillRect(-p.size * 0.5, -p.size * 0.65, p.size, p.size * 1.3)
        }
        // Shade the "back" of the paper when it flips over
        if (flip < 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)'
          if (p.shape === 'circle') {
            ctx.beginPath()
            ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2)
            ctx.fill()
          } else if (p.shape === 'strip') {
            ctx.fillRect(-p.size * 0.35, -p.size * 1.7, p.size * 0.7, p.size * 3.4)
          } else {
            ctx.fillRect(-p.size * 0.5, -p.size * 0.65, p.size, p.size * 1.3)
          }
        }
        break
      }
      case 'spark': {
        ctx.globalCompositeOperation = 'lighter'
        const r = Math.max(0.5, p.size * frac)
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3)
        g.addColorStop(0, '#ffffff')
        g.addColorStop(0.25, p.color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha = frac
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'glitter': {
        ctx.globalCompositeOperation = 'lighter'
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(p.life * 9 + p.swayPhase!))
        ctx.globalAlpha = frac * twinkle
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'ring': {
        ctx.globalAlpha = frac * 0.8
        ctx.strokeStyle = p.color
        ctx.lineWidth = Math.max(1, 6 * frac)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case 'dust': {
        ctx.globalAlpha = frac * 0.3
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
        g.addColorStop(0, p.color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'bubble': {
        const r = p.size
        const fadeIn = Math.min(1, (p.maxLife - p.life) * 3)
        ctx.globalAlpha = fadeIn * Math.min(1, frac * 5)
        // Glassy body
        const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r)
        g.addColorStop(0, 'rgba(255,255,255,0.5)')
        g.addColorStop(0.3, 'rgba(186,230,253,0.14)')
        g.addColorStop(0.8, 'rgba(56,189,248,0.08)')
        g.addColorStop(1, 'rgba(125,211,252,0.4)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
        // Iridescent rim
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 1.2
        ctx.stroke()
        // Top-left shine
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.ellipse(p.x - r * 0.38, p.y - r * 0.42, r * 0.22, r * 0.12, -Math.PI / 4, 0, Math.PI * 2)
        ctx.fill()
        // Bottom-right reflected light
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = r * 0.1
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 0.78, Math.PI * 0.15, Math.PI * 0.45)
        ctx.stroke()
        break
      }
      case 'droplet': {
        ctx.globalAlpha = frac
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'flash': {
        ctx.globalAlpha = frac * 0.35
        ctx.fillStyle = p.color
        ctx.fillRect(0, 0, this.width, this.height)
        break
      }
    }
    ctx.restore()
  }

  private popBubble(p: Particle, out: Particle[]) {
    // Splash ring + tiny droplets flying outward
    out.push({
      kind: 'ring',
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      life: 0.45,
      maxLife: 0.45,
      size: p.size * 0.6,
      growth: p.size * 3,
      color: 'rgba(165,243,252,0.9)',
    })
    const drops = 5 + Math.floor(Math.random() * 4)
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 40 + Math.random() * 120
      out.push({
        kind: 'droplet',
        x: p.x + Math.cos(a) * p.size * 0.6,
        y: p.y + Math.sin(a) * p.size * 0.6,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        size: 1 + Math.random() * 2.2,
        color: Math.random() > 0.5 ? 'rgba(186,230,253,0.95)' : 'rgba(255,255,255,0.9)',
      })
    }
  }

  // --- SPAWNERS ---

  private burst(x: number, y: number, angle: number, spreadDeg: number, count: number, speedMin: number, speedMax: number, colors = CONFETTI_COLORS) {
    const spread = (spreadDeg * Math.PI) / 180
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread
      const s = speedMin + Math.random() * (speedMax - speedMin)
      const shape: Particle['shape'] = Math.random() < 0.12 ? 'strip' : Math.random() < 0.5 ? 'rect' : 'circle'
      this.spawn({
        kind: 'confetto',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 3.2 + Math.random() * 1.6,
        maxLife: 4.8,
        size: 6 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 12,
        tilt: Math.random() * Math.PI * 2,
        vtilt: 4 + Math.random() * 9,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 2 + Math.random() * 3,
        swayAmp: 60 + Math.random() * 90,
        terminal: 110 + Math.random() * 130,
        shape,
      })
    }
  }

  private sprinkleGlitter(x: number, y: number, count: number, colors = CONFETTI_COLORS) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 30 + Math.random() * 180
      this.spawn({
        kind: 'glitter',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 80,
        life: 1.2 + Math.random() * 1.4,
        maxLife: 2.6,
        size: 1 + Math.random() * 1.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 3 + Math.random() * 4,
      })
    }
  }

  confettiBlast() {
    const w = this.width
    const h = this.height
    // Two side cannons firing up and inward
    this.burst(-10, h * 0.9, -Math.PI / 3, 50, 70, 700, 1300)
    this.burst(w + 10, h * 0.9, (-Math.PI * 2) / 3, 50, 70, 700, 1300)
    this.sprinkleGlitter(w * 0.15, h * 0.6, 18)
    this.sprinkleGlitter(w * 0.85, h * 0.6, 18)
    // Center fountain a beat later
    this.schedule(() => {
      this.burst(w / 2, h + 10, -Math.PI / 2, 80, 60, 800, 1400)
      this.sprinkleGlitter(w / 2, h * 0.45, 24)
    }, 220)
  }

  bubbles() {
    const w = this.width
    const h = this.height
    const count = 26
    for (let i = 0; i < count; i++) {
      const size = 10 + Math.random() * 32
      this.spawn({
        kind: 'bubble',
        x: 0,
        baseX: Math.random() * w,
        y: h + size + Math.random() * 60,
        vx: 0,
        vy: -(60 + Math.random() * 100) * (size > 28 ? 1.15 : 0.95),
        life: 9 + Math.random() * 3, // safety net; pop height ends it sooner
        maxLife: 12,
        size,
        color: '',
        delay: Math.random() * 1.6,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.8 + Math.random() * 1.6,
        swayAmp: 14 + Math.random() * 36,
        popY: h * (0.05 + Math.random() * 0.3),
      })
    }
  }

  // Rising embers along the bottom that intensify during the drumroll
  drumrollEmbers(durationMs: number) {
    const start = performance.now()
    const interval = setInterval(() => {
      const elapsed = performance.now() - start
      if (elapsed >= durationMs) {
        clearInterval(interval)
        this.intervals.delete(interval)
        return
      }
      const intensity = elapsed / durationMs
      const n = 1 + Math.floor(intensity * 3)
      for (let i = 0; i < n; i++) {
        this.spawn({
          kind: 'spark',
          x: Math.random() * this.width,
          y: this.height + 5,
          vx: (Math.random() - 0.5) * 60,
          vy: -(150 + Math.random() * 250) * (0.6 + intensity),
          life: 0.7 + Math.random() * 0.7,
          maxLife: 1.4,
          size: 1.2 + Math.random() * 2 + intensity * 1.5,
          color: GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)],
        })
      }
    }, 110)
    this.intervals.add(interval)
    if (!this.running) {
      this.running = true
      this.lastT = performance.now()
      this.raf = requestAnimationFrame(this.loop)
    }
  }

  cymbalCrash() {
    const w = this.width
    const h = this.height
    const cx = w / 2
    const cy = h * 0.28
    // Screen flash + shockwaves
    this.spawn({ kind: 'flash', x: 0, y: 0, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: 0, color: '#fef3c7' })
    this.spawn({ kind: 'ring', x: cx, y: cy, vx: 0, vy: 0, life: 0.7, maxLife: 0.7, size: 20, growth: 1400, color: 'rgba(253,230,138,0.9)' })
    this.spawn({ kind: 'ring', x: cx, y: cy, vx: 0, vy: 0, life: 0.9, maxLife: 0.9, size: 10, growth: 900, color: 'rgba(255,255,255,0.7)', delay: 0.08 })
    // Radial golden sparks
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 200 + Math.random() * 700
      this.spawn({
        kind: 'spark',
        x: cx,
        y: cy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.9,
        maxLife: 1.4,
        size: 1.5 + Math.random() * 3,
        color: GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)],
      })
    }
    // Golden confetti rain
    this.burst(cx, cy, Math.PI / 2, 160, 50, 150, 500, GOLD_COLORS)
    this.sprinkleGlitter(cx, cy, 30, GOLD_COLORS)
  }

  micImpact(x: number, y: number) {
    this.spawn({ kind: 'flash', x: 0, y: 0, vx: 0, vy: 0, life: 0.18, maxLife: 0.18, size: 0, color: '#ffffff' })
    this.spawn({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.6, maxLife: 0.6, size: 14, growth: 1100, color: 'rgba(255,255,255,0.85)' })
    this.spawn({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.8, maxLife: 0.8, size: 8, growth: 700, color: 'rgba(251,191,36,0.7)', delay: 0.07 })
    // Sparks fly up and out in a hemisphere
    for (let i = 0; i < 36; i++) {
      const a = -Math.PI * (0.1 + Math.random() * 0.8)
      const s = 150 + Math.random() * 550
      this.spawn({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.7,
        maxLife: 1.1,
        size: 1.5 + Math.random() * 2.5,
        color: Math.random() > 0.4 ? '#fbbf24' : '#ffffff',
      })
    }
    // Dust puffs rolling out sideways
    for (let i = 0; i < 10; i++) {
      const dir = Math.random() > 0.5 ? 1 : -1
      this.spawn({
        kind: 'dust',
        x: x + dir * (10 + Math.random() * 30),
        y: y + Math.random() * 10,
        vx: dir * (40 + Math.random() * 140),
        vy: -(10 + Math.random() * 50),
        life: 0.8 + Math.random() * 0.8,
        maxLife: 1.6,
        size: 12 + Math.random() * 18,
        growth: 30 + Math.random() * 40,
        color: 'rgba(203,213,225,0.8)',
      })
    }
  }
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
  // Canvas FX engine
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<FxEngine | null>(null)

  // Initialize synthesizer + canvas engine on client mount
  useEffect(() => {
    synthRef.current = new SoundSynth()
    if (canvasRef.current) {
      engineRef.current = new FxEngine(canvasRef.current)
    }
    return () => {
      if (synthRef.current) {
        synthRef.current.stopDrumroll()
      }
      if (engineRef.current) {
        engineRef.current.destroy()
        engineRef.current = null
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
    const engine = engineRef.current

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
        if (engine) engine.drumrollEmbers(3000)
        // Drumroll shake lasts 3 seconds, then the cymbal crash explodes in gold
        setTimeout(() => {
          setActiveEffects((prev) => ({ ...prev, drumroll: false }))
          if (engineRef.current) engineRef.current.cymbalCrash()
        }, 3000)
        break

      case 'confetti':
        if (synth) synth.playConfetti()
        if (engine) engine.confettiBlast()
        break

      case 'bubbles':
        if (engine) engine.bubbles()
        // Staggered plop sounds to match the bubbles
        for (let i = 0; i < 10; i++) {
          setTimeout(() => {
            if (synthRef.current) synthRef.current.playBubble()
          }, Math.random() * 1400)
        }
        break

      case 'micdrop':
        setActiveEffects((prev) => ({ ...prev, micdrop: true }))
        if (synth) synth.playMicDrop()
        // Canvas shockwave timed to the moment of impact in the CSS animation
        setTimeout(() => {
          const eng = engineRef.current
          if (eng) {
            const impactY = Math.min(150 + window.innerHeight * 0.7, window.innerHeight - 30)
            eng.micImpact(window.innerWidth / 2, impactY)
          }
        }, 360)
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
        if (engine) engine.clear()
        break

      default:
        break
    }
  }

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
        {/* 2. Theatre Curtains Overlay */}
        <div className="absolute inset-0 flex pointer-events-none">
          {/* Left Curtain */}
          <div
            className={`relative h-full transition-transform duration-[1200ms] ease-[cubic-bezier(0.25,1,0.5,1)] ${
              activeEffects.curtain ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{
              width: '50vw',
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.35), transparent 30%, rgba(0,0,0,0.45)),
                repeating-linear-gradient(90deg, #7f1d1d 0px, #b91c1c 22px, #991b1b 38px, #6b1414 55px, #7f1d1d 70px)
              `,
              boxShadow: '20px 0 40px rgba(0,0,0,0.65), inset -8px 0 18px rgba(0,0,0,0.5)',
              borderRight: '4px solid #d97706',
            }}
          >
            {/* Curtain drapery golden trim */}
            <div className="absolute top-0 right-4 bottom-0 w-2 opacity-40 bg-[linear-gradient(to_bottom,transparent,rgba(251,191,36,0.6)_20%,transparent)]" />
            {/* Golden fringe at the bottom */}
            <div
              className="absolute bottom-0 left-0 right-0 h-6 opacity-80"
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, #d97706 0px, #fbbf24 3px, #d97706 6px)' }}
            />
          </div>

          {/* Right Curtain */}
          <div
            className={`relative h-full transition-transform duration-[1200ms] ease-[cubic-bezier(0.25,1,0.5,1)] ${
              activeEffects.curtain ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{
              width: '50vw',
              backgroundImage: `
                linear-gradient(to left, rgba(0,0,0,0.35), transparent 30%, rgba(0,0,0,0.45)),
                repeating-linear-gradient(90deg, #7f1d1d 0px, #b91c1c 22px, #991b1b 38px, #6b1414 55px, #7f1d1d 70px)
              `,
              boxShadow: '-20px 0 40px rgba(0,0,0,0.65), inset 8px 0 18px rgba(0,0,0,0.5)',
              borderLeft: '4px solid #d97706',
            }}
          >
            {/* Curtain drapery golden trim */}
            <div className="absolute top-0 left-4 bottom-0 w-2 opacity-40 bg-[linear-gradient(to_bottom,transparent,rgba(251,191,36,0.6)_20%,transparent)]" />
            {/* Golden fringe at the bottom */}
            <div
              className="absolute bottom-0 left-0 right-0 h-6 opacity-80"
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, #d97706 0px, #fbbf24 3px, #d97706 6px)' }}
            />
          </div>
        </div>

        {/* 3. Silence / "Shh!" Visual Overlay */}
        {activeEffects.silence && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none animate-[fadeIn_0.2s_ease-out]">
            {/* Pulsing rings radiating from the card */}
            <div className="absolute w-72 h-72 rounded-full border-2 border-pink-400/30 animate-[silenceRipple_1.4s_ease-out_infinite]" />
            <div className="absolute w-72 h-72 rounded-full border-2 border-violet-400/30 animate-[silenceRipple_1.4s_ease-out_0.5s_infinite]" />
            <div className="relative text-center p-8 bg-slate-900/90 border border-slate-700/80 rounded-3xl shadow-[0_0_60px_rgba(236,72,153,0.35)] animate-[scaleIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]">
              <span className="text-8xl md:text-9xl block animate-[pulse_1s_infinite] drop-shadow-[0_0_25px_rgba(236,72,153,0.5)]">🤫</span>
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
            {/* Darkening vignette to build tension */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.45)_100%)] animate-[fadeIn_0.8s_ease-out]" />
            <div className="absolute top-8 left-1/2 -translate-x-1/2 px-6 py-4 bg-amber-500/10 border border-amber-500/30 backdrop-blur rounded-2xl flex items-center gap-3 animate-bounce">
              <span className="text-3xl animate-[spin_1.5s_linear_infinite]">🥁</span>
              <span className="text-lg font-bold text-amber-400 tracking-wider">PREPAREM-SE... RUFAR DOS TAMBORES!</span>
            </div>
          </>
        )}

        {/* 5. Mic Drop Overlay */}
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
            </div>
          </div>
        )}

        {/* 6. Canvas FX layer (confetti, bubbles, sparks, shockwaves) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

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
        @keyframes silenceRipple {
          0% { transform: scale(0.9); opacity: 0.8; }
          100% { transform: scale(1.8); opacity: 0; }
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
      `}} />
    </>
  )
}
