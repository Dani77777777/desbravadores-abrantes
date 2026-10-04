// Sons do VanaSentinela, sintetizados com Web Audio (sem ficheiros).
// Desligados por defeito; o botão 🔈 do cabeçalho liga-os (preferência em localStorage).

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, delay: number, duration: number, volume: number, type: OscillatorType) {
  const c = getCtx()
  if (!c) return
  const start = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(volume, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

export type SentinelaSound = 'acerto' | 'erro' | 'combo' | 'recorde'

export function playSentinelaSound(kind: SentinelaSound) {
  switch (kind) {
    case 'acerto':
      tone(660, 0, 0.12, 0.15, 'triangle')
      tone(990, 0.09, 0.16, 0.15, 'triangle')
      break
    case 'erro':
      tone(220, 0, 0.25, 0.12, 'sawtooth')
      tone(165, 0.12, 0.3, 0.1, 'sawtooth')
      break
    case 'combo':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.14, 0.13, 'square'))
      break
    case 'recorde':
      ;[523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.2, 0.16, 'triangle'))
      break
  }
}

/** Chamar num clique antes do primeiro som (o browser só deixa tocar depois de um gesto). */
export function unlockSentinelaSound() {
  getCtx()
}
