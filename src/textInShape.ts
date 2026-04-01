import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import type { Pt } from './chinaOutline'
import { intervalsAtY, outsideIntervalsAtY, subtractIntervalFromSpans } from './chinaOutline'

export type TextInShapeOptions = {
  font: string
  lineHeight: number
  chordPadding: number
  minChordCssPx: number
  /** Cycle through these for each word (global order while drawing). */
  wordColors: string[]
}

/** Axis-aligned holes for Pretext filler (e.g. geo label bounds). */
export type ExclusionRect = { left: number; right: number; top: number; bottom: number }

/** Bounding box for `fillText` at alphabetic baseline `cy`, horizontally centered on `cx`. */
export function measureLabelExclusionRect(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  cx: number,
  cy: number,
  pad: number,
): ExclusionRect {
  ctx.font = font
  const m = ctx.measureText(text)
  const w = m.width
  const asc = m.actualBoundingBoxAscent ?? 8
  const desc = m.actualBoundingBoxDescent ?? 2
  return {
    left: cx - w / 2 - pad,
    right: cx + w / 2 + pad,
    top: cy - asc - pad,
    bottom: cy + desc + pad,
  }
}


/** Draw one laid-out line with a color per word; advances `wordIndex`. */
function fillLineWordColors(
  ctx: CanvasRenderingContext2D,
  lineText: string,
  startX: number,
  y: number,
  palette: string[],
  wordIndex: { value: number },
): void {
  const words = lineText.split(/\s+/).filter(Boolean)
  if (words.length === 0 || palette.length === 0) return
  const spaceW = ctx.measureText(' ').width
  let x = startX
  for (let i = 0; i < words.length; i++) {
    if (i > 0) x += spaceW
    ctx.fillStyle = palette[wordIndex.value % palette.length]
    wordIndex.value++
    const w = words[i]
    ctx.fillText(w, x, y)
    x += ctx.measureText(w).width
  }
}

const START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

/** Fill the viewport outside the China polygon with text (one line per outside span per row). */
export function drawSurroundingText(
  ctx: CanvasRenderingContext2D,
  poly: Pt[],
  canvasW: number,
  canvasH: number,
  prepared: PreparedTextWithSegments,
  opts: TextInShapeOptions,
  exclusionRects?: ExclusionRect[],
): void {
  const { font, lineHeight, chordPadding, minChordCssPx, wordColors } = opts
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  const wordIndex = { value: 0 }

  let cursor = START_CURSOR
  let y = lineHeight * 0.85
  const yMax = canvasH - 4

  scanline: while (y < yMax) {
    let intervals = outsideIntervalsAtY(poly, y, canvasW)
    if (exclusionRects?.length) {
      for (const r of exclusionRects) {
        if (y < r.top || y > r.bottom) continue
        intervals = subtractIntervalFromSpans(intervals, r.left, r.right)
      }
    }
    const spans = intervals
      .filter((s) => s.right - s.left >= minChordCssPx)
      .sort((a, b) => a.left - b.left)
    if (spans.length === 0) {
      y += lineHeight
      continue
    }
    for (const span of spans) {
      const maxWidth = Math.max(4, span.right - span.left - chordPadding * 2)
      const line = layoutNextLine(prepared, cursor, maxWidth)
      if (!line) break scanline

      const lineW = line.width
      const x = span.left + chordPadding + Math.max(0, (maxWidth - lineW) / 2)
      fillLineWordColors(ctx, line.text, x, y, wordColors, wordIndex)
      cursor = line.end
    }
    y += lineHeight
  }
}

export function drawChinaText(
  ctx: CanvasRenderingContext2D,
  poly: Pt[],
  prepared: PreparedTextWithSegments,
  opts: TextInShapeOptions,
  exclusionRects?: ExclusionRect[],
): void {
  const { font, lineHeight, chordPadding, minChordCssPx, wordColors } = opts
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  const wordIndex = { value: 0 }

  let cursor = START_CURSOR
  let y = polyBoundsTop(poly) + lineHeight * 0.85
  const yMax = polyBoundsBottom(poly) - 4

  scanline: while (y < yMax) {
    let intervals = intervalsAtY(poly, y)
    if (exclusionRects?.length) {
      for (const r of exclusionRects) {
        if (y < r.top || y > r.bottom) continue
        intervals = subtractIntervalFromSpans(intervals, r.left, r.right)
      }
    }
    const spans = intervals
      .filter((s) => s.right - s.left >= minChordCssPx)
      .sort((a, b) => a.left - b.left)
    if (spans.length === 0) {
      y += lineHeight
      continue
    }
    for (const span of spans) {
      const maxWidth = Math.max(4, span.right - span.left - chordPadding * 2)
      const line = layoutNextLine(prepared, cursor, maxWidth)
      if (!line) break scanline

      const lineW = line.width
      const x = span.left + chordPadding + Math.max(0, (maxWidth - lineW) / 2)
      fillLineWordColors(ctx, line.text, x, y, wordColors, wordIndex)
      cursor = line.end
    }
    y += lineHeight
  }
}

function polyBoundsTop(poly: Pt[]): number {
  return poly.reduce((m, p) => Math.min(m, p.y), Infinity)
}

function polyBoundsBottom(poly: Pt[]): number {
  return poly.reduce((m, p) => Math.max(m, p.y), -Infinity)
}

export function clipToPolygon(ctx: CanvasRenderingContext2D, poly: Pt[]): void {
  if (poly.length === 0) return
  ctx.beginPath()
  ctx.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y)
  ctx.closePath()
  ctx.clip()
}

export function strokePolygon(ctx: CanvasRenderingContext2D, poly: Pt[], strokeStyle: string, lineWidth: number): void {
  if (poly.length === 0) return
  ctx.save()
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

export function fillPolygon(ctx: CanvasRenderingContext2D, poly: Pt[], fillStyle: string): void {
  if (poly.length === 0) return
  ctx.save()
  ctx.fillStyle = fillStyle
  ctx.beginPath()
  ctx.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export { prepareWithSegments }
