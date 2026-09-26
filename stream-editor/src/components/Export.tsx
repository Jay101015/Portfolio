import { useEffect, useRef, useState } from 'react'
import type { Source } from '../App'
import type { Clip, ThumbState } from '../lib/types'
import type { Fit } from '../lib/video'
import { canExport, exportVideo, type ExportResult } from '../lib/exporter'
import { renderThumbnail } from '../lib/thumbnail'
import { totalLength } from '../lib/autoEdit'
import { fmtDur } from '../lib/format'
import { hostedOnClaude, saveFile } from '../lib/save'

type Props = { source: Source; clips: Clip[]; thumb: ThumbState; vertical: boolean; onEditThumb: () => void }

const SIZES = {
  landscape: { label: 'YouTube 16:9', dims: { '720p': [1280, 720], '1080p': [1920, 1080] } },
  vertical: { label: 'Shorts / TikTok 9:16', dims: { '720p': [720, 1280], '1080p': [1080, 1920] } },
} as const

type WakeLock = { release: () => Promise<void> }

export default function Export({ source, clips, thumb, vertical, onEditThumb }: Props) {
  const [aspect, setAspect] = useState<keyof typeof SIZES>(vertical ? 'vertical' : 'landscape')
  const [res, setRes] = useState<'720p' | '1080p'>('720p')
  const [fit, setFit] = useState<Fit>('blur')
  const [introSec, setIntroSec] = useState(0)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [state, setState] = useState<{ p: number; label: string } | null>(null)
  const [result, setResult] = useState<(ExportResult & { url: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  const length = totalLength(clips) + introSec
  const hasThumb = !!thumb.bg || thumb.layers.length > 0
  const baseName = source.file.name.replace(/\.[^.]+$/, '')

  useEffect(() => {
    if (!hasThumb) return
    renderThumbnail(thumb, 640, 360).then((c) => setThumbUrl(c.toDataURL('image/jpeg', 0.8)))
  }, [thumb, hasThumb])

  useEffect(() => () => {
    ctrl.current?.abort()
  }, [])

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url)
  }, [result])

  const start = async () => {
    setError(null)
    setResult(null)
    const [w, h] = SIZES[aspect].dims[res]
    const c = new AbortController()
    ctrl.current = c
    let lock: WakeLock | null = null
    try {
      lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<WakeLock> } }).wakeLock?.request('screen') ?? null
    } catch {
      /* not supported */
    }
    setState({ p: 0, label: 'Starting…' })
    try {
      const intro = introSec && hasThumb ? await renderThumbnail(thumb) : null
      const r = await exportVideo({
        src: source.url, clips, width: w, height: h, fit: aspect === 'vertical' ? fit : 'contain',
        intro, introSec: intro ? introSec : 0,
        onProgress: (p, label) => setState({ p, label }),
        signal: c.signal,
      })
      setResult({ ...r, url: URL.createObjectURL(r.blob) })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Export failed')
    } finally {
      setState(null)
      lock?.release().catch(() => {})
    }
  }

  const share = async () => {
    if (!result) return
    const file = new File([result.blob], `${baseName}-edit.${result.ext}`, { type: result.blob.type })
    try {
      await navigator.share({ files: [file], title: baseName })
    } catch {
      /* user cancelled */
    }
  }

  const save = async () => {
    if (!result) return
    const out = await saveFile(`${baseName}-edit.${result.ext}`, result.blob)
    setSaveMsg(out === 'saved' ? 'Saved ✔' : out === 'declined' ? null : 'Couldn’t save on this device. Try another browser.')
  }

  const canShare = !hostedOnClaude && !!result && typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([], `x.${result.ext}`, { type: result.blob.type })] })

  return (
    <div className="stack">
      <section className="card">
        <h2>⬇️ Export</h2>
        <p className="muted">
          {clips.length} clips · final video <b>{fmtDur(length)}</b>. Rendering happens on your phone in real time,
          so it takes about as long as the video. Keep the screen on.
        </p>
      </section>

      <section className="card">
        <h3>Format</h3>
        <div className="chips">
          {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => (
            <button key={k} className={aspect === k ? 'on' : ''} onClick={() => setAspect(k)}>{SIZES[k].label}</button>
          ))}
        </div>
        {aspect === 'vertical' && (
          <>
            <h3>Fit gameplay</h3>
            <div className="chips">
              <button className={fit === 'blur' ? 'on' : ''} onClick={() => setFit('blur')}>Blurred fill</button>
              <button className={fit === 'cover' ? 'on' : ''} onClick={() => setFit('cover')}>Zoom to fill</button>
              <button className={fit === 'contain' ? 'on' : ''} onClick={() => setFit('contain')}>Black bars</button>
            </div>
          </>
        )}
        <h3>Quality</h3>
        <div className="chips">
          {(['720p', '1080p'] as const).map((r) => (
            <button key={r} className={res === r ? 'on' : ''} onClick={() => setRes(r)}>{r}{r === '720p' ? ' (faster)' : ''}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Thumbnail</h3>
        {hasThumb ? (
          <>
            {thumbUrl && <img className="thumb-preview" src={thumbUrl} alt="Thumbnail preview" />}
            <p className="muted small">Show it at the start of the video (also becomes the preview frame on most apps):</p>
            <div className="chips">
              {[0, 1, 2, 3].map((s) => (
                <button key={s} className={introSec === s ? 'on' : ''} onClick={() => setIntroSec(s)}>{s ? `${s}s intro` : 'No intro'}</button>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">No thumbnail yet. <button className="link" onClick={onEditThumb}>Make one →</button></p>
        )}
      </section>

      {state ? (
        <section className="card">
          <strong>{state.label}</strong>
          <div className="bar"><div style={{ width: `${state.p * 100}%` }} /></div>
          <p className="muted small">{Math.round(state.p * 100)}% · about {fmtDur(Math.max(0, length * (1 - state.p)))} left</p>
          <button className="ghost" onClick={() => ctrl.current?.abort()}>Cancel</button>
        </section>
      ) : (
        <button className="primary wide" onClick={start} disabled={!clips.length || !canExport()}>🎬 Render video</button>
      )}
      {!canExport() && <div className="warn">This browser can’t record video. Open the app in Chrome or Safari 15+.</div>}
      {error && <div className="error">{error}</div>}

      {result && (
        <section className="card">
          <h3>✅ Done!</h3>
          <video className="result" src={result.url} controls playsInline />
          <div className="chips">
            <button className="primary" onClick={save}>⬇ Save video</button>
            {canShare && <button onClick={share}>📤 Share to app</button>}
          </div>
          {saveMsg && <p className="small">{saveMsg}</p>}
          {result.ext === 'webm' && (
            <p className="muted small">Saved as WebM — YouTube accepts it directly. For TikTok/Instagram, Safari exports MP4.</p>
          )}
        </section>
      )}
    </div>
  )
}
