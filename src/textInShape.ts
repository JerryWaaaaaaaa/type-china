import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import type { Pt } from './chinaOutline'
import { intervalsAtY } from './chinaOutline'

export type TextInShapeOptions = {
  font: string
  lineHeight: number
  chordPadding: number
  minChordCssPx: number
  textFillStyle: string
}

const START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

export function drawChinaText(
  ctx: CanvasRenderingContext2D,
  poly: Pt[],
  prepared: PreparedTextWithSegments,
  opts: TextInShapeOptions,
): void {
  const { font, lineHeight, chordPadding, minChordCssPx, textFillStyle } = opts
  ctx.font = font
  ctx.fillStyle = textFillStyle
  ctx.textBaseline = 'alphabetic'

  let cursor = START_CURSOR
  let y = polyBoundsTop(poly) + lineHeight * 0.85
  const yMax = polyBoundsBottom(poly) - 4

  scanline: while (y < yMax) {
    const intervals = intervalsAtY(poly, y)
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
      ctx.fillText(line.text, x, y)
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
