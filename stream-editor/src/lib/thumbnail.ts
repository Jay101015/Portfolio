import type { Layer, ThumbState } from './types'
import { drawFit } from './video'

export const THUMB_W = 1280
export const THUMB_H = 720

export const FONTS = [
  { id: 'Anton', label: 'Impact' },
  { id: 'Bangers', label: 'Comic' },
  { id: 'Permanent Marker', label: 'Marker' },
  { id: 'Inter', label: 'Clean' },
]

export const COLORS = ['#ffffff', '#facc15', '#ef4444', '#22d3ee', '#a3e635', '#f472b6', '#a855f7', '#000000']

export const STICKERS = ['🔥', '😱', '💀', '🏆', '😂', '🤯', '👑', '💯', '⚠️', '🎯', '💥', '❗']

const fontFor = (l: Layer, H: number) =>
  `${l.font === 'Inter' ? 800 : 400} ${Math.round(l.size * H)}px "${l.font}", Impact, sans-serif`

const imageCache = new Map<string, HTMLImageElement>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(src)
  if (hit?.complete) return Promise.resolve(hit)
  return new Promise((resolve, reject) => {
    const img = hit ?? new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    if (!hit) {
      img.src = src
      imageCache.set(src, img)
    }
  })
}

/** Bake brightness/contrast/saturation into pixels (ctx.filter isn't reliable on iOS). */
export async function buildBackground(t: ThumbState): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  c.width = THUMB_W
  c.height = THUMB_H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  if (!t.bg) {
    const g = ctx.createLinearGradient(0, 0, THUMB_W, THUMB_H)
    g.addColorStop(0, '#1e1b4b')
    g.addColorStop(1, '#7c3aed')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, THUMB_W, THUMB_H)
    return c
  }
  drawFit(ctx, await loadImage(t.bg), THUMB_W, THUMB_H, 'cover')
  if (t.brightness || t.contrast || t.saturation) {
    const img = ctx.getImageData(0, 0, THUMB_W, THUMB_H)
    const d = img.data
    const b = t.brightness * 2.55
    const cf = (259 * (t.contrast * 2.55 + 255)) / (255 * (259 - t.contrast * 2.55))
    const sf = 1 + t.saturation / 100
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], gg = d[i + 1], bb = d[i + 2]
      const lum = 0.299 * r + 0.587 * gg + 0.114 * bb
      r = lum + (r - lum) * sf
      gg = lum + (gg - lum) * sf
      bb = lum + (bb - lum) * sf
      d[i] = cf * (r + b - 128) + 128
      d[i + 1] = cf * (gg + b - 128) + 128
      d[i + 2] = cf * (bb + b - 128) + 128
    }
    ctx.putImageData(img, 0, 0)
  }
  if (t.vignette) {
    const g = ctx.createRadialGradient(THUMB_W / 2, THUMB_H / 2, THUMB_H * 0.35, THUMB_W / 2, THUMB_H / 2, THUMB_W * 0.7)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.65)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, THUMB_W, THUMB_H)
  }
  return c
}

export type Box = { x: number; y: number; w: number; h: number }

export function layerBox(ctx: CanvasRenderingContext2D, l: Layer, W: number, H: number): Box {
  const h = l.size * H
  let w: number
  if (l.kind === 'image') {
    const img = l.src ? imageCache.get(l.src) : undefined
    w = img?.naturalWidth ? (h * img.naturalWidth) / img.naturalHeight : h
  } else {
    ctx.font = fontFor(l, H)
    w = Math.max(...l.text.split('\n').map((line) => ctx.measureText(line).width), h * 0.3)
  }
  const lines = l.kind === 'text' ? l.text.split('\n').length : 1
  const bh = h * lines * (lines > 1 ? 1.05 : 1)
  return { x: l.x * W - w / 2, y: l.y * H - bh / 2, w, h: bh }
}

export function drawLayers(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  W: number,
  H: number,
  selectedId?: string | null,
) {
  for (const l of layers) {
    const box = layerBox(ctx, l, W, H)
    ctx.save()
    ctx.translate(l.x * W, l.y * H)
    ctx.rotate((l.rotate * Math.PI) / 180)
    ctx.translate(-l.x * W, -l.y * H)
    if (l.kind === 'image') {
      const img = l.src ? imageCache.get(l.src) : undefined
      if (img?.complete) {
        ctx.shadowColor = 'rgba(0,0,0,0.6)'
        ctx.shadowBlur = H * 0.03
        ctx.drawImage(img, box.x, box.y, box.w, box.h)
      }
    } else {
      ctx.font = fontFor(l, H)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      const lines = l.text.split('\n')
      const lh = l.size * H * 1.05
      lines.forEach((line, i) => {
        const y = l.y * H + (i - (lines.length - 1) / 2) * lh
        if (l.kind === 'text' && l.stroke !== 'none') {
          ctx.shadowColor = 'rgba(0,0,0,0.55)'
          ctx.shadowBlur = H * 0.02
          ctx.shadowOffsetY = H * 0.008
          ctx.strokeStyle = l.stroke
          ctx.lineWidth = l.size * H * 0.16
          ctx.strokeText(line, l.x * W, y)
          ctx.shadowColor = 'transparent'
        }
        ctx.fillStyle = l.color
        ctx.fillText(line, l.x * W, y)
      })
    }
    if (l.id === selectedId) {
      ctx.setLineDash([H * 0.015, H * 0.01])
      ctx.lineWidth = Math.max(2, H * 0.004)
      ctx.strokeStyle = '#22d3ee'
      ctx.strokeRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16)
    }
    ctx.restore()
  }
}

export async function renderThumbnail(t: ThumbState, W = THUMB_W, H = THUMB_H): Promise<HTMLCanvasElement> {
  await Promise.all(t.layers.filter((l) => l.src).map((l) => loadImage(l.src!)))
  await document.fonts?.ready
  const bg = await buildBackground(t)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.drawImage(bg, 0, 0, W, H)
  drawLayers(ctx, t.layers, W, H)
  return c
}

export function hitTest(ctx: CanvasRenderingContext2D, layers: Layer[], px: number, py: number, W: number, H: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const b = layerBox(ctx, layers[i], W, H)
    const pad = H * 0.02
    if (px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) return layers[i]
  }
  return null
}
