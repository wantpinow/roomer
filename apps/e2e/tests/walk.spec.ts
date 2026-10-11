import type { Page } from "@playwright/test"

import { api, convex, expect, test, type SeedResult } from "../fixtures"
import {
  collider,
  expectNear,
  waitForWalker,
  walk,
  type WalkLeg,
} from "../fixtures/walk"
import {
  openWorkspace,
  planView,
  stageCanvas,
  viewMode,
} from "../fixtures/workspace"

/**
 * Walk mode in the seeded living room, driven through the dev-only
 * `window.__roomerWalk` handle: the walker stops at furniture (a bump the
 * physics reports, though the UI deliberately stays quiet about it),
 * jumps onto a coffee table, and a six-footer walks under the ceiling beam
 * that a jump would hit. Positions come from the seeded layout, so the
 * expectations follow the data rather than hard-coded coordinates.
 */

/** The walker's body radius, mm (apps/web/lib/walk/player.ts). */
const WALKER_RADIUS = 250
/** A six-footer, mm (apps/web/lib/walk/player.ts). */
const WALKER_HEIGHT = 1830

async function seededScene(seed: SeedResult) {
  const layout = await convex.query(api.layouts.get, {
    layoutId: seed.layoutId,
  })
  const room = await convex.query(api.rooms.get, { roomId: seed.roomId })
  if (!layout || !room) throw new Error("the seed is incomplete")
  const placed = (id: string) => {
    const placement = layout.placements.find((p) => p.id === id)
    if (!placement) throw new Error(`no placement ${id}`)
    const asset = layout.assets[placement.assetId]
    if (!asset) throw new Error(`no asset for ${id}`)
    // Every seeded piece faces +x (bearing 90): depth runs along x, width
    // along z.
    expect(placement.facing).toBe(90)
    return {
      ...placement,
      name: asset.name,
      dims: asset.dims,
      minX: placement.x - asset.dims.d / 2,
      maxX: placement.x + asset.dims.d / 2,
      minZ: placement.z - asset.dims.w / 2,
      maxZ: placement.z + asset.dims.w / 2,
    }
  }
  const beam = room.features.find((f) => f.type === "beam")
  if (!beam || beam.type !== "beam") throw new Error("the room has no beam")
  return {
    sofa: placed("sofa"),
    table: placed("coffee-table"),
    rug: placed("rug"),
    room,
    beam,
  }
}

async function startWalking(page: Page, seed: SeedResult) {
  await openWorkspace(page, seed)
  await viewMode(page, "Walk").click()
  await expect(page.locator("[data-walk-viewer]")).toBeVisible()
  await expect(stageCanvas(page)).toBeVisible()
  await waitForWalker(page)
}

const walkViewer = (page: Page) => page.locator("[data-walk-viewer]")
const pauseCard = (page: Page) =>
  page.getByRole("dialog", { name: /Paused|Click to start walking/ })

/** From the first-visit card into walking (keys work while focused). */
async function walkOn(page: Page) {
  await page
    .getByRole("button", { name: /Start walking|Resume walking/ })
    .click()
  await expect(walkViewer(page)).toHaveAttribute("data-walk-viewer", "walking")
}

/** Escape, then wait out the echo window so the next Escape counts. */
async function pressEscape(page: Page) {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(600)
}

test("walk mode opens paused and Escape there leaves it", async ({
  page,
  livingRoom,
}) => {
  await startWalking(page, livingRoom)
  const spawn = await page.evaluate(() => {
    const walker = window.__roomerWalk!
    return { spawn: walker.world.spawn.position, at: walker.position() }
  })
  // The walker starts standing at the spawn point, eyes at ~1710mm.
  expect(spawn.at.grounded).toBe(true)
  expectNear(spawn.at.x, spawn.spawn[0], 1, "spawn x")
  expectNear(spawn.at.z, spawn.spawn[1], 1, "spawn z")
  expectNear(spawn.at.eye - spawn.at.feet, 1710, 20, "eye height")

  // A first visit waits for the click that captures the mouse.
  await expect(walkViewer(page)).toHaveAttribute("data-walk-viewer", "paused")
  await expect(
    page.getByRole("dialog", { name: "Click to start walking" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Start walking" })
  ).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(viewMode(page, "Plan")).toHaveAttribute("aria-checked", "true")
  await expect(planView(page)).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => !!window.__roomerWalk))
    .toBe(false)
})

test("Escape pauses: the card sets the height and takes a photo; Resume walks on; Escape twice leaves", async ({
  page,
  livingRoom,
}) => {
  await startWalking(page, livingRoom)
  await walkOn(page)

  // Releasing the mouse pauses — still in Walk mode, the card up.
  await pressEscape(page)
  await expect(walkViewer(page)).toHaveAttribute("data-walk-viewer", "paused")
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible()
  await expect(viewMode(page, "Walk")).toHaveAttribute("aria-checked", "true")
  await expect(
    page.getByRole("button", { name: "Resume walking" })
  ).toBeFocused()

  // An inch taller: the card's readout and the walker's eyes follow.
  await page.getByRole("button", { name: /^Taller by an inch/ }).click()
  await expect(pauseCard(page)).toContainText("Height 6′1″ · eyes 1.73 m")
  const eye = await page.evaluate(() => {
    const at = window.__roomerWalk!.position()
    return at.eye - at.feet
  })
  expectNear(eye, Math.round(1854 * 0.935), 2, "eye height at 6′1″")

  // A photo of the held view: a (stub) render with the walk camera.
  await page.getByRole("button", { name: "Take photo" }).click()
  await expect
    .poll(
      async () => {
        const [render] = await convex.query(api.renders.listByLayout, {
          layoutId: livingRoom.layoutId,
        })
        return render ? `${render.view.name.slice(0, 10)} ${render.status}` : ""
      },
      { timeout: 60_000 }
    )
    .toBe("Walk photo done")

  // Resume walks on; Escape pauses; Escape again leaves for the plan.
  await page.getByRole("button", { name: "Resume walking" }).click()
  await expect(walkViewer(page)).toHaveAttribute("data-walk-viewer", "walking")
  await pressEscape(page)
  await expect(walkViewer(page)).toHaveAttribute("data-walk-viewer", "paused")
  await page.keyboard.press("Escape")
  await expect(viewMode(page, "Plan")).toHaveAttribute("aria-checked", "true")
})

test("walking into the sofa stops at its front, quietly", async ({
  page,
  livingRoom,
}) => {
  const { sofa, table } = await seededScene(livingRoom)
  await startWalking(page, livingRoom)

  // Beside the coffee table (clear of it in z), facing the sofa (-x).
  const z = table.maxZ + WALKER_RADIUS + 110
  expect(z).toBeLessThan(sofa.maxZ)
  const result = await walk(page, { x: table.maxX, z, heading: 270 }, [
    { input: { forward: 1 }, seconds: 2 },
  ])

  // Stopped with the body touching the sofa's front, not inside it.
  expectNear(result.end.x, sofa.maxX + WALKER_RADIUS, 3, "stopped at x")
  expectNear(result.end.z, z, 1, "walked straight")
  expect(result.end.grounded).toBe(true)
  expect(result.bumps.map((b) => b.bumped)).toEqual(["sofa"])
  expect(result.bumps[0]).toMatchObject({ kind: "placement", label: sofa.name })
  // Collisions are felt, not announced: let a few frames pass, then check
  // nothing on the page talks about the bump.
  await page.waitForTimeout(300)
  await expect(page.getByText(/Bumped into/)).toHaveCount(0)
})

test("a jump lands the walker on the coffee table", async ({
  page,
  livingRoom,
}) => {
  const { table, rug, room } = await seededScene(livingRoom)
  await startWalking(page, livingRoom)
  const top = table.dims.h
  expect(
    top + WALKER_HEIGHT,
    "a six-footer fits upright on the table"
  ).toBeLessThanOrEqual(room.ceilingHeight)

  const legs: WalkLeg[] = [
    // Walk up to the table's edge: too high to step onto, so it stops.
    { input: { forward: 1 }, seconds: 0.5 },
    // Jump while pressing on, then stand still.
    { input: { forward: 1, jump: true }, seconds: 0.8 },
    { input: {}, seconds: 0.6 },
  ]
  const result = await walk(
    page,
    { x: table.x, z: table.maxZ + WALKER_RADIUS + 150, heading: 0 },
    legs
  )

  const [atEdge, , standing] = result.legs
  expectNear(atEdge!.z, table.maxZ + WALKER_RADIUS, 3, "stopped at the edge")
  // Still on the floor — well, on the rug, which is walked on, not over.
  expect(atEdge!.feet).toBe(rug.dims.h)
  expect(result.bumps[0]?.bumped).toBe("coffee-table")
  expect(standing!.grounded).toBe(true)
  expect(standing!.feet).toBe(top)
  // On top of it, not beside it.
  expect(standing!.z).toBeLessThan(table.maxZ + WALKER_RADIUS)
  expect(standing!.z).toBeGreaterThan(table.minZ - WALKER_RADIUS)
})

test("a standing walker passes under the beam; a jump hits it", async ({
  page,
  livingRoom,
}) => {
  const { room, beam, table } = await seededScene(livingRoom)
  await startWalking(page, livingRoom)
  const underside = room.ceilingHeight - beam.drop
  expect(underside).toBeGreaterThan(WALKER_HEIGHT)
  expect(await collider(page, beam.id)).toMatchObject({
    kind: "feature",
    y0: underside,
  })

  // The beam runs across the room at z = beam.start[1]; walk down the page
  // (heading 180) through it, to the right of the coffee table.
  const beamZ = beam.start[1]
  const x = table.maxX + WALKER_RADIUS + 300
  const through = await walk(
    page,
    { x, z: beamZ - beam.width / 2 - WALKER_RADIUS - 400, heading: 180 },
    [{ input: { forward: 1 }, seconds: 1.2 }]
  )
  expect(through.bumps).toEqual([])
  expect(through.end.z).toBeGreaterThan(beamZ + beam.width / 2 + WALKER_RADIUS)
  expectNear(through.end.x, x, 1, "walked straight")

  // Jumping right under it, the head meets the beam.
  const jump = await walk(page, { x, z: beamZ, heading: 180 }, [
    { input: { jump: true }, seconds: 0.8 },
  ])
  expect(jump.bumps.map((b) => b.bumped)).toContain(beam.id)
  expect(jump.peakFeet).toBeLessThanOrEqual(underside - WALKER_HEIGHT + 1)
  expect(jump.end.grounded).toBe(true)
})

test("Enter takes a photo: a render of the walk view lands as a thumbnail", async ({
  page,
  livingRoom,
}) => {
  await startWalking(page, livingRoom)
  await walkOn(page)
  const at = await page.evaluate(() => window.__roomerWalk!.position())
  await page.keyboard.press("Enter")
  await expect(page.locator("[data-walk-note]")).toHaveText(
    "Photo taken — rendering…"
  )

  // The render record carries the walk camera: where the walker stood, at
  // eye height, rectilinear, named after the time; medium quality, sized
  // for the stage's shape. (e2e renders with the free stub.)
  await expect
    .poll(
      async () =>
        (
          await convex.query(api.renders.listByLayout, {
            layoutId: livingRoom.layoutId,
          })
        )[0]?.status,
      { timeout: 60_000 }
    )
    .toBe("done")
  const [render] = await convex.query(api.renders.listByLayout, {
    layoutId: livingRoom.layoutId,
  })
  expect(render).toMatchObject({ kind: "photoreal", quality: "medium" })
  expect(render!.view.name).toMatch(/^Walk photo \d\d:\d\d$/)
  expect(render!.view.projection).toBe("rectilinear")
  expectNear(render!.view.position[0], at.x, 1, "photo x")
  expectNear(render!.view.position[1], at.eye, 1, "photo eye height")
  expectNear(render!.view.position[2], at.z, 1, "photo z")
  expect(render!.view.fov).toBeLessThanOrEqual(70)

  // The walk view shows the finished photo as a thumbnail.
  const thumbnail = page.locator("[data-walk-photo-ready]")
  await expect(thumbnail).toBeVisible()
  await expect(thumbnail).toHaveAttribute("href", render!.outputUrl!)
})

test("Shift+Enter saves the view as one of the room's cameras", async ({
  page,
  livingRoom,
}) => {
  await startWalking(page, livingRoom)
  const before = await convex.query(api.rooms.get, {
    roomId: livingRoom.roomId,
  })
  await walkOn(page)
  await page.keyboard.press("Shift+Enter")
  await expect(page.locator("[data-walk-note]")).toHaveText(
    /^Saved “Walk view \d\d:\d\d” to the room's cameras$/
  )
  const after = await convex.query(api.rooms.get, { roomId: livingRoom.roomId })
  expect(after!.cameras).toHaveLength(before!.cameras.length + 1)
  const saved = after!.cameras.at(-1)!
  expect(saved.id).toMatch(/^walk-\d+$/)
  expect(saved.name).toMatch(/^Walk view \d\d:\d\d$/)
})
