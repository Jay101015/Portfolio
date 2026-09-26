import { useRef, useState } from 'react'
import type { Source } from '../App'
import { canExport } from '../lib/exporter'

export default function Upload({ onFile, onBack }: { onFile: (s: Source) => void; onBack?: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [drag, setDrag] = useState(false)

  const load = (file?: File) => {
    if (!file) return
    setError(null)
    setLoading(true)
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.playsInline = true
    v.onloadedmetadata = async () => {
      // Some recorders (e.g. browser/WebM captures) don't store a duration; seeking to the end reveals it.
      if (v.duration === Infinity) {
        await new Promise<void>((r) => {
          v.ondurationchange = () => isFinite(v.duration) && r()
          setTimeout(r, 8000)
          v.currentTime = 1e9
        })
      }
      setLoading(false)
      if (!isFinite(v.duration) || v.duration <= 0) {
        setError('Couldn’t read that video’s length. Try an MP4 or MOV export.')
        return
      }
      onFile({ file, url, duration: v.duration, width: v.videoWidth, height: v.videoHeight })
    }
    v.onerror = () => {
      setLoading(false)
      URL.revokeObjectURL(url)
      setError('Your browser can’t play that file. MP4 (H.264) works everywhere.')
    }
    v.src = url
  }

  return (
    <div className="upload">
      <div className="brand">
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>Clip Cutter</h1>
        <p>Turn hours of stream into a highlight video + thumbnail — right on your phone.</p>
      </div>

      <button
        className={`drop ${drag ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          load(e.dataTransfer.files[0])
        }}
        disabled={loading}
      >
        <span className="big">{loading ? '⏳' : '🎮'}</span>
        <strong>{loading ? 'Opening…' : 'Pick your stream VOD'}</strong>
        <span className="muted">MP4 / MOV / WebM · any length · stays on your device</span>
      </button>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => load(e.target.files?.[0])} />

      {error && <div className="error">{error}</div>}
      {!canExport() && (
        <div className="warn">Heads up: this browser can’t save videos. Editing works, but use Chrome or Safari 15+ to export.</div>
      )}

      <ol className="how">
        <li><b>✨ Auto-edit</b> — we scan for the action and cut a first draft.</li>
        <li><b>✂️ Tweak</b> — drag clips to reorder, trim, delete, add your own.</li>
        <li><b>🖼️ Thumbnail</b> — pick a frame, slap on big text & stickers.</li>
        <li><b>⬇️ Export</b> — save or share straight to YouTube / TikTok.</li>
      </ol>

      {onBack && <button className="ghost" onClick={onBack}>← Back to current project</button>}
    </div>
  )
}
