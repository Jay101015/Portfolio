import type { Analysis, Clip } from './types'
import { uid } from './types'

export type Preset = {
  id: string
  emoji: string
  name: string
  desc: string
  /** target total length in seconds; ignored for cleanup */
  target: number
  /** length of each picked moment */
  clipLen: number
  mode: 'peaks' | 'cleanup' | 'manual'
  vertical?: boolean
}

export const PRESETS: Preset[] = [
  { id: 'highlights', emoji: '🔥', name: 'Highlight Reel', desc: 'The best ~8 minutes of action, in order', target: 480, clipLen: 30, mode: 'peaks' },
  { id: 'short', emoji: '📱', name: 'Shorts / TikTok', desc: 'Top moments under 60s, vertical 9:16', target: 58, clipLen: 8, mode: 'peaks', vertical: true },
  { id: 'montage', emoji: '⚡', name: 'Quick Montage', desc: '~3 minutes of rapid-fire moments', target: 180, clipLen: 10, mode: 'peaks' },
  { id: 'recap', emoji: '🎬', name: 'Stream Recap', desc: '~20 minute “best of” for YouTube', target: 1200, clipLen: 60, mode: 'peaks' },
  { id: 'cleanup', emoji: '🧹', name: 'Cut Dead Air', desc: 'Keep the whole stream, drop menus & AFK', target: 0, clipLen: 0, mode: 'cleanup' },
  { id: 'manual', emoji: '✋', name: 'I’ll do it myself', desc: 'Start with the full video, cut it by hand', target: 0, clipLen: 0, mode: 'manual' },
]

export function autoEdit(preset: Preset, analysis: Analysis | null, duration: number): Clip[] {
  if (preset.mode === 'manual' || !analysis || analysis.samples.length < 3) {
    return [{ id: uid(), start: 0, end: duration }]
  }
  return preset.mode === 'cleanup' ? cleanup(analysis, duration) : peaks(preset, analysis, duration)
}

function peaks(preset: Preset, { samples }: Analysis, duration: number): Clip[] {
  // Don't ask for more than half the video.
  const target = Math.min(preset.target, duration * 0.5)
  const len = Math.min(preset.clipLen, Math.max(3, target))
  const order = samples.map((_, i) => i).sort((a, b) => samples[b].score - samples[a].score)
  const picked: { start: number; end: number }[] = []
  let total = 0
  for (const i of order) {
    if (total >= target) break
    const t = samples[i].t
    // Most of the clip before the peak: the build-up is what makes it land.
    let start = Math.max(0, t - len * 0.65)
    const end = Math.min(duration, start + len)
    start = Math.max(0, end - len)
    if (picked.some((p) => start < p.end + 1 && end > p.start - 1)) continue
    picked.push({ start, end })
    total += end - start
  }
  return picked
    .sort((a, b) => a.start - b.start)
    .map((p) => ({ id: uid(), start: round(p.start), end: round(p.end) }))
}

function cleanup({ samples, interval }: Analysis, duration: number): Clip[] {
  const sorted = samples.map((s) => s.score).sort((a, b) => a - b)
  const threshold = sorted[Math.floor(sorted.length * 0.3)]
  const runs: { start: number; end: number }[] = []
  for (const s of samples) {
    if (s.score < threshold) continue
    const start = Math.max(0, s.t - interval / 2)
    const end = Math.min(duration, s.t + interval / 2)
    const last = runs[runs.length - 1]
    if (last && start - last.end <= interval * 2) last.end = end
    else runs.push({ start, end })
  }
  const kept = runs.filter((r) => r.end - r.start >= 5)
  return (kept.length ? kept : [{ start: 0, end: duration }]).map((r) => ({
    id: uid(), start: round(r.start), end: round(r.end),
  }))
}

const round = (n: number) => Math.round(n * 10) / 10

export const totalLength = (clips: Clip[]) => clips.reduce((a, c) => a + (c.end - c.start), 0)
