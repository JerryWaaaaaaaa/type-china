import type { Pt } from './chinaOutline'
import { fitPointsToCanvas, intervalsAtY } from './chinaOutline'

/** Geographic reference box (approx. China mainland) for linear lon/lat → outline placement. */
export const GEO_BOUNDS = {
  minLon: 73.5,
  maxLon: 134.8,
  minLat: 18.0,
  maxLat: 53.6,
} as const

export type GeoBounds = typeof GEO_BOUNDS

/** Wider box (China + neighbors) for labels outside the silhouette, mapped to viewport. */
export const GEO_BOUNDS_VIEW = {
  minLon: 64,
  maxLon: 148,
  minLat: 8,
  maxLat: 56,
} as const

export type GeoBoundsView = typeof GEO_BOUNDS_VIEW

export type OutlineBBox = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function outlineBBoxFromPoints(poly: Pt[]): OutlineBBox {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Map lon/lat into the outline’s axis-aligned bounding box (Y-down, same as canvas).
 * Linear stretch; silhouette and geography are only loosely aligned.
 */
export function lonLatToOutlinePx(lon: number, lat: number, geo: GeoBounds, outline: OutlineBBox): Pt {
  const lonR = geo.maxLon - geo.minLon || 1
  const latR = geo.maxLat - geo.minLat || 1
  const w = outline.maxX - outline.minX
  const h = outline.maxY - outline.minY
  return {
    x: outline.minX + ((lon - geo.minLon) / lonR) * w,
    y: outline.minY + ((geo.maxLat - lat) / latR) * h,
  }
}

/** Linear geographic normalization in [0, 1]² (Y-down: north = smaller ny). */
export function lonLatToNormInBounds(
  lon: number,
  lat: number,
  geo: { minLon: number; maxLon: number; minLat: number; maxLat: number },
): { nx: number; ny: number } {
  const lonR = geo.maxLon - geo.minLon || 1
  const latR = geo.maxLat - geo.minLat || 1
  return {
    nx: (lon - geo.minLon) / lonR,
    ny: (geo.maxLat - lat) / latR,
  }
}

/**
 * Place a label using the same transform as outline vertices: raw SVG bbox × geo-normalized
 * point → `fitPointsToCanvas` (not the smoothed polygon bbox).
 */
export function normGeoToFittedCanvas(
  nx: number,
  ny: number,
  rawOutlineFromSvg: Pt[],
  canvasCssW: number,
  canvasCssH: number,
  padding: number,
): Pt {
  if (rawOutlineFromSvg.length === 0) return { x: 0, y: 0 }
  const bb = outlineBBoxFromPoints(rawOutlineFromSvg)
  const w = bb.maxX - bb.minX || 1
  const h = bb.maxY - bb.minY || 1
  const ptRaw: Pt = {
    x: bb.minX + nx * w,
    y: bb.minY + ny * h,
  }
  return fitPointsToCanvas([ptRaw], canvasCssW, canvasCssH, padding)[0]
}

/** Stretch geo bounds to the full padded viewport (no letterboxing). For outside labels. */
export function viewportNormLonLatToPx(
  lon: number,
  lat: number,
  geo: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  canvasCssW: number,
  canvasCssH: number,
  padding: number,
): Pt {
  const { nx, ny } = lonLatToNormInBounds(lon, lat, geo)
  const innerW = canvasCssW - padding * 2
  const innerH = canvasCssH - padding * 2
  return {
    x: padding + nx * innerW,
    y: padding + ny * innerH,
  }
}

function polyCentroid(poly: Pt[]): Pt {
  let sx = 0,
    sy = 0
  const n = poly.length
  if (n === 0) return { x: 0, y: 0 }
  for (const p of poly) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / n, y: sy / n }
}

/**
 * If the anchor lies outside the smoothed polygon (Chaikin vs fit), lerp toward centroid until inside.
 */
export function snapAnchorIntoPolygon(poly: Pt[], x: number, y: number, maxSteps = 36): Pt {
  if (pointInPolygonHorizontal(poly, x, y)) return { x, y }
  const c = polyCentroid(poly)
  let px = x,
    py = y
  for (let i = 0; i < maxSteps; i++) {
    px = px + (c.x - px) * 0.12
    py = py + (c.y - py) * 0.12
    if (pointInPolygonHorizontal(poly, px, py)) return { x: px, y: py }
  }
  return { x: px, y: py }
}

/** Push anchor outward if it landed inside the silhouette (for “outside” labels). */
export function nudgeAnchorOutsidePolygon(poly: Pt[], x: number, y: number, maxSteps = 40): Pt {
  if (!pointInPolygonHorizontal(poly, x, y)) return { x, y }
  const c = polyCentroid(poly)
  let px = x,
    py = y
  for (let i = 0; i < maxSteps; i++) {
    px = px + (px - c.x) * 0.1
    py = py + (py - c.y) * 0.1
    if (!pointInPolygonHorizontal(poly, px, py)) return { x: px, y: py }
  }
  return { x: px, y: py }
}

/** True if (x,y) lies inside the polygon (horizontal ray test via scanline intervals). */
export function pointInPolygonHorizontal(poly: Pt[], x: number, y: number): boolean {
  const intervals = intervalsAtY(poly, y)
  for (const iv of intervals) {
    if (x >= iv.left && x <= iv.right) return true
  }
  return false
}
