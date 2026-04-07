import './style.css'
import GUI from 'lil-gui'
import { drawWordsInShape, drawWordsAroundShape, type WordHitBox } from './textInShape'
import {
  type PngMask,
  type MaskTransform,
  loadPngMask,
  computeMaskTransform,
  computeBaseFittedScale,
  maskCellIsInside,
  maskCellIsOutside,
  imagePixelIsOpaque,
} from './pngMask'
import { readThemeColors } from './themeColors'
import { MAP_FILLER_TEXT, SURROUNDING_CITIES_TEXT } from './copy'
import { GEO_BOUNDS } from './mapGeo'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_FAMILY = "'Geist Mono', monospace"

type LandmarkDef = {
  path: string
  lon: number
  lat: number
  landmarkName: string
  cityName: string
}

const LANDMARK_DEFS: LandmarkDef[] = [
  // Beijing trio: nudged for map legibility (still ~correct region; linear geo stretch is coarse)
  { path: '/landmark-images/temple of heaven.png',    lon: 116.422, lat: 42.885, landmarkName: 'Temple of Heaven', cityName: 'Beijing' },
  { path: '/landmark-images/terracotta warriors.png', lon: 108.9402, lat: 34.3416, landmarkName: 'Terracotta Army', cityName: "Xi'an" },
  { path: '/landmark-images/forbidden city.png',      lon: 116.368, lat: 39.932, landmarkName: 'Forbidden City', cityName: 'Beijing' },
  { path: '/landmark-images/great wall.png',          lon: 111.975, lat: 40.395, landmarkName: 'Great Wall', cityName: 'Beijing' },
  { path: '/landmark-images/Potala Palace.png',       lon:  91.1170, lat: 29.6572, landmarkName: 'Potala Palace', cityName: 'Lhasa' },
  { path: '/landmark-images/mount everest.png',       lon:  86.9250, lat: 27.9881, landmarkName: 'Mount Everest', cityName: 'Shigatse' },
  { path: '/landmark-images/zhangjiajie.png',         lon: 110.4795, lat: 29.3162, landmarkName: 'Zhangjiajie', cityName: 'Zhangjiajie' },
  { path: '/landmark-images/gobi desert inner mongolia.png', lon: 105.2, lat: 37.8, landmarkName: 'Gobi Desert', cityName: 'Inner Mongolia' },
  { path: '/landmark-images/Jiuzhaigou Valley, Sichuan.png', lon: 103.92, lat: 33.26, landmarkName: 'Jiuzhaigou Valley', cityName: 'Ngawa' },
  { path: '/landmark-images/kunlun shan.png',          lon:  95.9, lat: 33.6, landmarkName: 'Kunlun Mountains', cityName: 'Qinghai' },
  { path: '/landmark-images/the-bund-shanghai.png',   lon: 119.492, lat: 33.243, landmarkName: 'The Bund', cityName: 'Shanghai' },
  { path: '/landmark-images/pearl tower.png',         lon: 121.4997, lat: 33.2397, landmarkName: 'Oriental Pearl Tower', cityName: 'Shanghai' },
  { path: '/landmark-images/guangzhou tower.png',     lon: 113.325, lat: 26.3, landmarkName: 'Canton Tower', cityName: 'Guangzhou' },
  { path: '/landmark-images/west-lake.png',           lon: 116.15, lat: 32.24, landmarkName: 'West Lake', cityName: 'Hangzhou' },
  { path: '/landmark-images/Mogao Caves, Dunhuang.png', lon: 94.808, lat: 40.041, landmarkName: 'Mogao Caves', cityName: 'Dunhuang' },
  { path: '/landmark-images/gulangyu-xiamen.png',     lon: 122.068, lat: 29.445, landmarkName: 'Gulangyu', cityName: 'Xiamen' },
]

// ─── Landmark State ───────────────────────────────────────────────────────────

type Landmark = { nx: number; ny: number }
type LandmarkRect = { x: number; y: number; w: number; h: number; img: HTMLImageElement; pngMask: PngMask }

let landmarks: Landmark[] = []
let landmarkImgs: HTMLImageElement[] = []
let landmarkMasks: PngMask[] = []
/** Session-random tie-break: when two rects overlap, the lower priority is dropped. */
let landmarkPriority: number[] = []

type BBox = { x: number; y: number; w: number; h: number }

function aabbOverlap(a: BBox, b: BBox): boolean {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return ox > 0 && oy > 0
}

/**
 * Largest subset of landmarks with pairwise non-overlapping screen rects.
 * Greedy “remove one of each pair” can leave a single hub that overlaps everyone
 * while many satellites don’t overlap each other — so zooming in never brought them back.
 * Brute-force over 2^n subsets is cheap for n ≤ 16.
 */
function resolveNonOverlappingLandmarkIndices(rects: LandmarkRect[], priorities: number[]): number[] {
  const n = rects.length
  if (n === 0) return []
  let bestMask = 0
  let bestCount = -1
  let bestPriSum = -1

  for (let mask = 0; mask < 1 << n; mask++) {
    let cnt = 0
    let priSum = 0
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        cnt++
        priSum += priorities[i]
      }
    }
    if (cnt < bestCount) continue

    let ok = true
    outer: for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue
      for (let j = i + 1; j < n; j++) {
        if (!(mask & (1 << j))) continue
        if (aabbOverlap(rects[i], rects[j])) {
          ok = false
          break outer
        }
      }
    }
    if (!ok) continue

    if (cnt > bestCount || (cnt === bestCount && priSum > bestPriSum)) {
      bestCount = cnt
      bestPriSum = priSum
      bestMask = mask
    }
  }

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (bestMask & (1 << i)) out.push(i)
  }
  return out.sort((a, b) => a - b)
}

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
  landmarkImgWidthPx: 120,
}

if (import.meta.env.DEV) {
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
  gui.add(params, 'landmarkImgWidthPx', 40, 200, 2).name('Landmark width (px)').onChange(renderFrame)
}

// ─── DOM Structure ────────────────────────────────────────────────────────────

const root = document.querySelector<HTMLDivElement>('#app')!

const canvas = document.createElement('canvas')
canvas.id = 'map-canvas'
canvas.setAttribute('aria-label', 'Map of China filled with text — scroll to zoom, drag to pan')
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

// ─── Pan + zoom ───────────────────────────────────────────────────────────────

let panX = 0
let panY = 0
/** Multiplier on fitted map scale (1 = full map in view). */
let zoomLevel = 1
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4

/** Last inner viewport size (for proportional pan on resize). */
let storedInnerW = 0
let storedInnerH = 0

let wheelRaf = 0

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

function applyWheelZoom(clientX: number, clientY: number, deltaY: number): void {
  if (!mask) return
  const w = lastW
  const h = lastH
  if (w <= 0 || h <= 0) return
  const pad = params.mapPadding
  const innerW = w - pad * 2
  const innerH = h - pad * 2
  const base = computeBaseFittedScale(mask.imgW, mask.imgH, w, h, pad)
  const t = computeMaskTransform(mask.imgW, mask.imgH, w, h, pad, panX, panY, zoomLevel)
  const scaleBefore = t.scale
  const px = (clientX - t.offsetX) / scaleBefore
  const py = (clientY - t.offsetY) / scaleBefore
  const factor = Math.exp(-deltaY * 0.001)
  zoomLevel = clampZoom(zoomLevel * factor)
  const scaleAfter = base * zoomLevel
  panX = clientX - px * scaleAfter - (pad + (innerW - mask.imgW * scaleAfter) / 2)
  panY = clientY - py * scaleAfter - (pad + (innerH - mask.imgH * scaleAfter) / 2)
}

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    applyWheelZoom(e.clientX, e.clientY, e.deltaY)
    if (!wheelRaf) {
      wheelRaf = requestAnimationFrame(() => {
        wheelRaf = 0
        renderFrame()
      })
    }
  },
  { passive: false },
)

// ─── Hover ────────────────────────────────────────────────────────────────────

let innerBoxes: WordHitBox[] = []
let outerBoxes: WordHitBox[] = []
let hoveredInner: WordHitBox | null = null
let hoveredOuter: WordHitBox | null = null
let lastPointerX = 0
let lastPointerY = 0
let hoveredLandmarkIdx: number | null = null

type PanState = {
  pid: number
  startCX: number
  startCY: number
  startPX: number
  startPY: number
} | null

let panState: PanState = null
let panRaf = 0

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
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
  hoveredLandmarkIdx = null
})

canvas.addEventListener('pointermove', (e) => {
  if (panState && panState.pid === e.pointerId) {
    panX = panState.startPX + (e.clientX - panState.startCX)
    panY = panState.startPY + (e.clientY - panState.startCY)
    if (!panRaf) {
      panRaf = requestAnimationFrame(() => {
        panRaf = 0
        renderFrame()
      })
    }
    return
  }
  if (panState) return
  const prevX = lastPointerX
  const prevY = lastPointerY
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  const mx = e.clientX
  const my = e.clientY
  const hitBox = (boxes: WordHitBox[]) =>
    boxes.find(b => mx >= b.x && mx < b.x + b.w && my >= b.y && my < b.y + b.h)
  const ni = hitBox(innerBoxes) ?? null
  const no = hitBox(outerBoxes) ?? null
  const lm = hitTestLandmark(mx, my)
  const wordChanged =
    ni?.wordIdx !== hoveredInner?.wordIdx || no?.wordIdx !== hoveredOuter?.wordIdx
  const lmChanged = lm !== hoveredLandmarkIdx
  const pointerMoved = mx !== prevX || my !== prevY
  if (wordChanged) {
    hoveredInner = ni
    hoveredOuter = no
  }
  if (lmChanged) hoveredLandmarkIdx = lm
  if (wordChanged || lmChanged || (hoveredLandmarkIdx !== null && pointerMoved)) {
    renderFrame()
  }
})

const endPan = (e: PointerEvent): void => {
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

// ─── PNG Mask ─────────────────────────────────────────────────────────────────

let mask: PngMask | null = null

function computeTentativeRectsAndKeepIdx(
  m: PngMask,
  w: number,
  h: number,
  mapPadding: number,
): { tentativeRects: LandmarkRect[]; keepIdx: number[]; transform: MaskTransform } {
  const transform = computeMaskTransform(m.imgW, m.imgH, w, h, mapPadding, panX, panY, zoomLevel)
  const mapLeft = transform.offsetX
  const mapTop = transform.offsetY
  const mapRight = transform.offsetX + m.imgW * transform.scale
  const mapBottom = transform.offsetY + m.imgH * transform.scale
  const clampRect = (r: LandmarkRect): void => {
    r.x = Math.max(mapLeft, Math.min(mapRight - r.w, r.x))
    r.y = Math.max(mapTop, Math.min(mapBottom - r.h, r.y))
  }
  const rw = params.landmarkImgWidthPx
  const tentativeRects: LandmarkRect[] = landmarks.map((lm, i) => {
    const img = landmarkImgs[i]
    const pngMask = landmarkMasks[i]
    const cx = lm.nx * m.imgW * transform.scale + transform.offsetX
    const cy = lm.ny * m.imgH * transform.scale + transform.offsetY
    const rh = rw * (img.naturalHeight / img.naturalWidth)
    const r: LandmarkRect = { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh, img, pngMask }
    clampRect(r)
    return r
  })
  const keepIdx = resolveNonOverlappingLandmarkIndices(tentativeRects, landmarkPriority)
  return { tentativeRects, keepIdx, transform }
}

function hitTestLandmark(clientX: number, clientY: number): number | null {
  if (!mask) return null
  const w = lastW > 0 ? lastW : window.innerWidth
  const h = lastH > 0 ? lastH : window.innerHeight
  const { tentativeRects, keepIdx } = computeTentativeRectsAndKeepIdx(mask, w, h, params.mapPadding)
  for (let k = keepIdx.length - 1; k >= 0; k--) {
    const i = keepIdx[k]
    const r = tentativeRects[i]
    if (clientX >= r.x && clientX < r.x + r.w && clientY >= r.y && clientY < r.y + r.h) return i
  }
  return null
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderFrame(): void {
  if (!mask) return
  const theme = readThemeColors()
  const { w, h } = sizeCanvas()
  const { fontSize, lineHeight, mapPadding, charWScale, lineHeightScale } = params
  const fontSpec = `400 ${fontSize}px ${FONT_FAMILY}`

  const innerW = w - mapPadding * 2
  const innerH = h - mapPadding * 2
  if (storedInnerW > 0 && storedInnerH > 0 && (innerW !== storedInnerW || innerH !== storedInnerH)) {
    panX *= innerW / storedInnerW
    panY *= innerH / storedInnerH
  }
  storedInnerW = innerW
  storedInnerH = innerH

  // Measure charW from the actual rendered font so detection stays in sync with rendering
  ctx.font = fontSpec
  const charW = ctx.measureText('M').width
  const detW = charW * charWScale
  const detH = lineHeight * lineHeightScale

  const { tentativeRects, keepIdx, transform } = computeTentativeRectsAndKeepIdx(
    mask,
    w,
    h,
    mapPadding,
  )

  // Inside: horizontal text footprint = charW wide × lineHeight tall
  // Outside: vertical text footprint = lineHeight wide × charW tall (rotated 90°)
  const isCellInside = (x: number, y: number) => {
    if (!maskCellIsInside(mask!, transform, x, y, detW, detH)) return false
    for (const i of keepIdx) {
      const r = tentativeRects[i]
      if (x + detW <= r.x || x >= r.x + r.w || y + detH <= r.y || y >= r.y + r.h) continue
      const pm = r.pngMask
      const imgX = ((x + detW / 2) - r.x) / r.w * pm.imgW
      const imgY = ((y + detH / 2) - r.y) / r.h * pm.imgH
      if (imagePixelIsOpaque(pm, imgX, imgY)) return false
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

  for (const i of keepIdx) {
    const r = tentativeRects[i]
    ctx.drawImage(r.img, r.x, r.y, r.w, r.h)
  }

  if (hoveredLandmarkIdx !== null) {
    const def = LANDMARK_DEFS[hoveredLandmarkIdx]
    const label = `${def.landmarkName}, ${def.cityName}`.toUpperCase()
    ctx.save()
    ctx.font = fontSpec
    ctx.textBaseline = 'middle'
    const padX = 2
    const padTop = 2
    const padBottom = 0
    const tw = ctx.measureText(label).width + padX * 2
    const th = lineHeight + padTop + padBottom
    let bx = lastPointerX + 12
    let by = lastPointerY - th - 12
    bx = Math.max(0, Math.min(bx, w - tw))
    by = Math.max(0, Math.min(by, h - th))
    ctx.fillStyle = '#356CA9'
    const rr = 0
    ctx.beginPath()
    if ('roundRect' in ctx && typeof ctx.roundRect === 'function') {
      ctx.roundRect(bx, by, tw, th, rr)
    } else {
      ctx.rect(bx, by, tw, th)
    }
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, bx + padX, by + padTop + lineHeight / 2)
    ctx.restore()
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
  landmarkPriority = LANDMARK_DEFS.map(() => Math.random())

  renderFrame()
  window.addEventListener('resize', renderFrame)
}

init().catch((e: unknown) => {
  console.error(e)
  root.textContent = String(e)
})
