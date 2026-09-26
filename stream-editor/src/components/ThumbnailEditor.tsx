import { useEffect, useMemo, useRef, useState } from 'react'
import type { Source } from '../App'
import type { Analysis, Layer, ThumbState } from '../lib/types'
import { uid } from '../lib/types'
import { captureFrame } from '../lib/video'
import {
  COLORS, FONTS, STICKERS, THUMB_H, THUMB_W, buildBackground, drawLayers, hitTest, loadImage, renderThumbnail,
} from '../lib/thumbnail'
import { clamp, fmt } from '../lib/format'
import { saveFile } from '../lib/save'

type Props = {
  source: Source
  analysis: Analysis | null
  thumb: ThumbState
  setThumb: (t: ThumbState | ((t: ThumbState) => ThumbState)) => void
  playhead: number
}

const TEMPLATES: { name: string; layers: Omit<Layer, 'id'>[] }[] = [
  {
    name: 'Big title',
    layers: [{ kind: 'text', text: 'INSANE CLUTCH', x: 0.5, y: 0.78, size: 0.2, color: '#facc15', stroke: '#000000', font: 'Anton', rotate: 0 }],
  },
  {
    name: 'Top + bottom',
    layers: [
      { kind: 'text', text: 'I CAN’T BELIEVE', x: 0.5, y: 0.16, size: 0.14, color: '#ffffff', stroke: '#000000', font: 'Anton', rotate: 0 },
      { kind: 'text', text: 'THIS WORKED', x: 0.5, y: 0.84, size: 0.17, color: '#ef4444', stroke: '#000000', font: 'Anton', rotate: 0 },
    ],
  },
  {
    name: 'Side punch',
    layers: [
      { kind: 'text', text: '1 vs 5\nWIN?!', x: 0.28, y: 0.5, size: 0.19, color: '#ffffff', stroke: '#7c3aed', font: 'Bangers', rotate: -6 },
      { kind: 'emoji', text: '😱', x: 0.8, y: 0.3, size: 0.28, color: '#fff', stroke: 'none', font: 'Inter', rotate: 10 },
    ],
  },
  {
    name: 'Episode tag',
    layers: [
      { kind: 'text', text: 'EP. 1', x: 0.13, y: 0.13, size: 0.11, color: '#22d3ee', stroke: '#000000', font: 'Anton', rotate: -4 },
      { kind: 'text', text: 'THE BEGINNING', x: 0.5, y: 0.8, size: 0.16, color: '#ffffff', stroke: '#000000', font: 'Anton', rotate: 0 },
    ],
  },
]

export default function ThumbnailEditor({ source, analysis, thumb, setThumb, playhead }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const bgCanvas = useRef<HTMLCanvasElement | null>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const pinch = useRef<{ dist: number; size: number; pointers: Map<number, { x: number; y: number }> }>({ dist: 0, size: 0, pointers: new Map() })
  const imgInput = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [bgVersion, setBgVersion] = useState(0)
  const [fontsReady, setFontsReady] = useState(false)

  const sel = thumb.layers.find((l) => l.id === selected) ?? null

  // Best-looking candidate frames: highest action scores, spread across the VOD.
  const suggestions = useMemo(() => {
    if (!analysis) return []
    const out: { t: number; thumb: string }[] = []
    const sorted = [...analysis.samples].sort((a, b) => b.score - a.score)
    for (const s of sorted) {
      if (out.length >= 8) break
      if (out.some((o) => Math.abs(o.t - s.t) < source.duration / 20)) continue
      out.push(s)
    }
    return out
  }, [analysis, source.duration])

  useEffect(() => {
    document.fonts?.ready.then(() =>
      Promise.all(FONTS.map((f) => document.fonts.load(`40px "${f.id}"`))).finally(() => setFontsReady(true)),
    )
  }, [])

  // Rebuild the (expensive) filtered background only when its inputs change.
  useEffect(() => {
    let live = true
    buildBackground(thumb).then((c) => {
      if (!live) return
      bgCanvas.current = c
      setBgVersion((v) => v + 1)
    })
    return () => {
      live = false
    }
  }, [thumb.bg, thumb.brightness, thumb.contrast, thumb.saturation, thumb.vignette])

  useEffect(() => {
    Promise.all(thumb.layers.filter((l) => l.src).map((l) => loadImage(l.src!))).then(() => setBgVersion((v) => v + 1))
  }, [thumb.layers.length])

  useEffect(() => {
    const c = canvas.current
    if (!c || !bgCanvas.current) return
    const ctx = c.getContext('2d')!
    ctx.drawImage(bgCanvas.current, 0, 0)
    drawLayers(ctx, thumb.layers, THUMB_W, THUMB_H, selected)
  }, [bgVersion, thumb.layers, selected, fontsReady])

  const updateLayer = (id: string, patch: Partial<Layer>) =>
    setThumb((t) => ({ ...t, layers: t.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))

  const addLayer = (l: Omit<Layer, 'id'>) => {
    const layer = { ...l, id: uid() }
    setThumb((t) => ({ ...t, layers: [...t.layers, layer] }))
    setSelected(layer.id)
  }

  const setBackground = async (t: number) => {
    setBusy(true)
    try {
      const bg = await captureFrame(source.url, t, THUMB_W, THUMB_H)
      setThumb((s) => ({ ...s, bg }))
    } finally {
      setBusy(false)
    }
  }

  const toCanvas = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * THUMB_W, y: ((e.clientY - r.top) / r.height) * THUMB_H }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = toCanvas(e)
    const pts = pinch.current.pointers
    pts.set(e.pointerId, pt)
    if (pts.size === 2 && sel) {
      const [a, b] = [...pts.values()]
      pinch.current.dist = Math.hypot(a.x - b.x, a.y - b.y)
      pinch.current.size = sel.size
      drag.current = null
      return
    }
    const hit = hitTest(canvas.current!.getContext('2d')!, thumb.layers, pt.x, pt.y, THUMB_W, THUMB_H)
    setSelected(hit?.id ?? null)
    if (hit) drag.current = { id: hit.id, dx: pt.x - hit.x * THUMB_W, dy: pt.y - hit.y * THUMB_H }
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvas(e)
    const pts = pinch.current.pointers
    if (!pts.has(e.pointerId)) return
    pts.set(e.pointerId, pt)
    if (pts.size === 2 && sel && pinch.current.dist) {
      const [a, b] = [...pts.values()]
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist
      updateLayer(sel.id, { size: clamp(pinch.current.size * ratio, 0.04, 0.9) })
      return
    }
    const d = drag.current
    if (!d) return
    updateLayer(d.id, {
      x: clamp((pt.x - d.dx) / THUMB_W, 0, 1),
      y: clamp((pt.y - d.dy) / THUMB_H, 0, 1),
    })
  }

  const onUp = (e: React.PointerEvent) => {
    pinch.current.pointers.delete(e.pointerId)
    if (pinch.current.pointers.size < 2) pinch.current.dist = 0
    drag.current = null
  }

  const download = async () => {
    const c = await renderThumbnail(thumb)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
    if (!blob) return
    const res = await saveFile(`${source.file.name.replace(/\.[^.]+$/, '')}-thumbnail.png`, blob)
    setSaveMsg(res === 'saved' ? 'Thumbnail saved ✔' : res === 'failed' ? 'Couldn’t save on this device. Try another browser.' : null)
  }

  const addImage = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const src = reader.result as string
      await loadImage(src)
      addLayer({ kind: 'image', text: '', src, x: 0.78, y: 0.55, size: 0.7, color: '#fff', stroke: 'none', font: 'Inter', rotate: 0 })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="stack">
      <div className="thumb-stage">
        <canvas
          ref={canvas}
          width={THUMB_W}
          height={THUMB_H}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {busy && <div className="overlay">Grabbing frame…</div>}
      </div>
      <p className="muted small center">Drag text & stickers to move · pinch or use the slider to resize</p>

      {sel && (
        <section className="card">
          <div className="row between">
            <h3>{sel.kind === 'text' ? 'Text' : sel.kind === 'emoji' ? 'Sticker' : 'Image'}</h3>
            <div className="row">
              <button className="small" onClick={() => setThumb((t) => ({ ...t, layers: [...t.layers.filter((l) => l.id !== sel.id), sel] }))}>⬆ Front</button>
              <button className="small danger" onClick={() => {
                setThumb((t) => ({ ...t, layers: t.layers.filter((l) => l.id !== sel.id) }))
                setSelected(null)
              }}>🗑</button>
            </div>
          </div>
          {sel.kind === 'text' && (
            <textarea rows={2} value={sel.text} onChange={(e) => updateLayer(sel.id, { text: e.target.value.toUpperCase() })} />
          )}
          <label className="slider">
            <span>Size</span>
            <input type="range" min={0.04} max={0.9} step={0.005} value={sel.size} onChange={(e) => updateLayer(sel.id, { size: +e.target.value })} />
          </label>
          <label className="slider">
            <span>Tilt</span>
            <input type="range" min={-30} max={30} step={1} value={sel.rotate} onChange={(e) => updateLayer(sel.id, { rotate: +e.target.value })} />
          </label>
          {sel.kind === 'text' && (
            <>
              <div className="swatches">
                <span className="muted small">Fill</span>
                {COLORS.map((c) => (
                  <button key={c} className={`swatch ${sel.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => updateLayer(sel.id, { color: c })} aria-label={c} />
                ))}
              </div>
              <div className="swatches">
                <span className="muted small">Outline</span>
                <button className={`swatch none ${sel.stroke === 'none' ? 'on' : ''}`} onClick={() => updateLayer(sel.id, { stroke: 'none' })} aria-label="No outline">⃠</button>
                {COLORS.map((c) => (
                  <button key={c} className={`swatch ${sel.stroke === c ? 'on' : ''}`} style={{ background: c }} onClick={() => updateLayer(sel.id, { stroke: c })} aria-label={c} />
                ))}
              </div>
              <div className="chips">
                {FONTS.map((f) => (
                  <button key={f.id} className={sel.font === f.id ? 'on' : ''} style={{ fontFamily: `"${f.id}"` }} onClick={() => updateLayer(sel.id, { font: f.id })}>{f.label}</button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h3>Add</h3>
        <div className="chips">
          <button onClick={() => addLayer({ kind: 'text', text: 'NO WAY', x: 0.5, y: 0.5, size: 0.18, color: '#ffffff', stroke: '#000000', font: 'Anton', rotate: 0 })}>🅣 Text</button>
          <button onClick={() => imgInput.current?.click()}>🙂 Face / logo</button>
          <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => addImage(e.target.files?.[0])} />
        </div>
        <div className="stickers">
          {STICKERS.map((s) => (
            <button key={s} onClick={() => addLayer({ kind: 'emoji', text: s, x: 0.75 + Math.random() * 0.1, y: 0.3 + Math.random() * 0.2, size: 0.25, color: '#fff', stroke: 'none', font: 'Inter', rotate: 0 })}>{s}</button>
          ))}
        </div>
        <h3>Templates</h3>
        <div className="chips">
          {TEMPLATES.map((t) => (
            <button key={t.name} onClick={() => {
              setThumb((s) => ({ ...s, layers: t.layers.map((l) => ({ ...l, id: uid() })) }))
              setSelected(null)
            }}>{t.name}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Background frame</h3>
        <div className="chips">
          <button onClick={() => setBackground(playhead)} disabled={busy}>📍 Frame at {fmt(playhead)}</button>
        </div>
        {suggestions.length > 0 && (
          <>
            <p className="muted small">Suggested (most action):</p>
            <div className="frames">
              {suggestions.map((s) => (
                <button key={s.t} onClick={() => setBackground(s.t)} disabled={busy}>
                  <img src={s.thumb} alt={`Frame at ${fmt(s.t)}`} />
                  <span>{fmt(s.t)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <label className="slider"><span>Bright</span>
          <input type="range" min={-50} max={50} value={thumb.brightness} onChange={(e) => setThumb((t) => ({ ...t, brightness: +e.target.value }))} />
        </label>
        <label className="slider"><span>Contrast</span>
          <input type="range" min={-50} max={60} value={thumb.contrast} onChange={(e) => setThumb((t) => ({ ...t, contrast: +e.target.value }))} />
        </label>
        <label className="slider"><span>Color pop</span>
          <input type="range" min={-100} max={100} value={thumb.saturation} onChange={(e) => setThumb((t) => ({ ...t, saturation: +e.target.value }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={thumb.vignette} onChange={(e) => setThumb((t) => ({ ...t, vignette: e.target.checked }))} />
          Dark edges (makes text pop)
        </label>
      </section>

      <button className="primary wide" onClick={download}>⬇ Download thumbnail (1280×720 PNG)</button>
      {saveMsg && <p className="small center">{saveMsg}</p>}
    </div>
  )
}
