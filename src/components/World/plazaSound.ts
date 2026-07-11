// Synthesized plaza sound effects (Web Audio, no asset files) plus haptic
// buzzes. Every trigger traces back to a user gesture (a pickup or throw —
// even remote ones were another member's gesture), so creating/resuming the
// AudioContext lazily on first use satisfies browser autoplay policies.

let ctx: AudioContext | null = null
let noiseBuf: AudioBuffer | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function getNoise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

// Short rising "pop" when a character is plucked off the ground
export function playPickup(): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  const osc  = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(320, t)
  osc.frequency.exponentialRampToValueAtTime(560, t + 0.08)
  gain.gain.setValueAtTime(0.16, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
  osc.connect(gain).connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.14)
}

// Filtered-noise whoosh on a fling; louder and brighter for faster throws
export function playWhoosh(speed: number): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  const k = Math.min(1, speed / 14)
  const src    = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const gain   = ac.createGain()
  src.buffer = getNoise(ac)
  filter.type = 'bandpass'
  filter.Q.value = 1.1
  filter.frequency.setValueAtTime(300, t)
  filter.frequency.exponentialRampToValueAtTime(900 + 900 * k, t + 0.18)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.10 + 0.14 * k, t + 0.06)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
  src.connect(filter).connect(gain).connect(ac.destination)
  src.start(t)
  src.stop(t + 0.32)
}

// Low thud on ground impact; intensity 0..1 scales weight and volume
export function playThud(intensity: number): void {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  const k = Math.max(0.1, Math.min(1, intensity))

  // Body: a fast-decaying low tone dropping in pitch
  const osc  = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(110 + 40 * k, t)
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  gain.gain.setValueAtTime(0.28 * k, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
  osc.connect(gain).connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.18)

  // Grit: a tiny lowpassed noise click layered on top
  const src     = ac.createBufferSource()
  const filter  = ac.createBiquadFilter()
  const ngain   = ac.createGain()
  src.buffer = getNoise(ac)
  filter.type = 'lowpass'
  filter.frequency.value = 500 + 700 * k
  ngain.gain.setValueAtTime(0.12 * k, t)
  ngain.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
  src.connect(filter).connect(ngain).connect(ac.destination)
  src.start(t)
  src.stop(t + 0.09)
}

// Haptic buzz — no-op where the Vibration API is unsupported (e.g. iOS Safari)
export function buzz(ms: number): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms)
    } catch {
      // ignored — vibration is best-effort garnish
    }
  }
}
