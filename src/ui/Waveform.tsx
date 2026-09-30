import { useEffect, useRef } from 'react'
import { audioEngine } from '../audio/AudioEngine'

/** Tiny live oscilloscope drawn from the analyser's time‑domain data. */
export function Waveform({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    let raf = 0
    let phase = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = active ? '#3ee8d2' : 'rgba(62, 232, 210, 0.35)'
      ctx.shadowColor = 'rgba(62, 232, 210, 0.7)'
      ctx.shadowBlur = active ? 6 : 0
      ctx.beginPath()

      const data = active ? audioEngine.getWaveform() : null
      const samples = 96
      for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * w
        let y: number
        if (data) {
          const idx = Math.floor((i / samples) * data.length)
          y = h / 2 + ((data[idx] - 128) / 128) * (h / 2) * 0.9
        } else {
          // Idle: a gentle sine so the card never looks dead
          y = h / 2 + Math.sin(i * 0.35 + phase) * 2
        }
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      phase += 0.05
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [active])

  return <canvas ref={canvasRef} className="waveform" />
}
