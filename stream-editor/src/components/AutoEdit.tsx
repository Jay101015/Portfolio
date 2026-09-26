import type { Source } from '../App'
import type { Analysis } from '../lib/types'
import { autoEdit, PRESETS, totalLength, type Preset } from '../lib/autoEdit'
import { fmt, fmtDur } from '../lib/format'

type Props = {
  source: Source
  analysis: Analysis | null
  scanning: boolean
  progress: number
  onPick: (p: Preset) => void
  onSkip: () => void
}

export default function AutoEdit({ source, analysis, scanning, progress, onPick, onSkip }: Props) {
  const ready = !!analysis
  return (
    <div className="stack">
      <section className="card">
        <h2>✨ Auto-edit</h2>
        <p className="muted">
          Your video is {fmt(source.duration)} long. {ready
            ? 'Scan done — pick a style. You can change anything afterwards.'
            : 'Scanning for the action (big on-screen changes = fights, kills, chaos)…'}
        </p>
        {scanning && (
          <>
            <div className="bar"><div style={{ width: `${progress * 100}%` }} /></div>
            <p className="muted small">Keep this tab open. Long VODs take a minute or two.</p>
          </>
        )}
        {!ready && !scanning && <p className="warn">Scan stopped. You can still edit by hand.</p>}
      </section>

      <div className="presets">
        {PRESETS.map((p) => {
          const needsScan = p.mode !== 'manual'
          const preview = ready && needsScan ? totalLength(autoEdit(p, analysis, source.duration)) : null
          return (
            <button key={p.id} className="preset" disabled={needsScan && !ready} onClick={() => onPick(p)}>
              <span className="emoji">{p.emoji}</span>
              <span className="body">
                <strong>{p.name}</strong>
                <span className="muted">{p.desc}</span>
              </span>
              {preview != null && <span className="pill">{fmtDur(preview)}</span>}
            </button>
          )
        })}
      </div>

      {scanning && (
        <button className="ghost" onClick={onSkip}>Skip scan and edit by hand</button>
      )}
    </div>
  )
}
