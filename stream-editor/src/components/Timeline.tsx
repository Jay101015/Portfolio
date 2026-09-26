import { useEffect, useRef } from 'react'
import type { Analysis, Clip } from '../lib/types'

type Props = {
  duration: number
  analysis: Analysis | null
  clips: Clip[]
  playhead: number
  activeId: string | null
  onSeek: (t: number) => void
}

/** Whole-VOD overview: action "heat" bars, kept clips highlighted, tap to jump. */
export default function Timeline({ duration, analysis, clips, playhead, activeId, onSeek }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const W = c.clientWidth * dpr
    const H = c.clientHeight * dpr
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const x = (t: number) => (t / duration) * W

    for (const clip of clips) {
      ctx.fillStyle = clip.id === activeId ? 'rgba(34,211,238,0.45)' : 'rgba(124,58,237,0.4)'
      ctx.fillRect(x(clip.start), 0, Math.max(2, x(clip.end) - x(clip.start)), H)
    }
    if (analysis) {
      const max = Math.max(...analysis.samples.map((s) => s.score), 1)
      const bw = Math.max(1, (analysis.interval / duration) * W)
      for (const s of analysis.samples) {
        const h = (s.score / max) * H * 0.9
        ctx.fillStyle = s.score / max > 0.6 ? '#f472b6' : 'rgba(255,255,255,0.45)'
        ctx.fillRect(x(s.t) - bw / 2, H - h, bw, h)
      }
    }
    ctx.fillStyle = '#facc15'
    ctx.fillRect(x(playhead) - dpr, 0, 2 * dpr, H)
  }, [duration, analysis, clips, playhead, activeId])

  const seekFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(((e.clientX - r.left) / r.width) * duration)
  }

  return (
    <canvas
      ref={ref}
      className="timeline"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFromEvent(e)
      }}
      onPointerMove={(e) => e.buttons && seekFromEvent(e)}
      aria-label="Video overview – tap to seek"
    />
  )
}
