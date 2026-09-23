// Sons do cronómetro, sintetizados com Web Audio (sem ficheiros).
// O browser só deixa tocar depois de um toque/clique — chamar `unlockTimerSound()`
// num handler de clique antes de começar.

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

export function unlockTimerSound() {
  getCtx()
}

function tone(c: AudioContext, freq: number, start: number, duration: number, volume: number, type: OscillatorType) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(volume, start + 0.01)
  gain.gain.setValueAtTime(volume, start + Math.max(0.01, duration - 0.03))
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Tic-tac dos últimos segundos (o último é mais agudo). */
export function playTimerTick(last = false) {
  const c = getCtx()
  if (!c) return
  tone(c, last ? 1320 : 990, c.currentTime, 0.07, 0.12, 'square')
}

/** Sinal de mudança de fase nas rondas: sobe ao começar a ronda, desce ao entrar na pausa. */
export function playTimerPhase(kind: 'work' | 'rest') {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const notes = kind === 'work' ? [660, 990] : [880, 587]
  notes.forEach((f, i) => tone(c, f, now + i * 0.16, 0.14, 0.2, 'triangle'))
}

/** Alarme do fim: três rajadas de buzina (~2,5 s). */
export function playTimerAlarm() {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  for (let burst = 0; burst < 3; burst++) {
    for (let i = 0; i < 4; i++) {
      const t = now + burst * 0.85 + i * 0.13
      tone(c, i % 2 === 0 ? 880 : 660, t, 0.11, 0.22, 'sawtooth')
    }
  }
}

/** Confirmação curta ao marcar o tempo de uma equipa. */
export function playTimerLap() {
  const c = getCtx()
  if (!c) return
  tone(c, 1046.5, c.currentTime, 0.12, 0.16, 'triangle')
}
