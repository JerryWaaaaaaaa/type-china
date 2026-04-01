/** GeoJSON lon/lat ring → canvas points + scanline intervals for text layout. */

export type Pt = { x: number; y: number }

export type LonLat = [number, number]

export type Interval = { left: number; right: number }

type GeoMultiPolygon = {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}

type GeoFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{ geometry: GeoMultiPolygon }>
}

function ringAreaLonLat(ring: LonLat[]): number {
  let sum = 0
  const n = ring.length
  if (n < 3) return 0
  const last = ring[n - 1][0] === ring[0][0] && ring[n - 1][1] === ring[0][1] ? n - 1 : n
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % last
    sum += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
  }
  return Math.abs(sum / 2)
}

function openRing(ring: LonLat[]): LonLat[] {
  if (ring.length < 2) return ring
  const a = ring[0]
  const b = ring[ring.length - 1]
  if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1)
  return ring
}

/** Pick the outer ring with the largest planar area (main landmass vs small islands). */
export function largestOuterRing(geo: GeoFeatureCollection): LonLat[] {
  let best: LonLat[] | null = null
  let bestArea = -1
  for (const f of geo.features) {
    const { coordinates } = f.geometry
    for (const polygon of coordinates) {
      const outer = polygon[0] as LonLat[]
      if (!outer?.length) continue
      const area = ringAreaLonLat(outer)
      if (area > bestArea) {
        bestArea = area
        best = outer
      }
    }
  }
  if (!best) throw new Error('No polygon rings in GeoJSON')
  return openRing(best)
}

export function ringBounds(ring: LonLat[]): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  return { minLon, maxLon, minLat, maxLat }
}

/** Project geographic ring to canvas coordinates; Y increases downward. */
export function projectRingToCanvas(
  ring: LonLat[],
  canvasCssW: number,
  canvasCssH: number,
  padding: number,
): { points: Pt[]; bounds: { minX: number; maxX: number; minY: number; maxY: number } } {
  const { minLon, maxLon, minLat, maxLat } = ringBounds(ring)
  const lonR = maxLon - minLon || 1
  const latR = maxLat - minLat || 1
  const innerW = canvasCssW - padding * 2
  const innerH = canvasCssH - padding * 2
  const scale = Math.min(innerW / lonR, innerH / latR)
  const w = lonR * scale
  const h = latR * scale
  const offX = padding + (innerW - w) / 2
  const offY = padding + (innerH - h) / 2

  const points: Pt[] = ring.map(([lon, lat]) => ({
    x: offX + (lon - minLon) * scale,
    y: offY + (maxLat - lat) * scale,
  }))

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { points, bounds: { minX, maxX, minY, maxY } }
}

/**
 * Uniform scale + center arbitrary outline points (e.g. from SVG) into the canvas.
 * Y axis matches SVG/canvas (down). `padding` is inset from each viewport edge — tune in the app UI (Map tuning panel).
 */
export function fitPointsToCanvas(pts: Pt[], canvasCssW: number, canvasCssH: number, padding: number): Pt[] {
  if (pts.length === 0) return []
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const innerW = canvasCssW - padding * 2
  const innerH = canvasCssH - padding * 2
  const scale = Math.min(innerW / w, innerH / h)
  const offX = padding + (innerW - w * scale) / 2
  const offY = padding + (innerH - h * scale) / 2
  return pts.map((p) => ({
    x: offX + (p.x - minX) * scale,
    y: offY + (p.y - minY) * scale,
  }))
}

/**
 * Chaikin corner-cutting for a closed ring: softens sharp corners without changing the overall silhouette much.
 * More iterations = smoother (and slightly more area shrink). Use 1–3 for a subtly rounded outline.
 */
export function smoothClosedPolygon(poly: Pt[], iterations: number): Pt[] {
  if (poly.length < 3 || iterations <= 0) return poly
  let pts = poly
  for (let k = 0; k < iterations; k++) {
    const n = pts.length
    const next: Pt[] = []
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % n]
      next.push({
        x: 0.75 * p.x + 0.25 * q.x,
        y: 0.75 * p.y + 0.25 * q.y,
      })
      next.push({
        x: 0.25 * p.x + 0.75 * q.x,
        y: 0.25 * p.y + 0.75 * q.y,
      })
    }
    pts = next
  }
  return pts
}

function dedupeSorted(xs: number[], eps = 1e-4): number[] {
  const out: number[] = []
  for (const x of xs) {
    if (out.length && Math.abs(out[out.length - 1] - x) < eps) continue
    out.push(x)
  }
  return out
}

/** Horizontal scanline intersections → inside intervals (non-convex simple polygons). */
export function intervalsAtY(poly: Pt[], y: number): Interval[] {
  const n = poly.length
  if (n < 3) return []
  const xs: number[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const yi = a.y
    const yj = b.y
    if (Math.abs(yi - yj) < 1e-9) continue
    if ((yi < y) === (yj < y)) continue
    const x = a.x + ((y - yi) * (b.x - a.x)) / (yj - yi)
    xs.push(x)
  }
  xs.sort((u, v) => u - v)
  const clean = dedupeSorted(xs)
  const out: Interval[] = []
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const left = clean[i]
    const right = clean[i + 1]
    if (right > left) out.push({ left, right })
  }
  return out
}

export function widestInterval(intervals: Interval[]): Interval | null {
  if (intervals.length === 0) return null
  return intervals.reduce((a, b) => (b.right - b.left > a.right - a.left ? b : a))
}

/** Remove `[blockL, blockR]` from each span (1D interval subtraction). */
export function subtractIntervalFromSpans(spans: Interval[], blockL: number, blockR: number): Interval[] {
  const out: Interval[] = []
  for (const iv of spans) {
    if (blockR <= iv.left || blockL >= iv.right) {
      out.push(iv)
      continue
    }
    if (blockL > iv.left) out.push({ left: iv.left, right: Math.min(iv.right, blockL) })
    if (blockR < iv.right) out.push({ left: Math.max(iv.left, blockR), right: iv.right })
  }
  return out.filter((s) => s.right - s.left > 0.5)
}

/** Horizontal spans outside the polygon: complement of inside intervals within [0, canvasW]. */
export function outsideIntervalsAtY(poly: Pt[], y: number, canvasW: number): Interval[] {
  const inside = intervalsAtY(poly, y)
  if (inside.length === 0) return [{ left: 0, right: canvasW }]
  const sorted = [...inside].sort((a, b) => a.left - b.left)
  const out: Interval[] = []
  let x = 0
  for (const seg of sorted) {
    if (seg.left > x) out.push({ left: x, right: Math.min(seg.left, canvasW) })
    x = Math.max(x, seg.right)
  }
  if (x < canvasW) out.push({ left: x, right: canvasW })
  return out.filter((s) => s.right - s.left > 0.5)
}

export async function loadChinaGeoJson(url = '/china.geojson'): Promise<GeoFeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
  return res.json() as Promise<GeoFeatureCollection>
}
