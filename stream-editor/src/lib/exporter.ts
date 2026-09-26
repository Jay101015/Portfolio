import type { Clip } from './types'
import { disposeVideo, drawFit, makeVideo, ready, seek, type Fit } from './video'

export type ExportOptions = {
  src: string
  clips: Clip[]
  width: number
  height: number
  fit: Fit
  intro: HTMLCanvasElement | null
  introSec: number
  onProgress: (fraction: number, label: string) => void
  signal: AbortSignal
}

export type ExportResult = { blob: Blob; ext: 'mp4' | 'webm' }

const FPS = 30

export function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const options = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs="vp9,opus"',
    'video/webm;codecs="vp8,opus"',
    'video/webm',
  ]
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? null
}

export function canExport(): boolean {
  return !!pickMime() && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

/**
 * Renders the edit in real time: plays each clip on a hidden <video>, paints
 * it into a canvas and records canvas + audio with MediaRecorder. Nothing is
 * uploaded – it all happens on the device.
 */
export async function exportVideo(o: ExportOptions): Promise<ExportResult> {
  const mimeType = pickMime()
  if (!mimeType) throw new Error('This browser can’t record video. Try Chrome or Safari 15+.')

  const canvas = document.createElement('canvas')
  canvas.width = o.width
  canvas.height = o.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, o.width, o.height)

  const video = makeVideo(o.src, false)
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audio = new AC()
  const dest = audio.createMediaStreamDestination()
  audio.createMediaElementSource(video).connect(dest) // not connected to speakers
  await audio.resume()

  const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()])
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: o.width * o.height >= 1920 * 1080 ? 10_000_000 : 6_000_000,
    audioBitsPerSecond: 160_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const stopped = new Promise<void>((r) => (recorder.onstop = () => r()))

  const total = o.introSec + o.clips.reduce((a, c) => a + c.end - c.start, 0)
  let done = 0
  const aborted = () => {
    if (o.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  }

  try {
    await ready(video)
    recorder.start(1000)

    if (o.intro && o.introSec > 0) {
      const t0 = performance.now()
      while (performance.now() - t0 < o.introSec * 1000) {
        aborted()
        drawFit(ctx, o.intro, o.width, o.height, o.fit)
        o.onProgress((done + (performance.now() - t0) / 1000) / total, 'Thumbnail intro')
        await frame()
      }
      done += o.introSec
    }

    for (let i = 0; i < o.clips.length; i++) {
      const c = o.clips[i]
      aborted()
      recorder.pause()
      await seek(video, c.start)
      drawFit(ctx, video, o.width, o.height, o.fit)
      recorder.resume()
      await video.play()
      await new Promise<void>((resolve, reject) => {
        const tick = () => {
          if (o.signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'))
          drawFit(ctx, video, o.width, o.height, o.fit)
          const pos = video.currentTime - c.start
          o.onProgress((done + Math.max(0, pos)) / total, `Clip ${i + 1} of ${o.clips.length}`)
          if (video.currentTime >= c.end || video.ended) return resolve()
          frame(video).then(tick)
        }
        tick()
      })
      video.pause()
      done += c.end - c.start
    }
    recorder.stop()
    await stopped
  } catch (e) {
    if (recorder.state !== 'inactive') recorder.stop()
    throw e
  } finally {
    stream.getTracks().forEach((t) => t.stop())
    disposeVideo(video)
    audio.close()
  }
  o.onProgress(1, 'Done')
  return { blob: new Blob(chunks, { type: mimeType.split(';')[0] }), ext: mimeType.includes('mp4') ? 'mp4' : 'webm' }
}

/** Next paint; falls back to a timer when the tab is hidden and rAF stalls. */
function frame(video?: HTMLVideoElement): Promise<void> {
  return new Promise((r) => {
    let fired = false
    const go = () => {
      if (!fired) {
        fired = true
        r()
      }
    }
    if (video && 'requestVideoFrameCallback' in video) video.requestVideoFrameCallback(go)
    else requestAnimationFrame(go)
    setTimeout(go, 1000 / FPS + 5)
  })
}
