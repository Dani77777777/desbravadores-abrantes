// Sons do sorteador, sintetizados com Web Audio (sem ficheiros).
// O browser só deixa tocar depois de um toque/clique do utilizador — chamar
// `unlockRaffleSound()` num handler de clique antes do primeiro sorteio.

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

export function unlockRaffleSound() {
  getCtx()
}

/** "Clique" curto de cada nome a passar no rolo. */
export function playTick(pitch = 1) {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(900 * pitch, now)
  gain.gain.setValueAtTime(0.05, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.05)
}

/** Pequena fanfarra quando sai um vencedor. */
export function playWin() {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5] // Dó Mi Sol Dó
  notes.forEach((freq, i) => {
    const t = now + i * 0.11
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.9 : 0.25))
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(t)
    osc.stop(t + 1)
  })
}
