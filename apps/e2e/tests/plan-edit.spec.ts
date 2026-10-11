import { api, convex, expect, test, type SeedResult } from "../fixtures"
import { proxyLiveUpdates } from "../fixtures/live-updates"
import {
  inspectorTab,
  openWorkspace,
  planHit,
  planToScreen,
  planView,
  stageRevision,
  startPlanDrag,
  toast,
} from "../fixtures/workspace"

/**
 * Editing a layout in the plan, as the user: drag an item with the pointer
 * (snapped to the 10mm grid, linted live while it moves), nudge and turn it
 * from the keyboard, and lose gracefully when the agent edits the same
 * layout mid-drag. Every edit is checked against server truth, not just the
 * screen.
 */

async function layoutOf(seed: SeedResult) {
  const layout = await convex.query(api.layouts.get, {
    layoutId: seed.layoutId,
  })
  if (!layout) throw new Error("the seeded layout is gone")
  return layout
}

async function placementOf(seed: SeedResult, id: string) {
  const placement = (await layoutOf(seed)).placements.find((p) => p.id === id)
  if (!placement) throw new Error(`no placement ${id}`)
  return placement
}

async function latestEvent(seed: SeedResult) {
  const [event] = await convex.query(api.layouts.events, {
    layoutId: seed.layoutId,
    limit: 1,
  })
  return event
}

test("dragging an item moves it on the server, bumps the revision and re-lints", async ({
  page,
  livingRoom,
}) => {
  const before = await layoutOf(livingRoom)
  const table = before.placements.find((p) => p.id === "coffee-table")!
  expect(before.lint.counts.error).toBe(0)

  await openWorkspace(page, livingRoom)
  await expect(page.getByText("No issues")).toBeVisible()

  // Drag the coffee table 700mm left, into the front of the sofa.
  const target = [table.x - 700, table.z] as const
  await startPlanDrag(page, [table.x, table.z], target)
  await expect(planView(page)).toHaveAttribute("data-dragging", "coffee-table")
  // Lint runs locally while dragging: the overlap shows before the drop.
  const liveRow = page.locator('[data-slot="issue-row"][data-code="E001"]')
  await expect(liveRow).toBeVisible()
  await page.mouse.up()
  await expect(planView(page)).not.toHaveAttribute("data-dragging")

  // Server truth: moved (snapped to the 10mm grid), one revision on, linted.
  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(before.revision + 1)
  const after = await layoutOf(livingRoom)
  const moved = after.placements.find((p) => p.id === "coffee-table")!
  expect(Math.abs(moved.x - target[0])).toBeLessThanOrEqual(20)
  expect(moved.x % 10).toBe(0)
  expect(moved.z).toBe(table.z)
  expect(moved.facing).toBe(table.facing)
  const event = await latestEvent(livingRoom)
  expect(event?.actor).toBe("user")
  expect(event?.changes.map((c) => c.op)).toEqual(["move"])

  const overlap = after.lint.issues.find(
    (i) =>
      i.code === "E001" &&
      i.placementIds.includes("sofa") &&
      i.placementIds.includes("coffee-table")
  )
  expect(overlap, "the server's lint sees the overlap").toBeDefined()
  // The panel now shows the server's report, message for message.
  const row = page.locator('[data-slot="issue-row"][data-code="E001"]', {
    hasText: overlap!.message,
  })
  await expect(row).toBeVisible()
  const total =
    after.lint.counts.error + after.lint.counts.warning + after.lint.counts.info
  await expect(page.locator('[data-slot="issue-row"]')).toHaveCount(total)
  await expect(inspectorTab(page, "Issues")).toContainText(String(total))
  await expect(stageRevision(page)).toHaveAttribute(
    "data-revision",
    String(after.revision)
  )

  // The hit layer followed the drop: the table is grabbable where it landed.
  const landed = await planToScreen(page, [moved.x, moved.z])
  const box = await planHit(page, "coffee-table").boundingBox()
  expect(box).not.toBeNull()
  expect(landed.x).toBeGreaterThan(box!.x)
  expect(landed.x).toBeLessThan(box!.x + box!.width)
})

test("arrow keys nudge and R turns the selected item", async ({
  page,
  livingRoom,
}) => {
  const table = await placementOf(livingRoom, "coffee-table")
  const { revision } = await layoutOf(livingRoom)
  await openWorkspace(page, livingRoom)

  // A click (no drag) selects.
  const at = await planToScreen(page, [table.x, table.z])
  await page.mouse.click(at.x, at.y)
  await expect(planHit(page, "coffee-table")).toHaveAttribute(
    "data-selected",
    "true"
  )
  expect((await layoutOf(livingRoom)).revision).toBe(revision)

  await page.keyboard.press("ArrowRight")
  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(revision + 1)
  let event = await latestEvent(livingRoom)
  expect(event?.actor).toBe("user")
  expect(event?.changes.map((c) => c.op)).toEqual(["nudge"])
  expect(await placementOf(livingRoom, "coffee-table")).toMatchObject({
    x: table.x + 10,
    z: table.z,
    facing: table.facing,
  })

  await page.keyboard.press("Shift+ArrowUp")
  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(revision + 2)
  expect(await placementOf(livingRoom, "coffee-table")).toMatchObject({
    x: table.x + 10,
    z: table.z - 100,
  })

  await page.keyboard.press("r")
  await expect
    .poll(async () => (await layoutOf(livingRoom)).revision)
    .toBe(revision + 3)
  event = await latestEvent(livingRoom)
  expect(event?.changes.map((c) => c.op)).toEqual(["nudge"])
  expect(event?.summary).toMatch(/clockwise/)
  expect(await placementOf(livingRoom, "coffee-table")).toMatchObject({
    x: table.x + 10,
    z: table.z - 100,
    facing: (table.facing + 15) % 360,
  })
  await expect(stageRevision(page)).toHaveAttribute(
    "data-revision",
    String(revision + 3)
  )

  // Escape deselects; keys then do nothing.
  await page.keyboard.press("Escape")
  await expect(planHit(page, "coffee-table")).not.toHaveAttribute(
    "data-selected"
  )
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(300)
  expect((await layoutOf(livingRoom)).revision).toBe(revision + 3)
})

test("an agent edit mid-drag wins: the drop is refused with a toast", async ({
  page,
  livingRoom,
}) => {
  const table = await placementOf(livingRoom, "coffee-table")
  await openWorkspace(page, livingRoom)

  await startPlanDrag(page, [table.x, table.z], [table.x, table.z + 600])
  await expect(planView(page)).toHaveAttribute("data-dragging", "coffee-table")

  // The agent moves the same table while the user is still holding it.
  const agent = await convex.mutation(api.layouts.applyChanges, {
    layoutId: livingRoom.layoutId,
    ops: [{ op: "nudge", id: "coffee-table", dz: -300 }],
    actor: "agent",
  })
  // Wait until the page has seen the agent's revision, then let go.
  await expect(stageRevision(page)).toHaveAttribute(
    "data-revision",
    String(agent.revision)
  )
  await page.mouse.up()

  await expect(toast(page, "The layout changed under you")).toBeVisible()
  await expect(planView(page)).not.toHaveAttribute("data-dragging")
  // Nothing clobbered: the agent's position stands and no user edit landed.
  await page.waitForTimeout(500)
  const after = await layoutOf(livingRoom)
  expect(after.revision).toBe(agent.revision)
  expect(after.placements.find((p) => p.id === "coffee-table")).toMatchObject({
    x: table.x,
    z: table.z - 300,
  })
  expect((await latestEvent(livingRoom))?.actor).toBe("agent")
})

test("a drop the page thinks is current is still refused by the server's revision check", async ({
  page,
  livingRoom,
  consoleErrors,
}) => {
  // The Convex client logs the refused mutation; the app handles it.
  consoleErrors.allow(/CONFLICT/)
  const table = await placementOf(livingRoom, "coffee-table")
  const { revision } = await layoutOf(livingRoom)
  const live = await proxyLiveUpdates(page)
  await openWorkspace(page, livingRoom)
  await expect(stageRevision(page)).toHaveAttribute(
    "data-revision",
    String(revision)
  )

  await startPlanDrag(page, [table.x, table.z], [table.x, table.z + 600])
  await expect(planView(page)).toHaveAttribute("data-dragging", "coffee-table")
  // The agent's edit lands, but the page doesn't hear about it before the
  // drop: it sends its move against the revision it saw.
  live.hold()
  const agent = await convex.mutation(api.layouts.applyChanges, {
    layoutId: livingRoom.layoutId,
    ops: [{ op: "nudge", id: "coffee-table", dz: -300 }],
    actor: "agent",
  })
  await expect.poll(() => live.held).toBeGreaterThan(0)
  await page.mouse.up()

  await expect(toast(page, "The layout changed under you")).toBeVisible()
  // It was the server that said no (the page still thought r${revision}).
  expect(consoleErrors.errors.some((e) => e.includes("CONFLICT"))).toBe(true)
  live.release()
  await expect(stageRevision(page)).toHaveAttribute(
    "data-revision",
    String(agent.revision)
  )
  const after = await layoutOf(livingRoom)
  expect(after.revision).toBe(agent.revision)
  expect(after.placements.find((p) => p.id === "coffee-table")).toMatchObject({
    x: table.x,
    z: table.z - 300,
  })
  expect((await latestEvent(livingRoom))?.actor).toBe("agent")
  // The table is drawn where the agent put it, not where it was dropped.
  const agentSpot = await planToScreen(page, [table.x, table.z - 300])
  const box = await planHit(page, "coffee-table").boundingBox()
  expect(agentSpot.y).toBeGreaterThan(box!.y)
  expect(agentSpot.y).toBeLessThan(box!.y + box!.height)
})
