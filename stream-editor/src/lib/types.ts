export type Clip = {
  id: string
  start: number
  end: number
}

export type Sample = {
  t: number
  score: number
  thumb: string
}

export type Analysis = {
  samples: Sample[]
  interval: number
}

export type LayerKind = 'text' | 'emoji' | 'image'

export type Layer = {
  id: string
  kind: LayerKind
  text: string
  /** image layers only: data URL */
  src?: string
  /** centre position, 0–1 of canvas width/height */
  x: number
  y: number
  /** height as a fraction of canvas height */
  size: number
  color: string
  stroke: string
  font: string
  rotate: number
}

export type ThumbState = {
  /** full-res JPEG data URL of the background frame */
  bg: string | null
  brightness: number
  contrast: number
  saturation: number
  vignette: boolean
  layers: Layer[]
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export const emptyThumb = (): ThumbState => ({
  bg: null,
  brightness: 0,
  contrast: 15,
  saturation: 25,
  vignette: true,
  layers: [],
})
