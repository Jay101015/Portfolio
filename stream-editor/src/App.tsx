import { useCallback, useEffect, useRef, useState } from 'react'
import type { Analysis, Clip, ThumbState } from './lib/types'
import { emptyThumb } from './lib/types'
import { analyzeVideo } from './lib/analyze'
import { autoEdit, PRESETS, type Preset } from './lib/autoEdit'
import Upload from './components/Upload'
import AutoEdit from './components/AutoEdit'
import Editor from './components/Editor'
import ThumbnailEditor from './components/ThumbnailEditor'
import Export from './components/Export'

export type Step = 'upload' | 'auto' | 'edit' | 'thumb' | 'export'

const STEPS: { id: Step; icon: string; label: string }[] = [
  { id: 'auto', icon: '✨', label: 'Auto' },
  { id: 'edit', icon: '✂️', label: 'Edit' },
  { id: 'thumb', icon: '🖼️', label: 'Thumbnail' },
  { id: 'export', icon: '⬇️', label: 'Export' },
]

export type Source = { file: File; url: string; duration: number; width: number; height: number }

type EditState = { clips: Clip[]; history: Clip[][]; lastKey: string | null }
export type SetClips = (next: Clip[] | ((c: Clip[]) => Clip[]), coalesce?: string) => void

const saveKey = (f: File) => `clipcutter:${f.name}:${f.size}`

export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [source, setSource] = useState<Source | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [progress, setProgress] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [edit, setEdit] = useState<EditState>({ clips: [], history: [], lastKey: null })
  const { clips, history } = edit
  const [preset, setPreset] = useState<Preset>(PRESETS[0])
  const [thumb, setThumb] = useState<ThumbState>(emptyThumb)
  const [playhead, setPlayhead] = useState(0)
  const [restore, setRestore] = useState<{ clips: Clip[]; thumb?: ThumbState } | null>(null)
  const abort = useRef<AbortController | null>(null)

  /** `coalesce`: repeated edits with the same key (e.g. dragging a trim slider) make one undo step. */
  const setClips: SetClips = useCallback((next, coalesce) => {
    setEdit((e) => {
      const value = typeof next === 'function' ? next(e.clips) : next
      if (value === e.clips) return e
      const merge = coalesce != null && coalesce === e.lastKey
      return { clips: value, history: merge ? e.history : [...e.history.slice(-49), e.clips], lastKey: coalesce ?? null }
    })
  }, [])

  const undo = useCallback(() => {
    setEdit((e) => (e.history.length ? { clips: e.history[e.history.length - 1], history: e.history.slice(0, -1), lastKey: null } : e))
  }, [])

  const resetClips = (c: Clip[]) => setEdit({ clips: c, history: [], lastKey: null })

  const startScan = useCallback(async (src: Source) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setScanning(true)
    setProgress(0)
    try {
      setAnalysis(await analyzeVideo(src.url, src.duration, setProgress, ctrl.signal))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e)
    } finally {
      if (abort.current === ctrl) setScanning(false)
    }
  }, [])

  const onFile = useCallback(
    (src: Source) => {
      if (source) URL.revokeObjectURL(source.url)
      setSource(src)
      setAnalysis(null)
      resetClips([{ id: 'full', start: 0, end: src.duration }])
      setThumb(emptyThumb())
      try {
        const saved = JSON.parse(localStorage.getItem(saveKey(src.file)) ?? 'null')
        setRestore(saved?.clips?.length ? saved : null)
      } catch {
        /* storage unavailable */
      }
      setStep('auto')
      startScan(src)
    },
    [source, startScan],
  )

  // Remember the edit for this file so a refresh doesn't lose work.
  useEffect(() => {
    if (!source || step === 'auto') return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(saveKey(source.file), JSON.stringify({ clips, thumb }))
      } catch {
        try {
          localStorage.setItem(saveKey(source.file), JSON.stringify({ clips }))
        } catch {
          /* ignore */
        }
      }
    }, 500)
    return () => clearTimeout(t)
  }, [source, clips, thumb, step])

  const applyPreset = (p: Preset) => {
    if (!source) return
    setPreset(p)
    setClips(autoEdit(p, analysis, source.duration))
    setStep('edit')
  }

  if (!source || step === 'upload') {
    return (
      <div className="app">
        <Upload onFile={onFile} onBack={source ? () => setStep('edit') : undefined} />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="top">
        <button className="ghost small" onClick={() => setStep('upload')}>＋ New</button>
        <div className="title" title={source.file.name}>{source.file.name}</div>
        {scanning && <div className="pill">Scanning {Math.round(progress * 100)}%</div>}
      </header>

      <main className="content">
        {restore && step === 'auto' && (
          <div className="card restore">
            <strong>Welcome back! You edited this video before.</strong>
            <div className="chips">
              <button className="primary" onClick={() => {
                resetClips(restore.clips)
                if (restore.thumb) setThumb(restore.thumb)
                setRestore(null)
                setStep('edit')
              }}>Restore my edit</button>
              <button onClick={() => setRestore(null)}>Start fresh</button>
            </div>
          </div>
        )}
        {step === 'auto' && (
          <AutoEdit
            source={source}
            analysis={analysis}
            scanning={scanning}
            progress={progress}
            onPick={applyPreset}
            onSkip={() => {
              abort.current?.abort()
              setScanning(false)
              applyPreset(PRESETS[PRESETS.length - 1])
            }}
          />
        )}
        {step === 'edit' && (
          <Editor
            source={source}
            analysis={analysis}
            clips={clips}
            setClips={setClips}
            canUndo={history.length > 0}
            undo={undo}
            playhead={playhead}
            setPlayhead={setPlayhead}
            onReAuto={() => setStep('auto')}
          />
        )}
        {step === 'thumb' && (
          <ThumbnailEditor source={source} analysis={analysis} thumb={thumb} setThumb={setThumb} playhead={playhead} />
        )}
        {step === 'export' && (
          <Export source={source} clips={clips} thumb={thumb} vertical={!!preset.vertical} onEditThumb={() => setStep('thumb')} />
        )}
      </main>

      <nav className="tabs">
        {STEPS.map((s) => (
          <button key={s.id} className={step === s.id ? 'active' : ''} onClick={() => setStep(s.id)}>
            <span className="icon">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
