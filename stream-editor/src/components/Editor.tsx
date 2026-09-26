import { useEffect, useRef, useState } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SetClips, Source } from '../App'
import type { Analysis, Clip } from '../lib/types'
import { uid } from '../lib/types'
import { nearestThumb } from '../lib/analyze'
import { totalLength } from '../lib/autoEdit'
import { clamp, fmt, fmtDur } from '../lib/format'
import Timeline from './Timeline'

type Props = {
  source: Source
  analysis: Analysis | null
  clips: Clip[]
  setClips: SetClips
  canUndo: boolean
  undo: () => void
  playhead: number
  setPlayhead: (t: number) => void
  onReAuto: () => void
}

export default function Editor({ source, analysis, clips, setClips, canUndo, undo, playhead, setPlayhead, onReAuto }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  /** When set, the player walks through these clips in order. */
  const [queue, setQueue] = useState<{ ids: string[]; i: number } | null>(null)
  const clipsRef = useRef(clips)
  clipsRef.current = clips

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Start where the user left off.
  useEffect(() => {
    const v = video.current
    if (v && playhead) v.currentTime = playhead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seekTo = (t: number) => {
    const v = video.current
    if (!v) return
    v.currentTime = clamp(t, 0, source.duration)
    setPlayhead(v.currentTime)
  }

  const play = (ids: string[]) => {
    const first = clips.find((c) => c.id === ids[0])
    if (!first || !video.current) return
    setQueue({ ids, i: 0 })
    seekTo(first.start)
    video.current.play()
  }

  const onTime = () => {
    const v = video.current
    if (!v) return
    setPlayhead(v.currentTime)
    if (!queue) return
    const cur = clipsRef.current.find((c) => c.id === queue.ids[queue.i])
    if (!cur) return setQueue(null)
    if (v.currentTime >= cur.end) {
      const next = clipsRef.current.find((c) => c.id === queue.ids[queue.i + 1])
      if (next) {
        setQueue({ ...queue, i: queue.i + 1 })
        v.currentTime = next.start
      } else {
        v.pause()
        setQueue(null)
      }
    }
  }

  const update = (id: string, patch: Partial<Clip>, key?: string) =>
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)), key)

  const addAtPlayhead = () => {
    const start = clamp(playhead - 5, 0, source.duration)
    const clip = { id: uid(), start, end: clamp(start + 15, 0, source.duration) }
    // Insert in time order so the story still makes sense.
    setClips((cs) => {
      const i = cs.findIndex((c) => c.start > start)
      return i < 0 ? [...cs, clip] : [...cs.slice(0, i), clip, ...cs.slice(i)]
    })
    setOpenId(clip.id)
  }

  const splitAtPlayhead = () => {
    const c = clips.find((c) => playhead > c.start + 0.5 && playhead < c.end - 0.5)
    if (!c) return alert('Move the playhead inside a clip to split it.')
    setClips((cs) =>
      cs.flatMap((x) => (x.id === c.id ? [{ ...x, end: playhead }, { id: uid(), start: playhead, end: x.end }] : [x])),
    )
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setClips((cs) => arrayMove(cs, cs.findIndex((c) => c.id === active.id), cs.findIndex((c) => c.id === over.id)))
  }

  const playingId = queue?.ids[queue.i]

  return (
    <div className="stack">
      <div className="player">
        <video
          ref={video}
          src={source.url}
          playsInline
          controls
          preload="metadata"
          onTimeUpdate={onTime}
          onSeeked={() => video.current && setPlayhead(video.current.currentTime)}
        />
      </div>

      <Timeline duration={source.duration} analysis={analysis} clips={clips} playhead={playhead} onSeek={seekTo} activeId={openId} />

      <div className="toolbar">
        <button className="primary" onClick={() => play(clips.map((c) => c.id))} disabled={!clips.length}>▶ Play edit</button>
        <button onClick={addAtPlayhead}>＋ Clip here</button>
        <button onClick={splitAtPlayhead}>✂ Split</button>
        <button onClick={undo} disabled={!canUndo}>↶ Undo</button>
        <button onClick={onReAuto}>✨ Redo auto</button>
      </div>

      <div className="summary">
        <span><b>{clips.length}</b> clips</span>
        <span>Final length <b>{fmtDur(totalLength(clips))}</b></span>
        <span className="muted small">Hold ⠿ and drag to reorder</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={clips.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="clips">
            {clips.map((c, i) => (
              <ClipCard
                key={c.id}
                clip={c}
                index={i}
                duration={source.duration}
                thumb={nearestThumb(analysis, (c.start + c.end) / 2)}
                open={openId === c.id}
                playing={playingId === c.id}
                playhead={playhead}
                onToggle={() => setOpenId(openId === c.id ? null : c.id)}
                onPlay={() => play([c.id])}
                onChange={(patch, key) => update(c.id, patch, key)}
                onPreview={seekTo}
                onDuplicate={() =>
                  setClips((cs) => [...cs.slice(0, i + 1), { ...c, id: uid() }, ...cs.slice(i + 1)])
                }
                onDelete={() => setClips((cs) => cs.filter((x) => x.id !== c.id))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {!clips.length && (
        <div className="empty">
          No clips yet. Scrub the video and tap <b>＋ Clip here</b>, or <button className="link" onClick={onReAuto}>auto-edit again</button>.
        </div>
      )}
    </div>
  )
}

type CardProps = {
  clip: Clip
  index: number
  duration: number
  thumb?: string
  open: boolean
  playing: boolean
  playhead: number
  onToggle: () => void
  onPlay: () => void
  onChange: (patch: Partial<Clip>, key?: string) => void
  onPreview: (t: number) => void
  onDuplicate: () => void
  onDelete: () => void
}

function ClipCard(p: CardProps) {
  const { clip, index, duration } = p
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: clip.id })
  const len = clip.end - clip.start
  const lo = Math.max(0, clip.start - 60)
  const hi = Math.min(duration, clip.end + 60)

  const setStart = (t: number, key?: string) => {
    const start = clamp(t, 0, clip.end - 1)
    p.onChange({ start }, key)
    p.onPreview(start)
  }
  const setEnd = (t: number, key?: string) => {
    const end = clamp(t, clip.start + 1, duration)
    p.onChange({ end }, key)
    p.onPreview(end)
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`clip ${isDragging ? 'dragging' : ''} ${p.playing ? 'playing' : ''}`}
    >
      <div className="clip-row">
        <button ref={setActivatorNodeRef} className="handle" aria-label="Drag to reorder" {...attributes} {...listeners}>⠿</button>
        <button className="thumb" onClick={p.onPlay} aria-label="Play clip">
          {p.thumb ? <img src={p.thumb} alt="" /> : <span />}
          <span className="play">▶</span>
        </button>
        <button className="meta" onClick={p.onToggle}>
          <strong>Clip {index + 1}</strong>
          <span className="muted small">{fmt(clip.start)} → {fmt(clip.end)}</span>
        </button>
        <span className="pill">{fmtDur(len)}</span>
      </div>

      {p.open && (
        <div className="trim">
          <label>
            <span>Start <b>{fmt(clip.start)}</b></span>
            <input type="range" min={lo} max={hi} step={0.1} value={clip.start} onChange={(e) => setStart(+e.target.value, `s${clip.id}`)} />
          </label>
          <div className="nudges">
            <button onClick={() => setStart(clip.start - 1)}>−1s</button>
            <button onClick={() => setStart(p.playhead)}>Start = playhead</button>
            <button onClick={() => setStart(clip.start + 1)}>+1s</button>
          </div>
          <label>
            <span>End <b>{fmt(clip.end)}</b></span>
            <input type="range" min={lo} max={hi} step={0.1} value={clip.end} onChange={(e) => setEnd(+e.target.value, `e${clip.id}`)} />
          </label>
          <div className="nudges">
            <button onClick={() => setEnd(clip.end - 1)}>−1s</button>
            <button onClick={() => setEnd(p.playhead)}>End = playhead</button>
            <button onClick={() => setEnd(clip.end + 1)}>+1s</button>
          </div>
          <div className="nudges">
            <button onClick={p.onDuplicate}>⧉ Duplicate</button>
            <button className="danger" onClick={p.onDelete}>🗑 Delete</button>
          </div>
        </div>
      )}
    </li>
  )
}
