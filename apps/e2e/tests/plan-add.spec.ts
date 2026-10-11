import { TEST_ASSETS } from "@roomer/core/fixtures"
import type { Page } from "@playwright/test"

import { api, convex, expect, test, type SeedResult } from "../fixtures"
import {
  openWorkspace,
  planHit,
  planToScreen,
  planView,
  stageRevision,
  viewMode,
} from "../fixtures/workspace"

/**
 * Adding furniture from the plan, as the user: open the picker (A or the
 * toolbar), search it, and place a piece — a ghost follows the pointer,
 * snapping back-to-wall near walls and onto the nearest wall for wall
 * items — with a click, a drag from the picker, or Shift+click for several.
 * Escape backs out without touching the layout. Every placement is checked
 * against server truth.
 */

const SKIRTING = 18 // the living room's skirting depth, mm
const SOFA = TEST_ASSETS.sofa // 2200 × 950 × 820
const TV = TEST_ASSETS.wallTv // 1450 × 40 × 840

async function layoutOf(seed: SeedResult) {
  const layout = await convex.query(api.layouts.get, {
    layoutId: seed.layoutId,
  })
  if (!layout) throw new Error("the seeded layout is gone")
  return layout
}

function picker(page: Page) {
  return page.locator('[data-slot="asset-picker"]')
}

function pickerRow(page: Page, name: string) {
  return picker(page)
    .locator('[data-slot="picker-asset"]')
    .filter({ hasText: name })
}

/** Open the picker, search for `query` and pick the row named `name`. */
async function pick(page: Page, query: string, name: string): Promise<void> {
  if ((await picker(page).count()) === 0) await page.keyboard.press("a")
  await expect(picker(page)).toBeVisible()
  await picker(page)
    .getByRole("searchbox", { name: "Search furniture" })
    .fill(query)
  await pickerRow(page, name).click()
  await expect(planView(page)).toHaveAttribute("data-placing", /.+/)
}

/** Move the pointer to a plan point (room mm) and wait for the ghost. */
async function hover(page: Page, at: readonly [number, number]) {
  const point = await planToScreen(page, at)
  await page.mouse.move(point.x, point.y, { steps: 6 })
  await expect(page.locator('[data-slot="plan-ghost"]')).toBeVisible()
  return point
}

test("a sofa placed near W6 snaps back-to-wall and lands on the server", async ({
  page,
  livingRoom,
}) => {
  const before = await layoutOf(livingRoom)
  await openWorkspace(page, livingRoom)

  await page.keyboard.press("a")
  await expect(picker(page)).toBeVisible()
  // Search narrows the list to the matching piece.
  await picker(page)
    .getByRole("searchbox", { name: "Search furniture" })
    .fill("three-seat")
  await expect(picker(page).locator('[data-slot="picker-asset"]')).toHaveCount(
    1
  )
  await pickerRow(page, "Generic three-seat sofa").click()
  await expect(picker(page)).toHaveCount(0)

  // Near the long left wall, the ghost turns its back to it.
  const at = await hover(page, [400, 1500])
  await expect(page.locator('[data-slot="plan-ghost"]')).toHaveAttribute(
    "data-snap",
    "wall:W6"
  )
  await page.mouse.click(at.x, at.y)
  await expect(planView(page)).not.toHaveAttribute("data-placing")

  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(before.revision + 1)
  const after = await layoutOf(livingRoom)
  const added = after.placements.find(
    (p) => !before.placements.some((b) => b.id === p.id)
  )
  expect(added).toMatchObject({
    id: "generic-three-seat-sofa",
    assetId: livingRoom.assetIds["generic-sofa"],
    facing: 90,
    x: SKIRTING + SOFA.dims.d / 2,
    z: 1500,
    elevation: 0,
  })
  expect(after.relations["generic-three-seat-sofa"]?.touchingWalls).toContain(
    "W6"
  )
  const [event] = await convex.query(api.layouts.events, {
    layoutId: livingRoom.layoutId,
    limit: 1,
  })
  expect(event?.actor).toBe("user")
  expect(event?.changes.map((c) => c.op)).toEqual(["add"])
  // The new piece is selected, and the caption shows the new revision.
  await expect(planHit(page, "generic-three-seat-sofa")).toHaveAttribute(
    "data-selected",
    "true"
  )
  await expect(stageRevision(page)).toHaveAttribute(
    "data-revision",
    String(after.revision)
  )
})

test("a TV always goes on the nearest wall, at TV height", async ({
  page,
  livingRoom,
}) => {
  await openWorkspace(page, livingRoom)
  await pick(page, "tv", "Generic 65in TV")

  // Pointing into the room near the right-hand wall W2.
  const at = await hover(page, [2400, 3000])
  await expect(page.locator('[data-slot="plan-ghost"]')).toHaveAttribute(
    "data-snap",
    "wall:W2"
  )
  await expect(page.locator('[data-slot="plan-ghost-caption"]')).toContainText(
    "On W2 · bottom at 680 mm"
  )
  await page.mouse.click(at.x, at.y)

  await expect
    .poll(async () =>
      (await layoutOf(livingRoom)).placements.find(
        (p) => p.assetId === livingRoom.assetIds["generic-wall-tv"]
      )
    )
    .toBeDefined()
  const tv = (await layoutOf(livingRoom)).placements.find(
    (p) => p.assetId === livingRoom.assetIds["generic-wall-tv"]
  )!
  // Centre at 1100mm: bottom = 1100 − 840 / 2. Above the skirting, its back
  // sits on the plaster of W2 (x = 2980), facing into the room (270°).
  expect(tv).toMatchObject({
    elevation: 1100 - TV.dims.h / 2,
    facing: 270,
    x: 2980 - TV.dims.d / 2,
    z: 3000,
  })
})

test("Escape cancels placing without touching the layout", async ({
  page,
  livingRoom,
}) => {
  const before = await layoutOf(livingRoom)
  await openWorkspace(page, livingRoom)
  await pick(page, "coffee", "Generic coffee table")
  await hover(page, [1490, 1500])

  await page.keyboard.press("Escape")
  await expect(planView(page)).not.toHaveAttribute("data-placing")
  await expect(page.locator('[data-slot="plan-ghost"]')).toHaveCount(0)
  // Back to the picker, to choose something else; Escape again closes it.
  await expect(picker(page)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(picker(page)).toHaveCount(0)

  await page.waitForTimeout(500)
  const after = await layoutOf(livingRoom)
  expect(after.revision).toBe(before.revision)
  expect(after.placements).toEqual(before.placements)
})

test("Shift+click keeps placing the same piece", async ({
  page,
  livingRoom,
}) => {
  const before = await layoutOf(livingRoom)
  await openWorkspace(page, livingRoom)
  await pick(page, "dining chair", "Generic dining chair")

  for (const at of [
    [1100, 1400],
    [1900, 1400],
  ] as const) {
    const point = await hover(page, at)
    await page.keyboard.down("Shift")
    await page.mouse.click(point.x, point.y)
    await page.keyboard.up("Shift")
    // Still placing after each Shift+click.
    await expect(planView(page)).toHaveAttribute("data-placing", /.+/)
  }
  await page.keyboard.press("Escape")

  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(before.revision + 2)
  const chairs = (await layoutOf(livingRoom)).placements.filter(
    (p) => p.assetId === livingRoom.assetIds["generic-dining-chair"]
  )
  expect(chairs.map((c) => [c.id, c.x, c.z])).toEqual([
    ["generic-dining-chair", 1100, 1400],
    ["generic-dining-chair-2", 1900, 1400],
  ])
})

test("dragging a row from the picker onto the plan places it", async ({
  page,
  livingRoom,
}) => {
  const before = await layoutOf(livingRoom)
  await openWorkspace(page, livingRoom)
  await page.keyboard.press("a")
  await picker(page)
    .getByRole("searchbox", { name: "Search furniture" })
    .fill("sideboard")

  const target = await planToScreen(page, [1490, 1500])
  const box = await planView(page).boundingBox()
  await pickerRow(page, "Generic sideboard").dragTo(planView(page), {
    targetPosition: { x: target.x - box!.x, y: target.y - box!.y },
  })

  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(before.revision + 1)
  const added = (await layoutOf(livingRoom)).placements.find(
    (p) => p.assetId === livingRoom.assetIds["generic-sideboard"]
  )
  // Where it was dropped, on the 10mm grid (the drop point is whole pixels).
  expect(added).toMatchObject({ facing: 180 })
  expect(Math.abs(added!.x - 1490)).toBeLessThanOrEqual(10)
  expect(Math.abs(added!.z - 1500)).toBeLessThanOrEqual(10)
  expect(added!.x % 10).toBe(0)
  await expect(picker(page)).toHaveCount(0)
  await expect(planView(page)).not.toHaveAttribute("data-placing")
})

test("Add item from 3D switches back to the plan", async ({
  page,
  livingRoom,
}) => {
  await openWorkspace(page, livingRoom)
  await viewMode(page, "3D").click()
  await expect(planView(page)).toHaveCount(0)

  await page.getByRole("button", { name: /Add item/ }).click()
  await expect(planView(page)).toBeVisible()
  await expect(picker(page)).toBeVisible()
  await expect(viewMode(page, "Plan")).toHaveAttribute("aria-checked", "true")
})
