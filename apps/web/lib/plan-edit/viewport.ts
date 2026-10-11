// Zoom and pan for the plan stage. The drawing is transformed with
// `translate(pan) scale(zoom)` about the stage's centre, so a point p (px from
// the centre, unzoomed) appears at pan + zoom·p.

export interface PlanViewport {
  zoom: number
  /** Screen-pixel offset of the drawing from the stage centre. */
  pan: readonly [number, number]
}

export const FIT_VIEWPORT: PlanViewport = { zoom: 1, pan: [0, 0] }
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 6
/** One zoom-button press. */
export const ZOOM_STEP = 1.25

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/**
 * Zooms by `factor`, keeping the screen point `focus` (px from the stage
 * centre) still — the point under the cursor stays under the cursor.
 */
export function zoomAt(
  viewport: PlanViewport,
  factor: number,
  focus: readonly [number, number] = [0, 0]
): PlanViewport {
  const zoom = clampZoom(viewport.zoom * factor)
  const ratio = zoom / viewport.zoom
  return {
    zoom,
    pan: [
      focus[0] - ratio * (focus[0] - viewport.pan[0]),
      focus[1] - ratio * (focus[1] - viewport.pan[1]),
    ],
  }
}

export function panBy(
  viewport: PlanViewport,
  dx: number,
  dy: number
): PlanViewport {
  return { ...viewport, pan: [viewport.pan[0] + dx, viewport.pan[1] + dy] }
}

/** The CSS transform for a viewport. */
export function viewportTransform(viewport: PlanViewport): string {
  return `translate(${viewport.pan[0]}px, ${viewport.pan[1]}px) scale(${viewport.zoom})`
}
