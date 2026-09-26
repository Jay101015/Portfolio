import type { Analysis, Sample } from './types'
import { disposeVideo, makeVideo, ready, seek } from './video'

const GW = 64, GH = 36
const MAX_SAMPLES = 900

/**
 * Scan the video by seeking through it and measuring how much each sampled
 * frame differs from the previous one. Big changes = action; tiny changes =
 * menus, loading screens, AFK. Works on multi-hour files because nothing is
 * decoded into memory except a few tiny frames.
 */
export async function analyzeVideo(
  src: string,
  duration: number,
  onProgress: (p: number) => void,
  signal: AbortSignal,
): Promise<Analysis> {
  const interval = Math.max(2, duration / MAX_SAMPLES)
  const v = makeVideo(src)
  const grid = document.createElement('canvas')
  grid.width = GW
  grid.height = GH
  const g = grid.getContext('2d', { willReadFrequently: true })!
  const thumb = document.createElement('canvas')
  thumb.width = 160
  thumb.height = 90
  const th = thumb.getContext('2d')!

  const samples: Sample[] = []
  let prev: Float32Array | null = null
  try {
    await ready(v)
    for (let t = Math.min(0.5, duration / 2); t < duration; t += interval) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      await seek(v, t)
      g.drawImage(v, 0, 0, GW, GH)
      const px = g.getImageData(0, 0, GW, GH).data
      const gray = new Float32Array(GW * GH)
      let diff = 0
      for (let i = 0; i < gray.length; i++) {
        gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114
        if (prev) diff += Math.abs(gray[i] - prev[i])
      }
      const score = prev ? diff / gray.length : 0
      prev = gray
      th.drawImage(v, 0, 0, 160, 90)
      samples.push({ t, score, thumb: thumb.toDataURL('image/jpeg', 0.6) })
      onProgress(Math.min(1, t / duration))
    }
  } finally {
    disposeVideo(v)
  }
  if (samples.length > 1) samples[0].score = samples[1].score
  return { samples: smooth(samples), interval }
}

function smooth(samples: Sample[]): Sample[] {
  return samples.map((s, i) => {
    const a = samples[i - 1]?.score ?? s.score
    const b = samples[i + 1]?.score ?? s.score
    return { ...s, score: a * 0.25 + s.score * 0.5 + b * 0.25 }
  })
}

export function nearestThumb(analysis: Analysis | null, t: number): string | undefined {
  if (!analysis?.samples.length) return undefined
  const i = Math.round((t - analysis.samples[0].t) / analysis.interval)
  return analysis.samples[Math.max(0, Math.min(analysis.samples.length - 1, i))].thumb
}
