const FRAME_INTERVAL_MS = 500

const FRAMES = [
  '/favicon-frame-0.png',
  '/favicon-frame-1.png',
  '/favicon-frame-2.png',
  '/favicon-frame-3.png',
]

function getOrCreateIconLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/png"]')
  if (existing) return existing
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/png'
  document.head.appendChild(link)
  return link
}

/**
 * Cycles tab favicon through PNG frames. Pauses when the tab is hidden.
 */
export function startFaviconFrameCycle(): void {
  const link = getOrCreateIconLink()
  let frameIndex = 0
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = () => {
    frameIndex = (frameIndex + 1) % FRAMES.length
    link.href = `${FRAMES[frameIndex]}?f=${frameIndex}`
  }

  const start = () => {
    if (timer !== undefined) return
    timer = setInterval(tick, FRAME_INTERVAL_MS)
  }

  const stop = () => {
    if (timer === undefined) return
    clearInterval(timer)
    timer = undefined
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') start()
    else stop()
  }

  document.addEventListener('visibilitychange', onVisibility)
  onVisibility()
}
