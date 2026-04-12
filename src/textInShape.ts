import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext'
import { subtractIntervalFromSpans, type Interval, type Pt } from './chinaOutline'

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

/** Fill the viewport outside the shape with text (one line per outside span per row). */
export function drawSurroundingText(
  ctx: CanvasRenderingContext2D,
  outsideAtY: (y: number) => Interval[],
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
    let intervals = outsideAtY(y)
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

/**
 * Fill the viewport outside the shape with text rendered in vertical columns (rotated 90° CW).
 * Scans left→right by column (step = lineHeight). At each x, finds y-spans outside the shape
 * via `outsideAtX`, then draws a laid-out line rotated so it reads top-to-bottom.
 * Per-word colour cycling is preserved by drawing in a rotated context.
 */
export function drawSurroundingTextVertical(
  ctx: CanvasRenderingContext2D,
  outsideAtX: (x: number) => Interval[],
  canvasW: number,
  prepared: PreparedTextWithSegments,
  opts: TextInShapeOptions,
): void {
  const { font, lineHeight, chordPadding, minChordCssPx, wordColors } = opts
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  const wordIndex = { value: 0 }

  let cursor = START_CURSOR
  // Start first column at lineHeight * 0.85 from left (same rhythm as drawChinaText's y-start)
  let x = lineHeight * 0.85
  const xMax = canvasW

  // Baseline offset inside the column: place baseline at 75% of lineHeight so
  // cap-height ascenders stay within the column width.
  const baselineOffset = lineHeight * 0.75

  scanline: while (x < xMax) {
    const intervals = outsideAtX(x)
    const spans = intervals
      .filter((s) => s.right - s.left >= minChordCssPx)
      .sort((a, b) => a.left - b.left)

    if (spans.length === 0) {
      x += lineHeight
      continue
    }

    for (const span of spans) {
      const maxHeight = Math.max(4, span.right - span.left - chordPadding * 2)
      const line = layoutNextLine(prepared, cursor, maxHeight)
      if (!line) break scanline

      // Centre the text within the span
      const yStart = span.left + chordPadding + Math.max(0, (maxHeight - line.width) / 2)

      // Rotate 90° CW so horizontal text appears as a top-to-bottom column.
      // translate to (x + baselineOffset, yStart): baseline lands at x + baselineOffset,
      // characters ascend leftward within the column.
      ctx.save()
      ctx.translate(x + baselineOffset, yStart)
      ctx.rotate(Math.PI / 2)
      fillLineWordColors(ctx, line.text, 0, 0, wordColors, wordIndex)
      ctx.restore()

      cursor = line.end
    }
    x += lineHeight
  }
}

export function drawChinaText(
  ctx: CanvasRenderingContext2D,
  insideAtY: (y: number) => Interval[],
  yMin: number,
  yMax: number,
  prepared: PreparedTextWithSegments,
  opts: TextInShapeOptions,
  exclusionRects?: ExclusionRect[],
): void {
  const { font, lineHeight, chordPadding, minChordCssPx, wordColors } = opts
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  const wordIndex = { value: 0 }

  let cursor = START_CURSOR
  let y = yMin + lineHeight * 0.85

  scanline: while (y < yMax - 4) {
    let intervals = insideAtY(y)
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

export type WordHitBox = {
  wordIdx: number
  x: number
  y: number
  w: number
  h: number
  color: string
}

export type WordFillOptions = {
  font: string
  lineHeight: number
  colors: string[]
  hoveredBox?: WordHitBox
  hoverRadiusX?: number
  hoverRadiusY?: number
  onWord?: (box: WordHitBox) => void
}

/**
 * Fill the shape with horizontal words, row by row.
 * Uses a 2D cell checker: each character position (x, y) is only filled if
 * `isCellActive(x, y)` returns true (the cell's full pixel block is inside).
 * Words are truncated at span edges; color cycles once per word.
 */
export function drawWordsInShape(
  ctx: CanvasRenderingContext2D,
  isCellActive: (x: number, y: number) => boolean,
  canvasW: number,
  canvasH: number,
  words: string[],
  opts: WordFillOptions,
): void {
  const { font, lineHeight, colors, hoveredBox, hoverRadiusX, hoverRadiusY, onWord } = opts
  const rx = hoverRadiusX ?? 0
  const ry = hoverRadiusY ?? 0
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  const charW = ctx.measureText('M').width

  let wordIdx = 0
  let rowY = 0

  while (rowY + lineHeight <= canvasH) {
    const drawY = rowY + lineHeight * 0.85
    let spanStart: number | null = null

    for (let x = 0; x <= canvasW + charW; x += charW) {
      const active = x < canvasW && isCellActive(x, rowY)
      if (active && spanStart === null) {
        spanStart = x
      } else if (!active && spanStart !== null) {
        let cx = spanStart
        while (cx < x) {
          const maxLetters = Math.floor((x - cx) / charW)
          if (maxLetters <= 0) break
          const letters = words[wordIdx % words.length].slice(0, maxLetters)
          const color = colors[(wordIdx * 2654435761 >>> 0) % colors.length]
          const wordW = letters.length * charW
          onWord?.({ wordIdx, x: cx, y: rowY, w: wordW, h: lineHeight, color })
          const isHovered = hoveredBox !== undefined && (
            Math.abs((cx + wordW / 2) - (hoveredBox.x + hoveredBox.w / 2)) <= rx * charW &&
            Math.abs((rowY + lineHeight / 2) - (hoveredBox.y + hoveredBox.h / 2)) <= ry * lineHeight
          )
          if (isHovered) {
            ctx.fillStyle = color
            ctx.fillRect(cx, rowY, wordW, lineHeight)
            ctx.fillStyle = 'white'
          } else {
            ctx.fillStyle = color
          }
          ctx.fillText(letters, cx, drawY)
          cx += wordW
          wordIdx++
        }
        spanStart = null
      }
    }
    rowY += lineHeight
  }
}

/**
 * Fill the outside of the shape with vertical words (rotated 90° CW, reading
 * top-to-bottom), column by column left-to-right.
 * Uses a 2D cell checker: each character position (colX, y) is only filled if
 * `isCellActive(colX, y)` returns true (the cell's full pixel block is outside).
 * Words are truncated at span edges; color cycles once per word.
 */
export function drawWordsAroundShape(
  ctx: CanvasRenderingContext2D,
  isCellActive: (x: number, y: number) => boolean,
  canvasW: number,
  canvasH: number,
  words: string[],
  opts: WordFillOptions,
): void {
  const { font, lineHeight, colors, hoveredBox, hoverRadiusX, hoverRadiusY, onWord } = opts
  const rx = hoverRadiusX ?? 0
  const ry = hoverRadiusY ?? 0
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  const charW = ctx.measureText('M').width
  const baselineOffset = lineHeight * 0.75

  let wordIdx = 0
  // Start columns flush left; was lineHeight * 0.85 and left a visible empty strip.
  let colX = -lineHeight * 0.5

  while (colX < canvasW) {
    let spanStart: number | null = null

    for (let y = 0; y <= canvasH + charW; y += charW) {
      const active = y < canvasH && isCellActive(colX, y)
      if (active && spanStart === null) {
        spanStart = y
      } else if (!active && spanStart !== null) {
        let cy = spanStart
        while (cy < y) {
          const maxLetters = Math.floor((y - cy) / charW)
          if (maxLetters <= 0) break
          const letters = words[wordIdx % words.length].slice(0, maxLetters)
          const color = colors[(wordIdx * 2654435761 >>> 0) % colors.length]
          const wordH = letters.length * charW
          onWord?.({ wordIdx, x: colX, y: cy, w: lineHeight, h: wordH, color })
          const isHovered = hoveredBox !== undefined && (
            Math.abs((colX + lineHeight / 2) - (hoveredBox.x + hoveredBox.w / 2)) <= rx * lineHeight &&
            Math.abs((cy + wordH / 2) - (hoveredBox.y + hoveredBox.h / 2)) <= ry * charW
          )
          ctx.save()
          ctx.translate(colX + baselineOffset, cy)
          ctx.rotate(Math.PI / 2)
          if (isHovered) {
            ctx.fillStyle = color
            ctx.fillRect(0, -lineHeight * 0.85, wordH, lineHeight)
            ctx.fillStyle = 'white'
          } else {
            ctx.fillStyle = color
          }
          ctx.fillText(letters, 0, 0)
          ctx.restore()
          cy += wordH
          wordIdx++
        }
        spanStart = null
      }
    }
    colX += lineHeight
  }
}
