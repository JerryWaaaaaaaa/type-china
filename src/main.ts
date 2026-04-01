import './style.css'
import GUI from 'lil-gui'
import type { Controller } from 'lil-gui'
import { fitPointsToCanvas, smoothClosedPolygon, type Pt } from './chinaOutline'
import {
  prepareWithSegments,
  drawSurroundingText,
  drawChinaText,
  clipToPolygon,
  strokePolygon,
  fillPolygon,
} from './textInShape'
import { MAP_BODY_TEXT, SURROUNDING_CITIES_TEXT } from './copy'
import { readThemeColors } from './themeColors'
import { loadSvgOutlinePoints, type SvgOutlineSampleOptions } from './mapShapeSvg'

const BASE_FONT_PX = 9
const BASE_LINE_HEIGHT = 10
const BASE_CHORD_PAD = 2
const BASE_MIN_CHORD = 10

/**
 * Map tuning — bound to lil-gui sliders (`tuningState`).
 *
 * - padding: Inset from the viewport; smaller = map can grow, larger = more empty border around the shape.
 * - outlineSmoothIterations: Chaikin smoothing passes on the fitted polygon (0 = sharp, 2–3 typical).
 * - mapStrokeWidth: Canvas stroke width in CSS pixels for the map outline (`strokePolygon`).
 * - svgMinSegments / svgMaxSegments / svgLengthDivisor: How `map.svg` path is sampled into points
 *   (see `SvgOutlineSampleOptions` in `mapShapeSvg.ts`). Changing these reloads the outline.
 * - fontScale: Map typography scale (Tanker).
 *
 * Colors: `--color-bg-surface` (fill inside map), `--color-map-stroke`, `--color-bg-canvas` in `colors.css`.
 */
type MapTuning = {
  padding: number
  outlineSmoothIterations: number
  mapStrokeWidth: number
  svgMinSegments: number
  svgMaxSegments: number
  svgLengthDivisor: number
}

type TuningState = MapTuning & { fontScale: number }

const defaultMapTuning: MapTuning = {
  padding: 28,
  outlineSmoothIterations: 2,
  mapStrokeWidth: 1.25,
  svgMinSegments: 120,
  svgMaxSegments: 3000,
  svgLengthDivisor: 1.5,
}

const defaultTuningState: TuningState = { ...defaultMapTuning, fontScale: 1 }

let tuningState: TuningState = { ...defaultTuningState }

/** Persisted slider defaults (localStorage). "Save all as defaults" writes every key. */
const TUNING_DEFAULTS_STORAGE_KEY = 'paula-map-tuning-defaults-v1'

type TuningDefaultKey = keyof TuningState

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Apply saved defaults from localStorage (clamped to slider ranges). Call before first render. */
function applyStoredTuningDefaults(): void {
  try {
    const raw = localStorage.getItem(TUNING_DEFAULTS_STORAGE_KEY)
    if (!raw) return
    const o = JSON.parse(raw) as Record<string, unknown>
    const num = (k: string, min: number, max: number) => {
      const v = o[k]
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
      return clamp(v, min, max)
    }

    const p = num('padding', 0, 200)
    if (p !== undefined) tuningState.padding = p
    const os = num('outlineSmoothIterations', 0, 8)
    if (os !== undefined) tuningState.outlineSmoothIterations = Math.round(os)
    const sw = num('mapStrokeWidth', 0, 8)
    if (sw !== undefined) tuningState.mapStrokeWidth = sw
    const smin = num('svgMinSegments', 20, 2000)
    if (smin !== undefined) tuningState.svgMinSegments = Math.round(smin)
    const smax = num('svgMaxSegments', 100, 8000)
    if (smax !== undefined) tuningState.svgMaxSegments = Math.round(smax)
    const sd = num('svgLengthDivisor', 0.25, 6)
    if (sd !== undefined) tuningState.svgLengthDivisor = sd
    const fs = num('fontScale', 0.5, 2)
    if (fs !== undefined) tuningState.fontScale = fs
  } catch {
    /* ignore corrupt storage */
  }
}

function saveTuningDefault(key: TuningDefaultKey, value: number): void {
  try {
    const raw = localStorage.getItem(TUNING_DEFAULTS_STORAGE_KEY)
    const o: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    o[key] = value
    localStorage.setItem(TUNING_DEFAULTS_STORAGE_KEY, JSON.stringify(o))
  } catch {
    /* quota / private mode */
  }
}

function saveAllTuningDefaults(): void {
  ;(Object.keys(tuningState) as TuningDefaultKey[]).forEach((k) => saveTuningDefault(k, tuningState[k]))
}

/** Pretext `prepare()` is canvas-heavy; debounce while dragging the text-size slider. */
const PREPARE_DEBOUNCE_MS = 110

/** Fewer repeats = faster Pretext `prepare()`; still enough to fill the map at typical sizes. */
const INNER_REPEAT = 42
const OUTER_REPEAT = 28
const TEXT_CORPUS = Array(INNER_REPEAT).fill(MAP_BODY_TEXT).join(' ')
const SURROUND_CORPUS = Array(OUTER_REPEAT).fill(SURROUNDING_CITIES_TEXT).join(' ')

/** Canvas map text only — family stack from `colors.css` `--font-map` (Tanker). UI uses `--font-ui` (Geist) in CSS. */
let mapFontStackCached: string | null = null
function getMapFontStack(): string {
  if (mapFontStackCached === null) {
    mapFontStackCached =
      getComputedStyle(document.documentElement).getPropertyValue('--font-map').trim() ||
      'Tanker, system-ui, sans-serif'
  }
  return mapFontStackCached
}

function getTextMetrics(scale: number) {
  const fontPx = Math.max(4, Math.round(BASE_FONT_PX * scale * 10) / 10)
  const lineHeight = Math.round(BASE_LINE_HEIGHT * scale * 10) / 10
  const chordPadding = Math.max(1, Math.round(BASE_CHORD_PAD * scale * 10) / 10)
  const minChordCssPx = Math.max(4, Math.round(BASE_MIN_CHORD * scale * 10) / 10)
  return {
    font: `400 ${fontPx}px ${getMapFontStack()}`,
    lineHeight,
    chordPadding,
    minChordCssPx,
  }
}

let preparedInner: ReturnType<typeof prepareWithSegments>
let preparedOuter: ReturnType<typeof prepareWithSegments>

function rebuildPrepared() {
  const font = getTextMetrics(tuningState.fontScale).font
  preparedInner = prepareWithSegments(TEXT_CORPUS, font)
  preparedOuter = prepareWithSegments(SURROUND_CORPUS, font)
}

const canvas = document.createElement('canvas')
const ctxRaw = canvas.getContext('2d')
if (!ctxRaw) throw new Error('Canvas unsupported')
const ctx = ctxRaw

const root = document.querySelector<HTMLDivElement>('#app')!
root.appendChild(canvas)

/** Viewport pan (CSS px); map + text use the same offset via `displayPoly` in `renderFrame`. */
let panX = 0
let panY = 0

type PanDragState = {
  startClientX: number
  startClientY: number
  startPanX: number
  startPanY: number
  pointerId: number
} | null

let panDrag: PanDragState = null
let panRenderScheduled = false

let lastCssW = 0
let lastCssH = 0
let lastDpr = 0

function sizeCanvas(): { cssW: number; cssH: number } {
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
  const cssW = window.innerWidth
  const cssH = window.innerHeight
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  if (cssW !== lastCssW || cssH !== lastCssH || dpr !== lastDpr) {
    lastCssW = cssW
    lastCssH = cssH
    lastDpr = dpr
    canvas.width = Math.floor(cssW * dpr)
    canvas.height = Math.floor(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  return { cssW, cssH }
}

/** Raw points from `map.svg` (sampling controlled by tuningState SVG fields). */
let outlineFromSvg: Pt[] = []
/** Bumped when `outlineFromSvg` is replaced so smoothed-point cache cannot go stale. */
let outlineVersion = 0

function svgSampleOpts(): SvgOutlineSampleOptions {
  return {
    minSegments: tuningState.svgMinSegments,
    maxSegments: tuningState.svgMaxSegments,
    lengthDivisor: tuningState.svgLengthDivisor,
  }
}

async function reloadOutlineFromSvg(): Promise<void> {
  outlineFromSvg = await loadSvgOutlinePoints('/map.svg', svgSampleOpts())
  outlineVersion += 1
}

let smoothedPointsCache: { key: string; points: Pt[] } | null = null

function invalidateOutlineCache() {
  smoothedPointsCache = null
}

function getSmoothedOutline(cssW: number, cssH: number): Pt[] {
  const key = `${outlineVersion}_${cssW}x${cssH}_${tuningState.padding}_${tuningState.outlineSmoothIterations}`
  if (smoothedPointsCache?.key === key) return smoothedPointsCache.points
  const rawPoints = fitPointsToCanvas(outlineFromSvg, cssW, cssH, tuningState.padding)
  const points = smoothClosedPolygon(rawPoints, tuningState.outlineSmoothIterations)
  smoothedPointsCache = { key, points }
  return points
}

function renderFrame() {
  const theme = readThemeColors()
  const { cssW, cssH } = sizeCanvas()
  const points = getSmoothedOutline(cssW, cssH)
  const displayPoly = points.map((p) => ({ x: p.x + panX, y: p.y + panY }))

  ctx.fillStyle = theme.bgCanvas
  ctx.fillRect(0, 0, cssW, cssH)

  const m = getTextMetrics(tuningState.fontScale)
  drawSurroundingText(ctx, displayPoly, cssW, cssH, preparedOuter, {
    font: m.font,
    lineHeight: m.lineHeight,
    chordPadding: m.chordPadding,
    minChordCssPx: m.minChordCssPx,
    wordColors: theme.textOnCanvas,
  })

  fillPolygon(ctx, displayPoly, theme.bgSurface)

  ctx.save()
  clipToPolygon(ctx, displayPoly)
  drawChinaText(ctx, displayPoly, preparedInner, {
    font: m.font,
    lineHeight: m.lineHeight,
    chordPadding: m.chordPadding,
    minChordCssPx: m.minChordCssPx,
    wordColors: theme.textOnSurface,
  })
  ctx.restore()

  strokePolygon(ctx, displayPoly, theme.mapStroke, tuningState.mapStrokeWidth)
}

function schedulePanRender(): void {
  if (panRenderScheduled) return
  panRenderScheduled = true
  requestAnimationFrame(() => {
    panRenderScheduled = false
    renderFrame()
  })
}

function endPanDrag(e: PointerEvent): void {
  if (!panDrag || panDrag.pointerId !== e.pointerId) return
  try {
    canvas.releasePointerCapture(e.pointerId)
  } catch {
    /* already released */
  }
  panDrag = null
  document.body.classList.remove('is-dragging-map')
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  panDrag = {
    startClientX: e.clientX,
    startClientY: e.clientY,
    startPanX: panX,
    startPanY: panY,
    pointerId: e.pointerId,
  }
  canvas.setPointerCapture(e.pointerId)
  document.body.classList.add('is-dragging-map')
})

canvas.addEventListener('pointermove', (e) => {
  if (!panDrag || panDrag.pointerId !== e.pointerId) return
  panX = panDrag.startPanX + (e.clientX - panDrag.startClientX)
  panY = panDrag.startPanY + (e.clientY - panDrag.startClientY)
  schedulePanRender()
})

canvas.addEventListener('pointerup', endPanDrag)
canvas.addEventListener('pointercancel', endPanDrag)

const TUNING_HINTS: Record<keyof TuningState, string> = {
  padding:
    'Inset from the window edge before the map outline is scaled and centered. More padding shrinks the map and adds empty margin. Performance: usually negligible; slightly less map area can mean a bit less text to lay out.',
  outlineSmoothIterations:
    'Chaikin smoothing passes on the fitted outline. Higher values round sharp corners more (slightly reduces inner area); zero keeps the raw fitted shape. Performance: each extra pass adds more vertices — larger numbers slow polygon clipping, scanlines, and text layout.',
  mapStrokeWidth:
    'Thickness of the border stroke drawn on top of the map polygon (canvas line width in CSS pixels). Does not change fill or text. Performance: impact is tiny (one stroked path per frame).',
  svgMinSegments:
    'Minimum number of points sampled along the map.svg path; raises the floor for short paths so the outline stays smooth enough for text layout. Performance: raising this increases vertex count — larger numbers make outline smoothing, clipping, and text placement heavier (the app gets slower).',
  svgMaxSegments:
    'Maximum samples along the path; caps point count for very long SVG paths before smoothing. Performance: a higher ceiling allows more points — on big paths, larger values noticeably slow loading and each frame that uses the polygon.',
  svgLengthDivisor:
    'Sample count is roughly path length ÷ this value (then clamped by min/max). Lower divisor = more points and a finer polygon. Performance: smaller divisors (more segments) increase CPU and memory for the outline and all text-in-shape work — the app gets slower as segment count goes up.',
  fontScale:
    'Scale for map typography (Tanker): text clipped inside the outline and the surrounding ring. Performance: larger values mean bigger glyphs and more Pretext “prepare” work — higher scale slows text rebuilds and can make interaction feel heavier until layout finishes.',
}

function hintController(c: Controller, key: keyof TuningState): void {
  const text = TUNING_HINTS[key]
  c.domElement.title = text
  c.domElement.setAttribute('aria-label', text)
}

function buildTuningGui() {
  let svgReloadDebounce: ReturnType<typeof setTimeout> | null = null
  let prepareDebounce: ReturnType<typeof setTimeout> | null = null

  const scheduleSvgReload = () => {
    if (svgReloadDebounce !== null) clearTimeout(svgReloadDebounce)
    svgReloadDebounce = setTimeout(() => {
      svgReloadDebounce = null
      void reloadOutlineFromSvg().then(() => {
        invalidateOutlineCache()
        requestAnimationFrame(() => renderFrame())
      })
    }, 120)
  }

  const flushSvgReloadNow = () => {
    if (svgReloadDebounce !== null) {
      clearTimeout(svgReloadDebounce)
      svgReloadDebounce = null
    }
    void reloadOutlineFromSvg().then(() => {
      invalidateOutlineCache()
      requestAnimationFrame(() => renderFrame())
    })
  }

  const flushPrepareAndRender = () => {
    rebuildPrepared()
    requestAnimationFrame(() => renderFrame())
  }

  const gui = new GUI({
    container: root,
    autoPlace: false,
    title: 'Map tuning',
    width: 320,
    injectStyles: false,
  })

  const cPad = gui
    .add(tuningState, 'padding', 0, 200, 1)
    .name('Map padding')
    .onChange(() => {
      invalidateOutlineCache()
      requestAnimationFrame(() => renderFrame())
    })
  hintController(cPad, 'padding')

  const cSmooth = gui
    .add(tuningState, 'outlineSmoothIterations', 0, 8, 1)
    .name('Outline smooth')
    .onChange(() => {
      tuningState.outlineSmoothIterations = Math.round(tuningState.outlineSmoothIterations)
      invalidateOutlineCache()
      requestAnimationFrame(() => renderFrame())
    })
  hintController(cSmooth, 'outlineSmoothIterations')

  const cStroke = gui
    .add(tuningState, 'mapStrokeWidth', 0, 8, 0.05)
    .name('Map stroke width')
    .onChange(() => {
      requestAnimationFrame(() => renderFrame())
    })
  hintController(cStroke, 'mapStrokeWidth')

  const wireSvgField = (key: 'svgMinSegments' | 'svgMaxSegments' | 'svgLengthDivisor', step: number) => {
    const min = key === 'svgLengthDivisor' ? 0.25 : key === 'svgMinSegments' ? 20 : 100
    const max = key === 'svgLengthDivisor' ? 6 : key === 'svgMinSegments' ? 2000 : 8000
    const c = gui
      .add(tuningState, key, min, max, step)
      .onChange(() => {
        if (key !== 'svgLengthDivisor') {
          tuningState[key] = Math.round(tuningState[key] as number)
        }
        scheduleSvgReload()
      })
      .onFinishChange(() => {
        if (key !== 'svgLengthDivisor') {
          tuningState[key] = Math.round(tuningState[key] as number)
        }
        flushSvgReloadNow()
      })
    hintController(c, key)
    if (key === 'svgMinSegments') c.name('SVG min segments')
    if (key === 'svgMaxSegments') c.name('SVG max segments')
    if (key === 'svgLengthDivisor') c.name('SVG length ÷')
  }

  wireSvgField('svgMinSegments', 10)
  wireSvgField('svgMaxSegments', 50)
  wireSvgField('svgLengthDivisor', 0.05)

  const cFont = gui
    .add(tuningState, 'fontScale', 0.5, 2, 0.1)
    .name('Text size')
    .onChange(() => {
      if (prepareDebounce !== null) clearTimeout(prepareDebounce)
      prepareDebounce = setTimeout(() => {
        prepareDebounce = null
        flushPrepareAndRender()
      }, PREPARE_DEBOUNCE_MS)
    })
    .onFinishChange(() => {
      if (prepareDebounce !== null) {
        clearTimeout(prepareDebounce)
        prepareDebounce = null
      }
      flushPrepareAndRender()
    })
  hintController(cFont, 'fontScale')

  const defaults = {
    saveAllDefaults() {
      saveAllTuningDefaults()
    },
  }
  const cSave = gui.add(defaults, 'saveAllDefaults').name('Save all as defaults')
  cSave.domElement.title =
    'Writes every slider value to localStorage (same keys as before). Hover other rows for full help text.'
}

async function paint() {
  applyStoredTuningDefaults()
  await document.fonts.load(getTextMetrics(tuningState.fontScale).font)
  await reloadOutlineFromSvg()
  rebuildPrepared()

  buildTuningGui()

  renderFrame()
  window.addEventListener('resize', () => {
    invalidateOutlineCache()
    renderFrame()
  })
}

paint().catch((e) => {
  console.error(e)
  root.textContent = String(e)
})
