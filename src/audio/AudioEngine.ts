import type { Track } from '../state/store'
import { GenerativeTrack } from './generativeTrack'

export interface AudioLevels {
  /** 20 – 250 Hz */
  bass: number
  /** 250 – 4 000 Hz */
  mid: number
  /** 4 000 – 16 000 Hz */
  treble: number
  /** Weighted overall loudness */
  energy: number
  /** Transient kick detector – spikes to 1 on a beat and decays */
  beat: number
}

type Band = 'bass' | 'mid' | 'treble'

const BANDS: Record<Band, { lo: number; hi: number; floor: number; gain: number }> = {
  bass: { lo: 20, hi: 250, floor: 0.25, gain: 1.0 },
  mid: { lo: 250, hi: 4000, floor: 0.18, gain: 1.0 },
  treble: { lo: 4000, hi: 16000, floor: 0.07, gain: 1.0 },
}

/**
 * Singleton wrapper around the Web Audio API.
 *
 *  ┌──────────────┐     ┌──────────┐     ┌─────────────┐
 *  │ <audio> file │──▶  │ Analyser │──▶  │ destination │
 *  │ or synth     │     └──────────┘     └─────────────┘
 *  └──────────────┘
 *
 * `update()` is called once per render frame and turns the FFT into a handful
 * of normalised 0..1 values that the shader consumes as uniforms.
 */
class AudioEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private freqData = new Uint8Array(0)
  private timeData = new Uint8Array(0)

  private audioEl: HTMLAudioElement | null = null
  private elSource: MediaElementAudioSourceNode | null = null
  private generative: GenerativeTrack | null = null
  private activeKind: Track['kind'] | null = null

  levels: AudioLevels = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 }

  /** Adaptive peak per band → lets quiet and loud tracks both fill the 0..1 range */
  private peaks: Record<Band, number> = { bass: 0.3, mid: 0.25, treble: 0.1 }
  private bassHistory: number[] = []
  private lastBeatTime = 0
  private lastFrame = performance.now()

  onEnded: (() => void) | null = null

  /* ------------------------------ lifecycle -------------------------------- */

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.7
    analyser.connect(ctx.destination)
    this.ctx = ctx
    this.analyser = analyser
    this.freqData = new Uint8Array(analyser.frequencyBinCount)
    this.timeData = new Uint8Array(analyser.fftSize)
    return ctx
  }

  private stopCurrent() {
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.onended = null
      this.elSource?.disconnect()
      this.audioEl.removeAttribute('src')
      this.audioEl.load()
      this.audioEl = null
      this.elSource = null
    }
    if (this.generative) {
      this.generative.dispose()
      this.generative = null
    }
    this.activeKind = null
  }

  /** Load and immediately start playing a track. */
  async loadTrack(track: Track) {
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') await ctx.resume()
    this.stopCurrent()

    if (track.kind === 'preset') {
      this.generative = new GenerativeTrack(ctx, this.analyser!)
      this.generative.start()
    } else if (track.url) {
      const el = new Audio()
      el.src = track.url
      el.preload = 'auto'
      el.onended = () => this.onEnded?.()
      this.elSource = ctx.createMediaElementSource(el)
      this.elSource.connect(this.analyser!)
      this.audioEl = el
      await el.play()
    }
    this.activeKind = track.kind
  }

  async play() {
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    if (this.activeKind === 'file') await this.audioEl?.play()
    else if (this.activeKind === 'preset') this.generative?.start()
  }

  pause() {
    if (this.activeKind === 'file') this.audioEl?.pause()
    else if (this.activeKind === 'preset') this.generative?.stop()
  }

  get isPlaying(): boolean {
    if (this.activeKind === 'file') return !!this.audioEl && !this.audioEl.paused
    if (this.activeKind === 'preset') return this.generative?.isRunning ?? false
    return false
  }

  /* ------------------------------- analysis -------------------------------- */

  private bandAverage(lo: number, hi: number): number {
    if (!this.ctx || !this.analyser) return 0
    const binHz = this.ctx.sampleRate / this.analyser.fftSize
    const start = Math.max(1, Math.floor(lo / binHz))
    const end = Math.min(this.freqData.length - 1, Math.ceil(hi / binHz))
    if (end <= start) return 0
    let sum = 0
    for (let i = start; i <= end; i++) sum += this.freqData[i]
    return sum / (end - start + 1) / 255
  }

  private normalise(band: Band, raw: number, dt: number): number {
    const cfg = BANDS[band]
    // Peak tracker: rises instantly, decays slowly
    const decayed = this.peaks[band] * Math.exp(-dt * 0.35)
    this.peaks[band] = Math.max(cfg.floor, decayed, raw)
    return Math.min(1, (raw / this.peaks[band]) * cfg.gain)
  }

  private smooth(prev: number, next: number, dt: number): number {
    // Fast attack, slower release
    const rate = next > prev ? 22 : 7
    return prev + (next - prev) * Math.min(1, dt * rate)
  }

  /** Call once per frame. Cheap: one FFT read + a few loops. */
  update() {
    const now = performance.now()
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1)
    this.lastFrame = now

    const lv = this.levels

    if (!this.analyser || !this.ctx || this.ctx.state !== 'running') {
      lv.bass = this.smooth(lv.bass, 0, dt)
      lv.mid = this.smooth(lv.mid, 0, dt)
      lv.treble = this.smooth(lv.treble, 0, dt)
      lv.energy = this.smooth(lv.energy, 0, dt)
      lv.beat *= Math.exp(-dt * 8)
      return
    }

    this.analyser.getByteFrequencyData(this.freqData)

    const rawBass = this.bandAverage(BANDS.bass.lo, BANDS.bass.hi)
    const rawMid = this.bandAverage(BANDS.mid.lo, BANDS.mid.hi)
    const rawTreble = this.bandAverage(BANDS.treble.lo, BANDS.treble.hi)

    const bass = this.normalise('bass', rawBass, dt)
    const mid = this.normalise('mid', rawMid, dt)
    const treble = this.normalise('treble', rawTreble, dt)

    lv.bass = this.smooth(lv.bass, bass, dt)
    lv.mid = this.smooth(lv.mid, mid, dt)
    lv.treble = this.smooth(lv.treble, treble, dt)
    lv.energy = this.smooth(lv.energy, bass * 0.5 + mid * 0.35 + treble * 0.15, dt)

    // ── Beat detection: bass energy well above its recent average ─────────
    this.bassHistory.push(rawBass)
    if (this.bassHistory.length > 40) this.bassHistory.shift()
    const avg = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length
    const sinceBeat = (now - this.lastBeatTime) / 1000
    if (rawBass > avg * 1.3 && rawBass > 0.28 && sinceBeat > 0.22) {
      lv.beat = 1
      this.lastBeatTime = now
    } else {
      lv.beat *= Math.exp(-dt * 8)
    }
  }

  /** Time‑domain samples for the little waveform in the player card. */
  getWaveform(): Uint8Array | null {
    if (!this.analyser || !this.ctx || this.ctx.state !== 'running') return null
    this.analyser.getByteTimeDomainData(this.timeData)
    return this.timeData
  }
}

export const audioEngine = new AudioEngine()
