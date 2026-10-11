import type { Page } from "@playwright/test"

// The same maths the workspace uses for group turns and outlines.
import {
  groupBounds,
  rectCentre,
  rotateGroup,
} from "../../web/lib/plan-edit/group"
import { planFootprints } from "../../web/lib/workspace/footprints"
import { api, convex, expect, test, type SeedResult } from "../fixtures"
import {
  inspectorTab,
  openWorkspace,
  planHit,
  planToScreen,
  planView,
  toast,
} from "../fixtures/workspace"

/**
 * Working with several items at once on the plan: a marquee on the floor
 * selects what it touches, Shift+click toggles, ⌘/Ctrl+A selects all, Esc
 * clears; dragging any selected item moves the group, R turns it about its
 * centre, Delete removes it with an Undo — each as ONE batch (one revision,
 * one activity event), checked against server truth.
 */

const DINING_SET = [
  "dining-table",
  "chair-nw",
  "chair-ne",
  "chair-sw",
  "chair-se",
] as const

/** The agent lays a dining table with four chairs at the kitchen end. */
async function addDiningSet(seed: SeedResult) {
  return await convex.mutation(api.layouts.applyChanges, {
    layoutId: seed.layoutId,
    actor: "agent",
    ops: [
      {
        op: "add",
        id: "dining-table",
        asset: "generic-dining-table",
        position: { mode: "at", x: 1490, z: 1600, facing: 180 },
      },
      ...(
        [
          ["chair-nw", 1040, 880, 180],
          ["chair-ne", 1940, 880, 180],
          ["chair-sw", 1040, 2320, 0],
          ["chair-se", 1940, 2320, 0],
        ] as const
      ).map(([id, x, z, facing]) => ({
        op: "add" as const,
        id,
        asset: "generic-dining-chair",
        position: { mode: "at" as const, x, z, facing },
      })),
    ],
  })
}

async function layoutOf(seed: SeedResult) {
  const layout = await convex.query(api.layouts.get, {
    layoutId: seed.layoutId,
  })
  if (!layout) throw new Error("the seeded layout is gone")
  return layout
}

async function eventsSince(seed: SeedResult, revision: number) {
  const events = await convex.query(api.layouts.events, {
    layoutId: seed.layoutId,
    limit: 20,
  })
  return events.filter((e) => e.revision > revision)
}

/** Drag a marquee between two plan points (room mm). */
async function marquee(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number]
) {
  const a = await planToScreen(page, from)
  const b = await planToScreen(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 10 })
  await expect(
    planView(page).locator('[data-slot="plan-marquee"]')
  ).toBeVisible()
  await page.mouse.up()
}

test("a marquee selects the dining set and a drag moves it in one revision", async ({
  page,
  livingRoom,
}) => {
  await addDiningSet(livingRoom)
  const before = await layoutOf(livingRoom)
  await openWorkspace(page, livingRoom)

  // From empty floor by the wall, across the set, stopping short of the sofa.
  await marquee(page, [300, 450], [2700, 2700])
  await expect(planView(page)).toHaveAttribute("data-selected-count", "5")
  for (const id of DINING_SET) {
    await expect(planHit(page, id)).toHaveAttribute("data-selected", "true")
  }
  for (const id of ["sofa", "coffee-table", "rug"]) {
    await expect(planHit(page, id)).not.toHaveAttribute("data-selected")
  }
  await expect(
    planView(page).locator('[data-slot="plan-group"]')
  ).toHaveAttribute("data-count", "5")
  await inspectorTab(page, "Items").click()
  await expect(page.locator('[data-slot="item-selection"]')).toContainText(
    "5 selected"
  )

  // Drag the table (any selected item drags the group) 400mm down.
  const table = before.placements.find((p) => p.id === "dining-table")!
  const from = await planToScreen(page, [table.x, table.z])
  const to = await planToScreen(page, [table.x, table.z + 400])
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await expect(planView(page)).toHaveAttribute("data-dragging", "dining-table")
  await expect(page.locator('[data-slot="group-drag-readout"]')).toContainText(
    "5 items"
  )
  await page.mouse.up()

  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(before.revision + 1)
  const after = await layoutOf(livingRoom)
  const offsets = DINING_SET.map((id) => {
    const a = before.placements.find((p) => p.id === id)!
    const b = after.placements.find((p) => p.id === id)!
    return [b.x - a.x, b.z - a.z, b.facing - a.facing]
  })
  // Everyone moved by the same grid-snapped offset, about 400mm down.
  const [dx, dz] = offsets[0]!
  for (const offset of offsets) expect(offset).toEqual([dx, dz, 0])
  expect(dx).toBe(0)
  expect(Math.abs(dz! - 400)).toBeLessThanOrEqual(20)
  expect(dz! % 10).toBe(0)
  // The rest stayed put.
  for (const id of ["sofa", "coffee-table", "rug"]) {
    expect(after.placements.find((p) => p.id === id)).toEqual(
      before.placements.find((p) => p.id === id)
    )
  }
  // One batch: one event, five nudges, by the user.
  const events = await eventsSince(livingRoom, before.revision)
  expect(events).toHaveLength(1)
  expect(events[0]!.actor).toBe("user")
  expect(events[0]!.changes.map((c) => [c.op, c.id])).toEqual(
    DINING_SET.map((id) => ["nudge", id])
  )
})

test("Shift+click toggles items, Cmd/Ctrl+A selects all, Esc clears", async ({
  page,
  livingRoom,
}) => {
  await addDiningSet(livingRoom)
  const layout = await layoutOf(livingRoom)
  const at = (id: string) => {
    const p = layout.placements.find((q) => q.id === id)!
    return planToScreen(page, [p.x, p.z])
  }
  await openWorkspace(page, livingRoom)

  const table = await at("dining-table")
  await page.mouse.click(table.x, table.y)
  await expect(planHit(page, "dining-table")).toHaveAttribute(
    "data-selected",
    "true"
  )
  const chair = await at("chair-nw")
  await page.keyboard.down("Shift")
  await page.mouse.click(chair.x, chair.y)
  await expect(planView(page)).toHaveAttribute("data-selected-count", "2")
  await page.mouse.click(chair.x, chair.y)
  await page.keyboard.up("Shift")
  await expect(planView(page)).toHaveAttribute("data-selected-count", "1")
  await expect(planHit(page, "chair-nw")).not.toHaveAttribute("data-selected")

  await page.keyboard.press("ControlOrMeta+a")
  await expect(planView(page)).toHaveAttribute(
    "data-selected-count",
    String(layout.placements.length)
  )
  await page.keyboard.press("Escape")
  await expect(planView(page)).not.toHaveAttribute("data-selected-count")

  // A click on empty floor clears too.
  await page.mouse.click(table.x, table.y)
  const floor = await planToScreen(page, [300, 6500])
  await page.mouse.click(floor.x, floor.y)
  await expect(planView(page)).not.toHaveAttribute("data-selected-count")
  // Nothing was edited along the way.
  expect((await layoutOf(livingRoom)).revision).toBe(layout.revision)
})

test("R turns the group a quarter about its centre", async ({
  page,
  livingRoom,
}) => {
  await addDiningSet(livingRoom)
  const before = await layoutOf(livingRoom)
  await openWorkspace(page, livingRoom)
  await marquee(page, [300, 450], [2700, 2700])
  await expect(planView(page)).toHaveAttribute("data-selected-count", "5")

  await page.keyboard.press("r")
  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(before.revision + 1)
  const after = await layoutOf(livingRoom)

  // The expected poses, from the same helpers the workspace uses.
  const group = before.placements.filter((p) =>
    (DINING_SET as readonly string[]).includes(p.id)
  )
  const bounds = groupBounds(
    planFootprints(group, before.assets).map((f) => f.outline)
  )!
  const expected = rotateGroup(group, rectCentre(bounds), 90)
  for (const want of expected) {
    expect(after.placements.find((p) => p.id === want.id)).toMatchObject(want)
  }
  // The table turned from 180 to 270, the north chairs to face the table
  // from the east side.
  expect(after.placements.find((p) => p.id === "dining-table")?.facing).toBe(
    270
  )
  const events = await eventsSince(livingRoom, before.revision)
  expect(events).toHaveLength(1)
  expect(events[0]!.changes).toHaveLength(5)
})

test("Delete removes the group and Undo puts it all back, one batch each", async ({
  page,
  livingRoom,
}) => {
  await addDiningSet(livingRoom)
  const before = await layoutOf(livingRoom)
  await openWorkspace(page, livingRoom)
  await marquee(page, [300, 450], [2700, 2700])
  await expect(planView(page)).toHaveAttribute("data-selected-count", "5")

  await page.keyboard.press("Delete")
  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(before.revision + 1)
  expect((await layoutOf(livingRoom)).placements.map((p) => p.id)).toEqual([
    "sofa",
    "coffee-table",
    "rug",
  ])
  for (const id of DINING_SET) await expect(planHit(page, id)).toHaveCount(0)

  const removed = toast(page, "Removed 5 items")
  await expect(removed).toBeVisible()
  await removed.getByRole("button", { name: "Undo" }).click()
  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(before.revision + 2)
  const after = await layoutOf(livingRoom)
  for (const id of DINING_SET) {
    expect(after.placements.find((p) => p.id === id)).toEqual(
      before.placements.find((p) => p.id === id)
    )
  }
  const events = await eventsSince(livingRoom, before.revision)
  expect(events.map((e) => e.changes.map((c) => c.op))).toEqual([
    ["add", "add", "add", "add", "add"],
    ["remove", "remove", "remove", "remove", "remove"],
  ])
})
