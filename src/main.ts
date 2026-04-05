import './style.css'
import GUI from 'lil-gui'
import { drawWordsInShape, drawWordsAroundShape, type WordHitBox } from './textInShape'
import {
  type PngMask,
  loadPngMask,
  computeMaskTransform,
  maskCellIsInside,
  maskCellIsOutside,
  imagePixelIsOpaque,
} from './pngMask'
import { readThemeColors } from './themeColors'
import { MAP_FILLER_TEXT, SURROUNDING_CITIES_TEXT } from './copy'
import { GEO_BOUNDS } from './mapGeo'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_FAMILY = "'Geist Mono', monospace"

const LANDMARK_DEFS = [
  { path: '/landmark-images/temple of heaven.png', lon: 116.4074, lat: 39.9042 },
  { path: '/landmark-images/terracotta warriors.png', lon: 108.9402, lat: 34.3416 },
]

// ─── Landmark State ───────────────────────────────────────────────────────────

type Landmark = { nx: number; ny: number }
type LandmarkRect = { x: number; y: number; w: number; h: number; img: HTMLImageElement }

let landmarks: Landmark[] = []
let landmarkImgs: HTMLImageElement[] = []
let landmarkMasks: PngMask[] = []
let landmarkRects: LandmarkRect[] = []

// Word arrays — color cycles once per word; truncation cuts within a word at span edges
const INNER_WORDS = Array(50).fill(MAP_FILLER_TEXT).join(' ').toUpperCase().split(/\s+/).filter(Boolean)
const OUTER_WORDS = Array(30).fill(SURROUNDING_CITIES_TEXT).join(' ').toUpperCase().split(/\s+/).filter(Boolean)

// ─── GUI Params ───────────────────────────────────────────────────────────────

const params = {
  fontSize:        12,
  lineHeight:      14,
  mapPadding:      30,
  charWScale:      1.45,
  lineHeightScale: 1.6,
  innerHoverRadiusX: 20,
  innerHoverRadiusY: 3,
  outerHoverRadiusX: 11,
  outerHoverRadiusY: 7,
  imgSizeRatio:      0.12,
}

const gui = new GUI({ title: 'Text Controls' })
gui.add(params, 'fontSize',        6,   18,  0.5 ).name('Font Size').onChange(renderFrame)
gui.add(params, 'lineHeight',      7,   22,  0.5 ).name('Line Height').onChange(renderFrame)
gui.add(params, 'mapPadding',      0,  120,  1   ).name('Map Padding').onChange(renderFrame)
gui.add(params, 'charWScale',      0.5,  3,  0.05).name('Char Width Scale').onChange(renderFrame)
gui.add(params, 'lineHeightScale', 0.5,  3,  0.05).name('Line Height Scale').onChange(renderFrame)
gui.add(params, 'innerHoverRadiusX', 0, 20, 1).name('Inner Hover X')
gui.add(params, 'innerHoverRadiusY', 0, 20, 1).name('Inner Hover Y')
gui.add(params, 'outerHoverRadiusX', 0, 20, 1).name('Outer Hover X')
gui.add(params, 'outerHoverRadiusY', 0, 20, 1).name('Outer Hover Y')
gui.add(params, 'imgSizeRatio', 0.05, 0.4, 0.01).name('Image Size').onChange(renderFrame)

// ─── DOM Structure ────────────────────────────────────────────────────────────

const root = document.querySelector<HTMLDivElement>('#app')!

const canvas = document.createElement('canvas')
canvas.id = 'map-canvas'
canvas.setAttribute('aria-label', 'Map filled with text — drag to pan')
root.appendChild(canvas)
const ctx = canvas.getContext('2d')!

// ─── Canvas Sizing ────────────────────────────────────────────────────────────

let lastW = 0
let lastH = 0
let lastDpr = 0

function sizeCanvas(): { w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  if (w !== lastW || h !== lastH || dpr !== lastDpr) {
    lastW = w
    lastH = h
    lastDpr = dpr
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  return { w, h }
}

// ─── Pan ──────────────────────────────────────────────────────────────────────

let panX = 0
let panY = 0

// ─── Hover ────────────────────────────────────────────────────────────────────

let innerBoxes: WordHitBox[] = []
let outerBoxes: WordHitBox[] = []
let hoveredInner: WordHitBox | null = null
let hoveredOuter: WordHitBox | null = null

type PanState = {
  pid: number
  startCX: number
  startCY: number
  startPX: number
  startPY: number
} | null

type ImageDragState = {
  landmarkIdx: number
  pid: number
  startCX: number
  startCY: number
  startNX: number
  startNY: number
} | null

let panState: PanState = null
let imageDragState: ImageDragState = null
let panRaf = 0

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  const mx = e.clientX
  const my = e.clientY
  const hitIdx = landmarkRects.findIndex(r => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h)
  if (hitIdx >= 0) {
    imageDragState = {
      landmarkIdx: hitIdx,
      pid: e.pointerId,
      startCX: mx,
      startCY: my,
      startNX: landmarks[hitIdx].nx,
      startNY: landmarks[hitIdx].ny,
    }
    canvas.setPointerCapture(e.pointerId)
    document.body.classList.add('is-panning')
    return
  }
  panState = {
    pid: e.pointerId,
    startCX: e.clientX,
    startCY: e.clientY,
    startPX: panX,
    startPY: panY,
  }
  canvas.setPointerCapture(e.pointerId)
  document.body.classList.add('is-panning')
  hoveredInner = null
  hoveredOuter = null
})

canvas.addEventListener('pointermove', (e) => {
  if (imageDragState && imageDragState.pid === e.pointerId && mask) {
    const t = computeMaskTransform(mask.imgW, mask.imgH, lastW, lastH, params.mapPadding, panX, panY)
    landmarks[imageDragState.landmarkIdx].nx = imageDragState.startNX + (e.clientX - imageDragState.startCX) / (mask.imgW * t.scale)
    landmarks[imageDragState.landmarkIdx].ny = imageDragState.startNY + (e.clientY - imageDragState.startCY) / (mask.imgH * t.scale)
    if (!panRaf) {
      panRaf = requestAnimationFrame(() => { panRaf = 0; renderFrame() })
    }
    return
  }
  if (!panState || panState.pid !== e.pointerId) return
  panX = panState.startPX + (e.clientX - panState.startCX)
  panY = panState.startPY + (e.clientY - panState.startCY)
  if (!panRaf) {
    panRaf = requestAnimationFrame(() => {
      panRaf = 0
      renderFrame()
    })
  }
})

const endPan = (e: PointerEvent): void => {
  if (imageDragState && imageDragState.pid === e.pointerId) {
    imageDragState = null
    document.body.classList.remove('is-panning')
    try { canvas.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    return
  }
  if (!panState || panState.pid !== e.pointerId) return
  panState = null
  document.body.classList.remove('is-panning')
  try {
    canvas.releasePointerCapture(e.pointerId)
  } catch {
    /* already released */
  }
}
canvas.addEventListener('pointerup', endPan)
canvas.addEventListener('pointercancel', endPan)

canvas.addEventListener('mousemove', (e) => {
  if (panState) return
  const mx = e.clientX
  const my = e.clientY
  const hitBox = (boxes: WordHitBox[]) =>
    boxes.find(b => mx >= b.x && mx < b.x + b.w && my >= b.y && my < b.y + b.h)
  const ni = hitBox(innerBoxes) ?? null
  const no = hitBox(outerBoxes) ?? null
  if (ni?.wordIdx !== hoveredInner?.wordIdx || no?.wordIdx !== hoveredOuter?.wordIdx) {
    hoveredInner = ni
    hoveredOuter = no
    renderFrame()
  }
})

// ─── PNG Mask ─────────────────────────────────────────────────────────────────

let mask: PngMask | null = null

// ─── Render ───────────────────────────────────────────────────────────────────

function renderFrame(): void {
  if (!mask) return
  const theme = readThemeColors()
  const { w, h } = sizeCanvas()
  const { fontSize, lineHeight, mapPadding, charWScale, lineHeightScale } = params
  const fontSpec = `400 ${fontSize}px ${FONT_FAMILY}`

  // Measure charW from the actual rendered font so detection stays in sync with rendering
  ctx.font = fontSpec
  const charW = ctx.measureText('M').width
  const detW = charW * charWScale
  const detH = lineHeight * lineHeightScale

  const transform = computeMaskTransform(mask.imgW, mask.imgH, w, h, mapPadding, panX, panY)

  // Compute landmark screen rects for this frame (used by text exclusion + drawing + drag hit-test)
  landmarkRects = landmarks.map((lm, i) => {
    const img = landmarkImgs[i]
    const cx = lm.nx * mask!.imgW * transform.scale + transform.offsetX
    const cy = lm.ny * mask!.imgH * transform.scale + transform.offsetY
    const rw = mask!.imgW * transform.scale * params.imgSizeRatio
    const rh = rw * (img.naturalHeight / img.naturalWidth)
    return { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh, img }
  })

  // Inside: horizontal text footprint = charW wide × lineHeight tall
  // Outside: vertical text footprint = lineHeight wide × charW tall (rotated 90°)
  const isCellInside = (x: number, y: number) => {
    if (!maskCellIsInside(mask!, transform, x, y, detW, detH)) return false
    for (let i = 0; i < landmarkRects.length; i++) {
      const r = landmarkRects[i]
      if (x + detW <= r.x || x >= r.x + r.w || y + detH <= r.y || y >= r.y + r.h) continue
      const imgX = ((x + detW / 2) - r.x) / r.w * landmarkMasks[i].imgW
      const imgY = ((y + detH / 2) - r.y) / r.h * landmarkMasks[i].imgH
      if (imagePixelIsOpaque(landmarkMasks[i], imgX, imgY)) return false
    }
    return true
  }
  const isCellOutside = (x: number, y: number) => maskCellIsOutside(mask!, transform, x, y, detH, detW)

  ctx.clearRect(0, 0, w, h)

  outerBoxes = []
  innerBoxes = []

  drawWordsAroundShape(ctx, isCellOutside, w, h, OUTER_WORDS, {
    font: fontSpec,
    lineHeight,
    colors: theme.textOnCanvas,
    hoveredBox: hoveredOuter ?? undefined,
    hoverRadiusX: params.outerHoverRadiusX,
    hoverRadiusY: params.outerHoverRadiusY,
    onWord: (b) => outerBoxes.push(b),
  })

  drawWordsInShape(ctx, isCellInside, w, h, INNER_WORDS, {
    font: fontSpec,
    lineHeight,
    colors: theme.textOnSurface,
    hoveredBox: hoveredInner ?? undefined,
    hoverRadiusX: params.innerHoverRadiusX,
    hoverRadiusY: params.innerHoverRadiusY,
    onWord: (b) => innerBoxes.push(b),
  })

  for (const r of landmarkRects) {
    ctx.drawImage(r.img, r.x, r.y, r.w, r.h)
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const initialFontSpec = `400 ${params.fontSize}px ${FONT_FAMILY}`
  const { minLon, maxLon, minLat, maxLat } = GEO_BOUNDS

  await document.fonts.load(initialFontSpec)

  const [loadedMask, ...loadedImgs] = await Promise.all([
    loadPngMask('/map-alpha.png'),
    ...LANDMARK_DEFS.map(def => new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = rej
      el.src = def.path
    })),
  ])

  mask = loadedMask
  landmarkImgs = loadedImgs
  landmarkMasks = loadedImgs.map(img => {
    const off = document.createElement('canvas')
    off.width = img.naturalWidth
    off.height = img.naturalHeight
    const octx = off.getContext('2d')!
    octx.drawImage(img, 0, 0)
    const { data } = octx.getImageData(0, 0, img.naturalWidth, img.naturalHeight)
    return { data, imgW: img.naturalWidth, imgH: img.naturalHeight }
  })
  landmarks = LANDMARK_DEFS.map(def => ({
    nx: (def.lon - minLon) / (maxLon - minLon),
    ny: (maxLat - def.lat) / (maxLat - minLat),
  }))

  renderFrame()
  window.addEventListener('resize', renderFrame)
}

init().catch((e: unknown) => {
  console.error(e)
  root.textContent = String(e)
})
