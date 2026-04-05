import type { Interval } from './chinaOutline'

export type { Interval }

export type PngMask = {
  data: Uint8ClampedArray
  imgW: number
  imgH: number
}

export type MaskTransform = {
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * Load a PNG from `url`, draw it to an offscreen canvas, and extract raw RGBA
 * pixel data. Black pixels (R < 128) represent the inside of the shape.
 */
export async function loadPngMask(url: string): Promise<PngMask> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = url
  })

  const offscreen = document.createElement('canvas')
  offscreen.width = img.naturalWidth
  offscreen.height = img.naturalHeight
  const octx = offscreen.getContext('2d')!
  octx.drawImage(img, 0, 0)

  const { data } = octx.getImageData(0, 0, img.naturalWidth, img.naturalHeight)
  return { data, imgW: img.naturalWidth, imgH: img.naturalHeight }
}

/**
 * Compute the scale + offset that maps the PNG image into the viewport with
 * uniform padding on all sides (same aspect-ratio-fit logic as the old
 * `fitPointsToCanvas`). `panX`/`panY` are folded into the offsets so that a
 * screen coordinate `(sx, sy)` maps to PNG coordinate:
 *
 *   px = (sx - transform.offsetX) / transform.scale
 *   py = (sy - transform.offsetY) / transform.scale
 */
export function computeMaskTransform(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
  padding: number,
  panX: number,
  panY: number,
): MaskTransform {
  const innerW = viewW - padding * 2
  const innerH = viewH - padding * 2
  const scale = Math.min(innerW / imgW, innerH / imgH)
  const baseOffsetX = padding + (innerW - imgW * scale) / 2
  const baseOffsetY = padding + (innerH - imgH * scale) / 2
  return {
    scale,
    offsetX: baseOffsetX + panX,
    offsetY: baseOffsetY + panY,
  }
}

/**
 * Returns true if every pixel in the cell [cellX, cellX+cellW) × [cellY, cellY+cellH)
 * is inside (black). Exits as soon as any white pixel is found.
 */
export function maskCellIsInside(
  mask: PngMask,
  t: MaskTransform,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): boolean {
  for (let dy = 0; dy < cellH; dy++) {
    for (let dx = 0; dx < cellW; dx++) {
      if (!isInside(mask, t, cellX + dx, cellY + dy)) return false
    }
  }
  return true
}

/**
 * Returns true if every pixel in the cell is outside (white).
 * Exits as soon as any black pixel is found.
 */
export function maskCellIsOutside(
  mask: PngMask,
  t: MaskTransform,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): boolean {
  for (let dy = 0; dy < cellH; dy++) {
    for (let dx = 0; dx < cellW; dx++) {
      if (isInside(mask, t, cellX + dx, cellY + dy)) return false
    }
  }
  return true
}

/** True when the screen coordinate (sx, sy) falls on a black pixel of the PNG. */
export function maskIsInside(mask: PngMask, t: MaskTransform, sx: number, sy: number): boolean {
  return isInside(mask, t, sx, sy)
}

function isInside(mask: PngMask, t: MaskTransform, sx: number, sy: number): boolean {
  const px = Math.round((sx - t.offsetX) / t.scale)
  const py = Math.round((sy - t.offsetY) / t.scale)
  if (px < 0 || px >= mask.imgW || py < 0 || py >= mask.imgH) return false
  return mask.data[(py * mask.imgW + px) * 4] < 128
}

/**
 * Scan a horizontal row at screen-y `screenY` and return the spans of
 * consecutive pixels that are inside the mask (black pixels).
 */
export function maskIntervalsAtY(
  mask: PngMask,
  transform: MaskTransform,
  screenY: number,
  canvasW: number,
): Interval[] {
  const out: Interval[] = []
  let start: number | null = null
  for (let x = 0; x <= canvasW; x++) {
    const inside = isInside(mask, transform, x, screenY)
    if (inside && start === null) {
      start = x
    } else if (!inside && start !== null) {
      out.push({ left: start, right: x })
      start = null
    }
  }
  if (start !== null) out.push({ left: start, right: canvasW })
  return out
}

/**
 * Scan a vertical column at screen-x `screenX` and return the spans of
 * consecutive pixels that are OUTSIDE the mask (white pixels). Used by
 * the vertical surrounding-text renderer.
 */
export function maskOutsideIntervalsAtX(
  mask: PngMask,
  transform: MaskTransform,
  screenX: number,
  canvasH: number,
  columnWidth = 0,
): Interval[] {
  const out: Interval[] = []
  let start: number | null = null
  for (let y = 0; y <= canvasH; y++) {
    const outside = !isInside(mask, transform, screenX, y) &&
                    (columnWidth <= 0 || !isInside(mask, transform, screenX + columnWidth, y))
    if (outside && start === null) {
      start = y
    } else if (!outside && start !== null) {
      out.push({ left: start, right: y })
      start = null
    }
  }
  if (start !== null) out.push({ left: start, right: canvasH })
  return out
}
