import type { Page } from "@playwright/test"

import type { AssetSpec } from "@roomer/core/schema"

import { api, convex, expect, test, type SeedResult } from "../fixtures"
import {
  inspectorTab,
  openWorkspace,
  planHit,
  planToScreen,
  planView,
  startPlanDrag,
} from "../fixtures/workspace"

/**
 * Moving items up and down from the planner: "Rest on…" stands a lamp on
 * the sideboard it was dragged onto, Alt+↑/↓ raise and lower the selection
 * (a group as one piece, never below the floor), and the inspector's field
 * hangs a TV higher — each one batch, checked against server truth.
 */

/** A table lamp: a 180mm base disc, a stem and a shade, 500mm tall. */
const TABLE_LAMP: AssetSpec & { key: string; source: "custom" } = {
  key: "e2e-table-lamp",
  source: "custom",
  name: "Table lamp",
  category: "lighting",
  mount: "floor",
  dims: { w: 300, d: 300, h: 500 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "cylinder",
        name: "base",
        position: [0, 10, 0],
        radiusTop: 90,
        radiusBottom: 90,
        height: 20,
      },
      {
        shape: "cylinder",
        name: "stem",
        position: [0, 160, 0],
        radiusTop: 10,
        radiusBottom: 10,
        height: 280,
      },
      {
        shape: "cylinder",
        name: "shade",
        position: [0, 400, 0],
        radiusTop: 100,
        radiusBottom: 150,
        height: 200,
        tone: "light",
      },
    ],
  },
}

// The generic sideboard is 1600 × 450 and 750 tall; at (1490, 1100) it
// spans x 690–2290. The lamp starts on the floor beside it.
const SIDEBOARD_AT: readonly [number, number] = [1490, 1100]
const LAMP_AT: readonly [number, number] = [2600, 1100]
const ON_SIDEBOARD: readonly [number, number] = [1900, 1100]

/** The agent sets the scene: a sideboard with a lamp beside it. */
async function addLampAndSideboard(seed: SeedResult) {
  const { assetId } = await convex.mutation(api.assets.create, TABLE_LAMP)
  await convex.mutation(api.layouts.applyChanges, {
    layoutId: seed.layoutId,
    actor: "agent",
    ops: [
      {
        op: "add",
        id: "sideboard",
        asset: "generic-sideboard",
        label: "Sideboard",
        position: {
          mode: "at",
          x: SIDEBOARD_AT[0],
          z: SIDEBOARD_AT[1],
          facing: 180,
        },
      },
      {
        op: "add",
        id: "lamp",
        asset: assetId,
        label: "Table lamp",
        position: { mode: "at", x: LAMP_AT[0], z: LAMP_AT[1] },
      },
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

async function elevationOf(seed: SeedResult, id: string) {
  const layout = await layoutOf(seed)
  return layout.placements.find((p) => p.id === id)?.elevation
}

async function eventsSince(seed: SeedResult, revision: number) {
  const events = await convex.query(api.layouts.events, {
    layoutId: seed.layoutId,
    limit: 20,
  })
  return events.filter((e) => e.revision > revision)
}

/** Click an item on the plan (selects it and focuses the plan). */
async function clickItem(page: Page, at: readonly [number, number]) {
  const point = await planToScreen(page, at)
  await page.mouse.click(point.x, point.y)
}

const heightField = (page: Page) =>
  page.locator('[data-slot="elevation-input"]')
const caption = (page: Page) =>
  planView(page).locator('[data-slot="plan-item-caption"]')

test("a lamp dragged onto the sideboard rests on it, then Alt+↑/↓ raise and lower it", async ({
  page,
  livingRoom,
}) => {
  await addLampAndSideboard(livingRoom)
  await openWorkspace(page, livingRoom)
  await inspectorTab(page, "Items").click()

  // Drag the lamp onto the sideboard: it lands on the floor, inside it.
  await startPlanDrag(page, LAMP_AT, ON_SIDEBOARD)
  await page.mouse.up()
  await expect
    .poll(
      async () =>
        (await layoutOf(livingRoom)).placements.find((p) => p.id === "lamp")?.x
    )
    .toBe(ON_SIDEBOARD[0])
  await expect(planHit(page, "lamp")).toHaveAttribute("data-selected", "true")
  await expect(heightField(page)).toHaveValue("0")

  // "Rest on Sideboard" stands it on the 750mm top.
  const before = await layoutOf(livingRoom)
  const rest = page.locator('[data-slot="rest-on"]')
  await expect(rest).toHaveText(["Rest on Sideboard (750 mm)"])
  await rest.click()
  await expect.poll(() => elevationOf(livingRoom, "lamp")).toBe(750)
  const rested = await layoutOf(livingRoom)
  expect(rested.revision).toBe(before.revision + 1)
  // Nothing says it floats or clashes any more.
  expect(
    rested.lint.issues.filter((i) => i.placementIds.includes("lamp"))
  ).toEqual([])
  await expect(rest).toHaveText(["On Sideboard (750 mm)"])
  await expect(rest).toBeDisabled()
  await expect(
    planView(page).locator('[data-slot="plan-elevation"][data-id="lamp"]')
  ).toHaveText("↑ 750")

  // Alt+↑ raises it 10mm: one revision, one nudge.
  await clickItem(page, ON_SIDEBOARD)
  await page.keyboard.press("Alt+ArrowUp")
  await expect.poll(() => elevationOf(livingRoom, "lamp")).toBe(760)
  await expect(caption(page)).toContainText("760 mm off the floor")
  const raised = await eventsSince(livingRoom, rested.revision)
  expect(raised).toHaveLength(1)
  expect(raised[0]!.changes.map((c) => [c.op, c.id])).toEqual([
    ["nudge", "lamp"],
  ])
  await expect(heightField(page)).toHaveValue("760")
  // Shift+Alt+↑: 100mm more, floating over the top — the caption shows
  // lint's W105 at once.
  await page.keyboard.press("Shift+Alt+ArrowUp")
  await expect(caption(page)).toContainText("860 mm off the floor")
  await expect(caption(page)).toContainText("W105")
  await expect.poll(() => elevationOf(livingRoom, "lamp")).toBe(860)

  // Alt+↓ on the sideboard, already on the floor, sends nothing: the next
  // edit is the very next revision.
  await clickItem(page, SIDEBOARD_AT)
  await page.keyboard.press("Alt+ArrowDown")
  await expect(caption(page)).toContainText("on the floor")
  const atFloor = (await layoutOf(livingRoom)).revision
  await clickItem(page, ON_SIDEBOARD)
  await page.keyboard.press("Shift+Alt+ArrowDown")
  await expect.poll(() => elevationOf(livingRoom, "lamp")).toBe(760)
  expect((await layoutOf(livingRoom)).revision).toBe(atFloor + 1)
  expect(await elevationOf(livingRoom, "sideboard")).toBe(0)
})

test("a group rises as one piece and stops at the floor", async ({
  page,
  livingRoom,
}) => {
  await addLampAndSideboard(livingRoom)
  await convex.mutation(api.layouts.applyChanges, {
    layoutId: livingRoom.layoutId,
    actor: "agent",
    ops: [{ op: "set", id: "lamp", elevation: 750 }],
  })
  await openWorkspace(page, livingRoom)
  await inspectorTab(page, "Items").click()

  // A marquee over the sideboard and its lamp.
  const from = await planToScreen(page, [300, 450])
  const to = await planToScreen(page, [2850, 1700])
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  await expect(planView(page)).toHaveAttribute("data-selected-count", "2")
  await expect(heightField(page)).toHaveAttribute("placeholder", "mixed")

  // Shift+Alt+↑: both up 100mm, as one batch.
  const before = await layoutOf(livingRoom)
  await page.keyboard.press("Shift+Alt+ArrowUp")
  await expect.poll(() => elevationOf(livingRoom, "sideboard")).toBe(100)
  const after = await layoutOf(livingRoom)
  expect(after.revision).toBe(before.revision + 1)
  expect(after.placements.find((p) => p.id === "lamp")?.elevation).toBe(850)
  const events = await eventsSince(livingRoom, before.revision)
  expect(events).toHaveLength(1)
  expect(events[0]!.changes.map((c) => [c.op, c.id])).toEqual([
    ["nudge", "sideboard"],
    ["nudge", "lamp"],
  ])
  await expect(caption(page)).toContainText("2 items")
  await expect(caption(page)).toContainText("100–850 mm off the floor")

  // Shift+Alt+↓ twice: the first lowers both by 100 (the sideboard reaches
  // the floor), the second sends nothing — the lamp stays on its top.
  await page.keyboard.press("Shift+Alt+ArrowDown")
  await expect.poll(() => elevationOf(livingRoom, "sideboard")).toBe(0)
  await page.keyboard.press("Shift+Alt+ArrowDown")
  await page.keyboard.press("Shift+Alt+ArrowUp")
  await expect.poll(() => elevationOf(livingRoom, "sideboard")).toBe(100)
  const final = await layoutOf(livingRoom)
  expect(final.revision).toBe(before.revision + 3)
  expect(final.placements.find((p) => p.id === "lamp")?.elevation).toBe(850)
})

test("the inspector hangs the TV higher, and leaves ceiling items alone", async ({
  page,
  livingRoom,
}) => {
  await convex.mutation(api.layouts.applyChanges, {
    layoutId: livingRoom.layoutId,
    actor: "agent",
    ops: [
      {
        op: "add",
        id: "tv",
        asset: "generic-wall-tv",
        position: { mode: "onWall", wall: "W2", at: 4100, elevation: 680 },
      },
      {
        op: "add",
        id: "pendant",
        asset: "generic-pendant-lamp",
        position: { mode: "centerOn", placement: "coffee-table" },
      },
    ],
  })
  await openWorkspace(page, livingRoom)
  await inspectorTab(page, "Items").click()

  await page.locator('[data-slot="item-row"][data-placement-id="tv"]').click()
  const control = page.locator('[data-slot="elevation-control"]')
  await expect(control).toHaveAttribute("data-kind", "wall")
  await expect(control).toContainText("Height on wall")
  await expect(heightField(page)).toHaveValue("680")
  // The TV is 840 tall: its middle is 420 above its bottom.
  await expect(control).toContainText("centre 1,100 mm")

  const before = await layoutOf(livingRoom)
  await heightField(page).fill("1100")
  // Typing previews: the plan's badge and caption follow before Enter.
  await expect(
    planView(page).locator('[data-slot="plan-elevation"][data-id="tv"]')
  ).toHaveText("↑ 1,100")
  await expect(caption(page)).toContainText("bottom 1,100 mm · centre 1,520 mm")
  expect((await layoutOf(livingRoom)).revision).toBe(before.revision)
  await heightField(page).press("Enter")
  await expect.poll(() => elevationOf(livingRoom, "tv")).toBe(1100)
  const after = await layoutOf(livingRoom)
  expect(after.revision).toBe(before.revision + 1)
  const events = await eventsSince(livingRoom, before.revision)
  expect(events[0]!.changes.map((c) => [c.op, c.id])).toEqual([["set", "tv"]])
  await expect(control).toContainText("centre 1,520 mm")

  // A pendant's height is the asset's drop: nothing to change.
  await page
    .locator('[data-slot="item-row"][data-placement-id="pendant"]')
    .click()
  await expect(control).toHaveAttribute("data-kind", "ceiling")
  await expect(heightField(page)).toBeDisabled()
  // (It hangs over the coffee table, which takes clicks there: keep the
  // row's selection and just give the plan the keyboard.)
  await planView(page).focus()
  await page.keyboard.press("Alt+ArrowUp")
  await expect(caption(page)).toContainText("hangs from the ceiling")
  expect((await layoutOf(livingRoom)).revision).toBe(after.revision)
})
