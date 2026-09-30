/**
 * "Nebula Drift" – a small generative electronic track synthesised entirely
 * with Web Audio oscillators and noise. It exists so the visualizer has a
 * built‑in preset that reacts well (clear kick / mids / hats) without shipping
 * any audio files.
 */

const BPM = 112
const SIXTEENTH = 60 / BPM / 4
const LOOKAHEAD_S = 0.15
const TICK_MS = 25

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

// A‑minor progression: Am – F – C – G (2 bars each)
const CHORDS = [
  { bass: 33, pad: [57, 60, 64], arp: [69, 72, 76, 81] }, // Am
  { bass: 29, pad: [53, 57, 60], arp: [65, 69, 72, 77] }, // F
  { bass: 36, pad: [60, 64, 67], arp: [67, 72, 76, 79] }, // C
  { bass: 31, pad: [55, 59, 62], arp: [67, 71, 74, 79] }, // G
]

const KICK_STEPS = new Set([0, 4, 8, 12])
const CLAP_STEPS = new Set([4, 12])
const HAT_STEPS = new Set([2, 6, 10, 14])
const BASS_PATTERN = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0]
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 0, 2, 3, 1, 2, 0, 1, 3, 2, 1]

export class GenerativeTrack {
  private ctx: AudioContext
  private output: GainNode
  private master: GainNode
  private delay: DelayNode
  private noiseBuffer: AudioBuffer
  private timer: number | null = null
  private nextNoteTime = 0
  private step = 0
  private running = false

  get isRunning() {
    return this.running
  }

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx

    this.output = ctx.createGain()
    this.output.gain.value = 0.9
    this.output.connect(destination)

    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    comp.attack.value = 0.005
    comp.release.value = 0.2
    comp.connect(this.output)

    this.master = ctx.createGain()
    this.master.gain.value = 0.8
    this.master.connect(comp)

    // Feedback delay for pads and arps
    this.delay = ctx.createDelay(2)
    this.delay.delayTime.value = SIXTEENTH * 3 // dotted‑eighth
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2600
    this.delay.connect(lp)
    lp.connect(fb)
    fb.connect(this.delay)
    const wet = ctx.createGain()
    wet.gain.value = 0.4
    lp.connect(wet)
    wet.connect(this.master)

    // 1 s of white noise reused for hats and claps
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }

  /* ------------------------------ Instruments ------------------------------ */

  private kick(t: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(170, t)
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    gain.gain.setValueAtTime(1.1, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.45)
  }

  private noiseBurst(t: number, type: BiquadFilterType, freq: number, gainAmt: number, dur: number) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filt = ctx.createBiquadFilter()
    filt.type = type
    filt.frequency.value = freq
    filt.Q.value = 0.9
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(gainAmt, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(filt)
    filt.connect(gain)
    gain.connect(this.master)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
  }

  private hat(t: number, accent: number) {
    this.noiseBurst(t, 'highpass', 7500, 0.22 * accent, 0.06)
  }

  private clap(t: number) {
    this.noiseBurst(t, 'bandpass', 1900, 0.35, 0.16)
    this.noiseBurst(t + 0.012, 'bandpass', 2200, 0.25, 0.12)
  }

  private bass(t: number, midi: number) {
    const ctx = this.ctx
    const saw = ctx.createOscillator()
    const sub = ctx.createOscillator()
    const filt = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    const dur = SIXTEENTH * 1.7

    saw.type = 'sawtooth'
    saw.frequency.value = midiToHz(midi)
    sub.type = 'sine'
    sub.frequency.value = midiToHz(midi - 12)

    filt.type = 'lowpass'
    filt.Q.value = 6
    filt.frequency.setValueAtTime(900, t)
    filt.frequency.exponentialRampToValueAtTime(140, t + dur)

    gain.gain.setValueAtTime(0.0, t)
    gain.gain.linearRampToValueAtTime(0.42, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)

    saw.connect(filt)
    sub.connect(filt)
    filt.connect(gain)
    gain.connect(this.master)
    saw.start(t)
    sub.start(t)
    saw.stop(t + dur + 0.02)
    sub.stop(t + dur + 0.02)
  }

  private pad(t: number, notes: number[], dur: number) {
    const ctx = this.ctx
    const filt = ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.setValueAtTime(600, t)
    filt.frequency.linearRampToValueAtTime(1400, t + dur * 0.5)
    filt.frequency.linearRampToValueAtTime(700, t + dur)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.09, t + 0.9)
    env.gain.setValueAtTime(0.09, t + dur - 1.2)
    env.gain.linearRampToValueAtTime(0, t + dur)

    filt.connect(env)
    env.connect(this.master)
    env.connect(this.delay)

    for (const n of notes) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = midiToHz(n)
        osc.detune.value = detune
        osc.connect(filt)
        osc.start(t)
        osc.stop(t + dur + 0.05)
      }
    }
  }

  private arp(t: number, midi: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = midiToHz(midi)
    gain.gain.setValueAtTime(0.14, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    osc.connect(gain)
    gain.connect(this.master)
    gain.connect(this.delay)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  /* ------------------------------- Sequencer ------------------------------- */

  private scheduleStep(step: number, t: number) {
    const stepInBar = step % 16
    const bar = Math.floor(step / 16)
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length]

    // Pad: one long chord every 2 bars
    if (step % 32 === 0) this.pad(t, chord.pad, SIXTEENTH * 32)

    // Drums
    if (KICK_STEPS.has(stepInBar) || (bar % 2 === 1 && stepInBar === 10)) this.kick(t)
    if (CLAP_STEPS.has(stepInBar)) this.clap(t)
    if (HAT_STEPS.has(stepInBar)) this.hat(t, 1)
    else if (stepInBar % 2 === 1 && bar >= 2) this.hat(t, 0.4)

    // Bass line (octave jump on the last hit of every 4th bar)
    if (BASS_PATTERN[stepInBar]) {
      const octaveUp = bar % 4 === 3 && stepInBar >= 12
      this.bass(t, chord.bass + (octaveUp ? 12 : 0))
    }

    // Arp starts after the first 2 bars
    if (bar >= 2 && stepInBar % 2 === 0) {
      const idx = ARP_PATTERN[stepInBar]
      const octave = bar % 8 >= 4 ? 12 : 0
      this.arp(t, chord.arp[idx] + octave)
    }
  }

  private tick = () => {
    const horizon = this.ctx.currentTime + LOOKAHEAD_S
    while (this.nextNoteTime < horizon) {
      this.scheduleStep(this.step, this.nextNoteTime)
      this.nextNoteTime += SIXTEENTH
      this.step++
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.output.gain.cancelScheduledValues(this.ctx.currentTime)
    this.output.gain.setValueAtTime(0.9, this.ctx.currentTime)
    this.nextNoteTime = this.ctx.currentTime + 0.05
    // Resume on a bar boundary so the groove stays intact
    this.step = Math.floor(this.step / 16) * 16
    this.timer = window.setInterval(this.tick, TICK_MS)
  }

  stop() {
    if (!this.running) return
    this.running = false
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    // Fade quickly so already‑scheduled notes don't leak through.
    const now = this.ctx.currentTime
    this.output.gain.cancelScheduledValues(now)
    this.output.gain.setValueAtTime(this.output.gain.value, now)
    this.output.gain.linearRampToValueAtTime(0, now + 0.08)
  }

  dispose() {
    this.stop()
    window.setTimeout(() => this.output.disconnect(), 200)
  }
}
