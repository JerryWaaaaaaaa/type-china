/** Reads tokens from src/colors.css (:root) for canvas rendering. */

export type ThemeColors = {
  bgCanvas: string
  bgSurface: string
  textOnSurface: string[]
  textOnCanvas: string[]
  mapStroke: string
  mapLabelCity: string
  mapLabelNature: string
}

export function readThemeColors(): ThemeColors {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => s.getPropertyValue(name).trim()

  return {
    bgCanvas: v('--color-bg-canvas') || '#0e1220',
    bgSurface: v('--color-bg-surface') || '#ece7ed',
    textOnSurface: [
      v('--color-text-primary'),
      v('--color-text-secondary'),
      v('--color-text-tertiary'),
      v('--color-text-accent'),
      v('--color-text-accent-muted'),
      v('--color-text-link'),
    ],
    textOnCanvas: [
      v('--color-text-on-canvas-primary'),
      v('--color-text-on-canvas-secondary'),
      v('--color-text-on-canvas-accent'),
      v('--color-text-on-canvas-subtle-green'),
      v('--color-text-on-canvas-green'),
      v('--color-text-on-canvas-gold'),
      v('--color-text-on-canvas-gold-muted'),
      v('--color-text-on-canvas-gold-dark'),
    ],
    mapStroke: v('--color-map-stroke') || 'rgba(120, 60, 90, 0.55)',
    mapLabelCity: v('--color-map-label-city') || '#4a2d5c',
    mapLabelNature: v('--color-map-label-nature') || '#2d5a4a',
  }
}
