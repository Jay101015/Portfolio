/** Helpers for driving an off-screen <video> element. */

export function makeVideo(src: string, muted = true): HTMLVideoElement {
  const v = document.createElement('video')
  v.src = src
  v.muted = muted
  v.playsInline = true
  v.preload = 'auto'
  v.setAttribute('playsinline', '')
  // iOS only decodes frames for elements that are in the document.
  Object.assign(v.style, {
    position: 'fixed', left: '0', top: '0', width: '2px', height: '2px',
    opacity: '0', pointerEvents: 'none', zIndex: '-1',
  })
  document.body.appendChild(v)
  return v
}

export function disposeVideo(v: HTMLVideoElement) {
  v.pause()
  v.removeAttribute('src')
  v.load()
  v.remove()
}

export function waitFor(v: HTMLVideoElement, event: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      v.removeEventListener(event, done)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    v.addEventListener(event, done, { once: true })
  })
}

export async function ready(v: HTMLVideoElement) {
  if (v.readyState < 2) await waitFor(v, 'loadeddata', 15000)
  // Priming playback makes Safari actually paint frames for drawImage.
  if (v.muted) {
    try {
      await v.play()
      v.pause()
    } catch {
      /* autoplay refused – seeking still works on most browsers */
    }
  }
}

export async function seek(v: HTMLVideoElement, t: number) {
  if (Math.abs(v.currentTime - t) < 0.01 && v.readyState >= 2) return
  const p = waitFor(v, 'seeked', 5000)
  v.currentTime = t
  await p
}

/** Grab a single frame as a JPEG data URL. */
export async function captureFrame(src: string, t: number, width = 1280, height = 720): Promise<string> {
  const v = makeVideo(src)
  try {
    await ready(v)
    await seek(v, t)
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    drawFit(c.getContext('2d')!, v, width, height, 'cover')
    return c.toDataURL('image/jpeg', 0.92)
  } finally {
    disposeVideo(v)
  }
}

export type Fit = 'cover' | 'contain' | 'blur'

type Drawable = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement

function sizeOf(src: Drawable): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth || 16, src.videoHeight || 9]
  if (src instanceof HTMLImageElement) return [src.naturalWidth || 16, src.naturalHeight || 9]
  return [src.width, src.height]
}

let blurCanvas: HTMLCanvasElement | null = null

/** Draw a source into a W×H box. "blur" = contain on top of a blurred cover fill (for vertical exports). */
export function drawFit(ctx: CanvasRenderingContext2D, src: Drawable, W: number, H: number, fit: Fit) {
  const [sw, sh] = sizeOf(src)
  const cover = Math.max(W / sw, H / sh)
  const contain = Math.min(W / sw, H / sh)
  if (fit === 'cover') {
    const w = sw * cover, h = sh * cover
    ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h)
    return
  }
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  if (fit === 'blur') {
    // Cheap, universally supported blur: draw tiny then scale up.
    blurCanvas ??= document.createElement('canvas')
    blurCanvas.width = 24
    blurCanvas.height = Math.max(1, Math.round((24 * H) / W))
    const b = blurCanvas.getContext('2d')!
    drawFit(b, src, blurCanvas.width, blurCanvas.height, 'cover')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(blurCanvas, 0, 0, W, H)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, W, H)
  }
  const w = sw * contain, h = sh * contain
  ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h)
}
