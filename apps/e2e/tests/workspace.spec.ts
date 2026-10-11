import { api, convex, expect, test } from "../fixtures"
import { OAK_SIDEBOARD, OAK_SIDEBOARD_PRICE } from "../fixtures/assets"
import {
  agentStatus,
  inspectorTab,
  layoutCard,
  openWorkspace,
  planDrawing,
  planHit,
  planHits,
  planView,
  stageCanvas,
  stageRevision,
  toast,
  viewMode,
} from "../fixtures/workspace"

/**
 * The room workspace as the user watches the agent work: the plan draws
 * every placement, layouts switch (and start) from the rail, lint issues
 * explain themselves and point at their items, the activity feed and the
 * agent pill follow edits as they land, the items list totals the price,
 * the 3D and Camera views start, and a render requested from the Renders
 * tab lands in its gallery.
 *
 * State is arranged through the backend (the trapdoor seed, then the public
 * mutations the MCP server uses); only the seam under test goes through the
 * UI.
 */

const SEEDED_PLACEMENTS = ["sofa", "coffee-table", "rug"]

test("the plan draws every placement of the seeded layout", async ({
  page,
  livingRoom,
}) => {
  await openWorkspace(page, livingRoom)

  // core's drawing: one item group per placement…
  const drawn = planDrawing(page)
  await expect(drawn).toHaveCount(SEEDED_PLACEMENTS.length)
  await expect
    .poll(async () =>
      (
        await drawn.evaluateAll((groups) =>
          groups.map((g) => g.getAttribute("data-placement-id"))
        )
      ).sort()
    )
    .toEqual([...SEEDED_PLACEMENTS].sort())
  // …and the interactive hit layer over it, one per placement too.
  await expect(planHits(page)).toHaveCount(SEEDED_PLACEMENTS.length)
  for (const id of SEEDED_PLACEMENTS) {
    await expect(planHit(page, id)).toHaveCount(1)
  }

  const caption = page.locator('[data-slot="stage-caption"]')
  await expect(caption).toContainText("Living room")
  await expect(caption).toContainText("Starter")
  await expect(inspectorTab(page, "Issues")).toBeVisible()
  await expect(page.getByText("No issues")).toBeVisible()
})

test("the rail switches between layouts", async ({ page, livingRoom }) => {
  // A second layout, made the way the agent makes one: a fork of Starter
  // with the sofa removed.
  const { layoutId: forkId } = await convex.mutation(api.layouts.create, {
    roomId: livingRoom.roomId,
    name: "Without the sofa",
    fromLayoutId: livingRoom.layoutId,
    actor: "agent",
  })
  await convex.mutation(api.layouts.applyChanges, {
    layoutId: forkId,
    ops: [{ op: "remove", id: "sofa" }],
    actor: "agent",
  })

  await openWorkspace(page, livingRoom)
  const starter = layoutCard(page, livingRoom.layoutId)
  const fork = layoutCard(page, forkId)
  await expect(starter).toHaveAttribute("data-selected", "true")
  await expect(fork).not.toHaveAttribute("data-selected")
  await expect(planHits(page)).toHaveCount(3)

  await fork
    .getByRole("button", { name: "Without the sofa", exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`[?&]layout=${forkId}`))
  await expect(fork).toHaveAttribute("data-selected", "true")
  await expect(starter).not.toHaveAttribute("data-selected")
  await expect(page.locator('[data-slot="stage-caption"]')).toContainText(
    "Without the sofa"
  )
  await expect(planHits(page)).toHaveCount(2)
  await expect(planHit(page, "sofa")).toHaveCount(0)
  await expect(planDrawing(page)).toHaveCount(2)

  await starter.getByRole("button", { name: "Starter", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`[?&]layout=${livingRoom.layoutId}`))
  await expect(planHits(page)).toHaveCount(3)
})

test("a new layout from the rail starts empty and opens", async ({
  page,
  livingRoom,
}) => {
  await openWorkspace(page, livingRoom)
  await page.getByRole("button", { name: "New layout" }).click()

  await expect(page).not.toHaveURL(
    new RegExp(`[?&]layout=${livingRoom.layoutId}`)
  )
  const layouts = await convex.query(api.layouts.listByRoom, {
    roomId: livingRoom.roomId,
  })
  const created = layouts.find((l) => l.name === "Untitled layout")
  expect(created).toMatchObject({ status: "draft", placementCount: 0 })
  await expect(page).toHaveURL(new RegExp(`[?&]layout=${created!._id}`))
  await expect(layoutCard(page, created!._id)).toHaveAttribute(
    "data-selected",
    "true"
  )
  await expect(planHits(page)).toHaveCount(0)
  await inspectorTab(page, "Items").click()
  await expect(page.getByText("Nothing placed yet")).toBeVisible()
  // The user made it, so the agent pill stays idle.
  await expect(agentStatus(page)).toHaveText("Agent idle")
})

test("an overlap shows up as E001 and hovering it highlights both items", async ({
  page,
  livingRoom,
}) => {
  // The agent puts a dining table straight through the sofa.
  const { layoutId } = await convex.mutation(api.layouts.create, {
    roomId: livingRoom.roomId,
    name: "Overlap",
    fromLayoutId: livingRoom.layoutId,
    actor: "agent",
  })
  const sofa = (await convex.query(api.layouts.get, {
    layoutId,
  }))!.placements.find((p) => p.id === "sofa")!
  const { lint } = await convex.mutation(api.layouts.applyChanges, {
    layoutId,
    ops: [
      {
        op: "add",
        id: "dining-table",
        asset: "generic-dining-table",
        position: { mode: "at", x: sofa.x + 400, z: sofa.z, facing: 90 },
      },
    ],
    actor: "agent",
  })
  const overlap = lint.issues.find(
    (issue) =>
      issue.code === "E001" &&
      issue.placementIds.includes("sofa") &&
      issue.placementIds.includes("dining-table")
  )
  expect(overlap, "the backend reports the overlap").toBeDefined()

  await openWorkspace(page, { roomId: livingRoom.roomId, layoutId })
  await inspectorTab(page, "Issues").click()
  const row = page.locator('[data-slot="issue-row"][data-code="E001"]', {
    hasText: overlap!.message,
  })
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute("data-severity", "error")
  await expect(row.locator('[data-placement-id="sofa"]')).toBeVisible()
  await expect(row.locator('[data-placement-id="dining-table"]')).toBeVisible()
  if (overlap!.hint) await expect(row).toContainText(overlap!.hint)

  // Nothing is highlighted until the issue is hovered…
  await expect(planView(page).locator("[data-hovered]")).toHaveCount(0)
  await row.hover()
  await expect(planHit(page, "sofa")).toHaveAttribute("data-hovered", "true")
  await expect(planHit(page, "dining-table")).toHaveAttribute(
    "data-hovered",
    "true"
  )
  await expect(planHit(page, "coffee-table")).not.toHaveAttribute(
    "data-hovered"
  )
  // …and selecting it washes both items in the issue's severity.
  await row.click()
  await expect(row).toHaveAttribute("aria-pressed", "true")
  await expect(planHit(page, "sofa")).toHaveAttribute(
    "data-highlighted",
    "true"
  )
  await expect(planHit(page, "dining-table")).toHaveAttribute(
    "data-highlighted",
    "true"
  )
  // Moving off the list clears the hover outline.
  await page.locator('[data-slot="stage-caption"]').hover()
  await expect(planView(page).locator("[data-hovered]")).toHaveCount(0)
})

test("agent edits stream into the activity feed and light the agent pill", async ({
  page,
  livingRoom,
}) => {
  await openWorkspace(page, livingRoom)
  await expect(agentStatus(page)).toHaveText("Agent idle")
  await inspectorTab(page, "Activity").click()
  const feed = page.getByRole("list", { name: "Activity" })
  await expect(feed).toBeVisible()
  const entries = feed.locator(":scope > li")
  const before = await entries.count()
  await expect(feed.locator('li[data-actor="agent"]')).toHaveCount(0)

  // The agent nudges the coffee table while the page is open.
  const result = await convex.mutation(api.layouts.applyChanges, {
    layoutId: livingRoom.layoutId,
    ops: [{ op: "nudge", id: "coffee-table", dz: 200 }],
    actor: "agent",
  })
  const summary = result.changes[0]!.summary

  // No reload: the live queries carry it in.
  const newest = entries.first()
  await expect(newest).toHaveAttribute("data-actor", "agent")
  await expect(newest).toContainText(summary)
  await expect(
    newest.getByText(`r${result.revision}`, { exact: true })
  ).toBeVisible()
  await expect(entries).toHaveCount(before + 1)
  await expect(agentStatus(page)).toHaveAttribute("data-active", "true")
  await expect(agentStatus(page)).toHaveText("Agent active")
  await expect(
    layoutCard(page, livingRoom.layoutId).getByText(`r${result.revision}`, {
      exact: true,
    })
  ).toBeVisible()
  await expect(stageRevision(page)).toHaveAttribute(
    "data-revision",
    String(result.revision)
  )
})

test("3D and Camera views start a canvas", async ({ page, livingRoom }) => {
  await openWorkspace(page, livingRoom)
  await expect(stageCanvas(page)).toHaveCount(0)

  await viewMode(page, "3D").click()
  await expect(viewMode(page, "3D")).toHaveAttribute("aria-checked", "true")
  await expect(stageCanvas(page)).toBeVisible()
  await expect(page.locator("[data-room-viewer]")).toBeVisible()

  await viewMode(page, "Camera").click()
  await expect(stageCanvas(page)).toBeVisible()
  const camera = page.getByRole("combobox", { name: "Camera" })
  await expect(camera).toHaveText("From the kitchen door")
  await camera.click()
  await page.getByRole("option", { name: "From the hall door" }).click()
  await expect(camera).toHaveText("From the hall door")
  await expect(stageCanvas(page)).toBeVisible()

  // Give the renderer a few frames to report problems (WebGL, shaders)
  // before the console guard checks.
  await page.waitForTimeout(500)
  await viewMode(page, "Plan").click()
  await expect(planView(page)).toBeVisible()
  await expect(stageCanvas(page)).toHaveCount(0)
})

test("the Items tab lists every piece and totals the price live", async ({
  page,
  livingRoom,
}) => {
  const { assetId } = await convex.mutation(api.assets.create, OAK_SIDEBOARD)

  await openWorkspace(page, livingRoom)
  await inspectorTab(page, "Items").click()
  const rows = page.locator('[data-slot="item-row"]')
  await expect(rows).toHaveCount(3)
  for (const id of SEEDED_PLACEMENTS) {
    await expect(
      page.locator(`[data-slot="item-row"][data-placement-id="${id}"]`)
    ).toBeVisible()
  }
  const total = page.locator('[data-slot="item-total"]')
  await expect(total).toContainText("3 items · 3 unpriced")

  await convex.mutation(api.layouts.applyChanges, {
    layoutId: livingRoom.layoutId,
    ops: [
      {
        op: "add",
        id: "sideboard",
        asset: assetId,
        position: { mode: "against", wall: "W2", at: 1500 },
      },
    ],
    actor: "agent",
  })
  await expect(rows).toHaveCount(4)
  await expect(
    page.locator('[data-slot="item-row"][data-placement-id="sideboard"]')
  ).toContainText(OAK_SIDEBOARD.name)
  await expect(total).toContainText("4 items · 3 unpriced")
  await expect(total.locator('[data-slot="price"]')).toHaveText(
    OAK_SIDEBOARD_PRICE
  )
  await expect(inspectorTab(page, "Items")).toContainText("4")
})

test("the Renders tab starts a render and shows it when it lands", async ({
  page,
  livingRoom,
}) => {
  await openWorkspace(page, livingRoom)
  await inspectorTab(page, "Renders").click()
  await expect(page.getByText("No renders yet")).toBeVisible()

  // The free stub model, so this never costs anything whatever the server's
  // config (e2e runs with PHOTOREAL_STUB=1 anyway).
  await page.getByRole("combobox", { name: "Model" }).click()
  await page.getByRole("option", { name: "stub renderer" }).click()
  await expect(page.getByRole("combobox", { name: "Camera" })).toHaveText(
    "From the kitchen door"
  )
  await page.getByRole("button", { name: "Render photoreal" }).click()
  await expect(
    toast(page, "Rendering from From the kitchen door")
  ).toBeVisible()

  // The record appears (pending, then done) through the live query.
  const card = page.locator('[data-slot="render-card"]')
  await expect(card).toHaveCount(1)
  await expect(card).toHaveAttribute("data-status", "done", {
    timeout: 60_000,
  })
  const [render] = await convex.query(api.renders.listByLayout, {
    layoutId: livingRoom.layoutId,
  })
  expect(render).toMatchObject({
    kind: "photoreal",
    status: "done",
    model: "stub",
    quality: "low",
  })
  await expect(inspectorTab(page, "Renders")).toContainText("1")

  // Finished renders open in the lightbox.
  await card.getByRole("button", { name: /^Open .* render$/ }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
})
