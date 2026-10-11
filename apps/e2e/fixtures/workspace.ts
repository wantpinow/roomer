/**
 * Page helpers for the room workspace (/rooms/[roomId]): where things are,
 * by role first and by the components' own `data-*` hooks second.
 */
import { expect, type Locator, type Page } from "@playwright/test"

export function workspacePath(roomId: string, layoutId?: string): string {
  return layoutId
    ? `/rooms/${roomId}?layout=${encodeURIComponent(layoutId)}`
    : `/rooms/${roomId}`
}

/** Open a room's workspace (optionally on one layout) and wait for its plan. */
export async function openWorkspace(
  page: Page,
  { roomId, layoutId }: { roomId: string; layoutId?: string }
): Promise<void> {
  await page.goto(workspacePath(roomId, layoutId))
  await expect(planView(page)).toBeVisible()
}

/** The editable floor plan (core's SVG plus the interactive hit layer). */
export function planView(page: Page): Locator {
  return page.locator('[data-slot="plan-view"]')
}

/** core's drawing of one placement inside the plan SVG. */
export function planDrawing(page: Page): Locator {
  return planView(page).locator("g.item[data-placement-id]")
}

/** The hit-layer group for one placement (what the pointer grabs). */
export function planHit(page: Page, placementId: string): Locator {
  return planView(page).locator(`[data-hit-id="${placementId}"]`)
}

/** Every hit-layer group, one per placement. */
export function planHits(page: Page): Locator {
  return planView(page).locator("[data-hit-id]")
}

/** An inspector tab by its label ("Issues", "Items", "Activity", "Renders"). */
export function inspectorTab(page: Page, label: string): Locator {
  return page.getByRole("tab", { name: new RegExp(`^${label}`) })
}

/** A layout's card in the rail. */
export function layoutCard(page: Page, layoutId: string): Locator {
  return page.locator(`[data-slot="layout-card"][data-layout-id="${layoutId}"]`)
}

/** The top bar's "Agent active / idle" pill. */
export function agentStatus(page: Page): Locator {
  return page.locator('[data-slot="agent-status"]')
}

/** A view-mode switch item ("Plan", "3D", "Camera", "Walk"). */
export function viewMode(page: Page, label: string): Locator {
  return page.getByRole("radio", { name: label, exact: true })
}

/** The stage's live canvas (3D, Camera and Walk modes). */
export function stageCanvas(page: Page): Locator {
  return page.locator('[data-slot="stage"] canvas')
}

/**
 * A toast by its text. (By slot, not text alone: Radix also copies a toast's
 * text into a hidden live region for screen readers.)
 */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('[data-slot="toast"]').filter({ hasText: text })
}

/**
 * Where a plan point (room mm) is on screen, in the page's CSS pixels —
 * through the hit layer's own screen CTM, the same matrix the plan inverts
 * to turn pointer events into millimetres.
 */
export async function planToScreen(
  page: Page,
  [x, z]: readonly [number, number]
): Promise<{ x: number; y: number }> {
  return await planView(page)
    .locator("svg:has(> [data-hit-id])")
    .evaluate(
      (svg, point) => {
        const ctm = (svg as SVGSVGElement).getScreenCTM()
        if (!ctm) throw new Error("The plan's hit layer has no screen CTM")
        const p = new DOMPoint(point[0], point[1]).matrixTransform(ctm)
        return { x: p.x, y: p.y }
      },
      [x, z] as const
    )
}

/**
 * Press on a plan point and drag to another with real pointer events, in
 * small steps like a hand would. Leaves the button down: call
 * `page.mouse.up()` to drop (or press Escape to cancel).
 */
export async function startPlanDrag(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number]
): Promise<void> {
  const start = await planToScreen(page, from)
  const end = await planToScreen(page, to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
}

/** The stage caption's revision readout (`data-revision` holds the number). */
export function stageRevision(page: Page): Locator {
  return page.locator('[data-slot="stage-caption"] [data-revision]')
}
