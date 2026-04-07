# Next Steps

## Image sizing
- **Change default aspect ratio** — current default `imgSizeRatio: 0.12` may need tuning once more images are added; consider also exposing a per-image override rather than a single global ratio

## Content
- **Produce more landmark images** — add more cut-out PNGs to `public/landmark-images/` and register them in the `LANDMARK_DEFS` array in `src/main.ts` with their lon/lat coordinates

## Interaction
- **Remove drag, pin images to geo-location** — strip `ImageDragState`, `imageDragState`, and the related pointer event logic; positions become fully derived from `LANDMARK_DEFS` coordinates every frame with no mutable `nx/ny` state
- **Zoom in/out — "the more you zoom, the more you know"** — add pinch/scroll zoom so that zooming in reveals progressively more text (smaller font, tighter line height, or more text layers); the metaphor is discovery: the closer you look at China, the more detail and knowledge surfaces. Implementation ideas:
  - Track a `zoomLevel` scalar (e.g. 1×–8×) driven by wheel and pinch-gesture events
  - Scale `fontSize` and/or `lineHeight` inversely with zoom so more characters fit as you zoom in
  - Optionally tier the visible text: at low zoom show only major place names; at high zoom reveal finer-grained content from `MAP_FILLER_TEXT`

## Visual quality
- **Better image with more flexible outline** — current alpha-threshold check (`> 128`) gives a hard pixel-grid edge; options:
  - Lower the threshold (e.g. `> 32`) to let semi-transparent edge pixels let text through, softening the wrap boundary
  - Pre-process images to expand/erode the alpha mask by a few pixels for a looser or tighter hug
  - Sample multiple points per cell (corners + center) instead of just the center for a more accurate per-character exclusion shape
