import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
  LIVING_ROOM_MEASUREMENTS,
  LIVING_ROOM_SKIRTING,
} from "@roomer/core/fixtures"
import {
  ID_PASS_PALETTE,
  type AssetSpec,
  type Feature,
  type LayoutOp,
  type LintReport,
  type Placement,
  type ShellOp,
} from "@roomer/core/schema"

import type { Id } from "@roomer/backend/convex/_generated/dataModel"

import { api, convex, expect, test } from "../fixtures"
import { connectMcp, type RoomerMcp } from "../fixtures/mcp"
import { countColours, distinctColours, pngSize } from "../fixtures/png"
import { inspectorTab, openWorkspace } from "../fixtures/workspace"

/**
 * The agent's whole loop over MCP, with the real client against the e2e
 * server: list the tools, measure a room by walking its walls, add a
 * radiator, build a product from parts (and look at its previews), lay it
 * out, hit an overlap and fix it, look at the plan and the clay + id views,
 * paint a (stub) photoreal render, and read it all back — then the human
 * sees that render in the workspace.
 *
 * One test, in steps: each step needs the ids the previous one returned,
 * exactly as an agent's session does.
 */

const EXPECTED_TOOLS = [
  "get_overview",
  "get_room",
  "create_room",
  "set_room_shell",
  "apply_shell_changes",
  "add_room_photos",
  "list_cameras",
  "set_camera",
  "search_assets",
  "get_asset",
  "create_asset",
  "update_asset",
  "preview_asset",
  "add_asset_images",
  "list_layouts",
  "get_layout",
  "create_layout",
  "update_layout",
  "apply_changes",
  "lint_layout",
  "render_plan",
  "render_view",
  "render_photoreal",
  "list_renders",
]

const ROOM_NAME = "Lounge (measured over MCP)"
const LAYOUT_NAME = "Sofa on the long wall"

/** The radiator the room is created without, added as a shell change. */
const RADIATOR = LIVING_ROOM_FEATURES.find((f) => f.type === "radiator")!

/** A round side table: three cylinders, 500 × 500 × 550mm. */
const SIDE_TABLE: AssetSpec = {
  name: "Round oak side table",
  category: "table",
  mount: "floor",
  dims: { w: 500, d: 500, h: 550 },
  description: "Round oak side table on a slim pedestal.",
  product: {
    url: "https://example.com/products/round-oak-side-table",
    retailer: "Example Interiors",
    price: 249,
    currency: "GBP",
    dimsSource: "listing",
  },
  geometry: {
    kind: "parts",
    parts: [
      // base: y 0..20
      {
        shape: "cylinder",
        name: "base",
        position: [0, 10, 0],
        radiusTop: 180,
        radiusBottom: 180,
        height: 20,
        tone: "dark",
      },
      // stem: y 20..520
      {
        shape: "cylinder",
        name: "stem",
        position: [0, 270, 0],
        radiusTop: 25,
        radiusBottom: 25,
        height: 500,
        tone: "dark",
      },
      // top: y 520..550, the full 500mm across
      {
        shape: "cylinder",
        name: "top",
        position: [0, 535, 0],
        radiusTop: 250,
        radiusBottom: 250,
        height: 30,
      },
    ],
  },
}

/** Preview renders are square (apps/web/server/render/headless-renderer.ts). */
const PREVIEW_SIZE = { width: 768, height: 768 }
/** The plan PNG's longest side by default (apps/web/server/render/plan-png.ts). */
const PLAN_MAX_SIDE = 1400

function issuesOf(lint: LintReport, code: string) {
  return lint.issues.filter((issue) => issue.code === code)
}

test("an agent builds, checks and renders a layout over MCP", async ({
  page,
  livingRoom,
}) => {
  test.setTimeout(300_000)
  // The seed supplies the starter library (generic-sofa and friends); the
  // room itself is measured over MCP.
  void livingRoom
  let mcp: RoomerMcp | undefined
  try {
    mcp = await connectMcp()
    const agent = mcp

    await test.step("the server lists its tools and an agent guide", async () => {
      const { tools } = await agent.client.listTools()
      const names = tools.map((tool) => tool.name)
      expect(names).toEqual(expect.arrayContaining(EXPECTED_TOOLS))
      for (const tool of tools) {
        expect(tool.description, `${tool.name} has a description`).toBeTruthy()
        expect(tool.inputSchema.type).toBe("object")
      }
      expect(agent.client.getInstructions()).toMatch(/guide for AI agents/)
    })

    const roomId =
      await test.step("create_room solves a walked outline", async () => {
        const result = await agent.ok("create_room", {
          name: ROOM_NAME,
          ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
          measurements: LIVING_ROOM_MEASUREMENTS,
          skirting: LIVING_ROOM_SKIRTING,
          features: LIVING_ROOM_FEATURES.filter((f) => f.id !== RADIATOR.id),
          finishes: LIVING_ROOM_FINISHES,
        })
        const created = result.structured.created as {
          corners: number[][]
          solve: { residualMm: number }
        }
        expect(created.corners).toEqual(LIVING_ROOM_CORNERS)
        expect(created.solve.residualMm).toBe(0)
        expect(result.text).toContain(`Created room "${ROOM_NAME}"`)
        // The plan comes back by default.
        expect(result.images).toHaveLength(1)
        expect(result.images[0]!.mimeType).toBe("image/png")
        pngSize(result.images[0]!.data)
        return result.structured.roomId as Id<"rooms">
      })

    await test.step("apply_shell_changes adds a radiator", async () => {
      const ops = [{ op: "addFeature", feature: RADIATOR }] satisfies ShellOp[]
      const result = await agent.ok("apply_shell_changes", { roomId, ops })
      expect(result.text).toContain("Applied 1 room change")
      const room = (await agent.ok("get_room", { roomId })).structured.room as {
        features: Feature[]
      }
      expect(room.features.map((f) => f.id)).toContain(RADIATOR.id)
      expect(room.features).toHaveLength(LIVING_ROOM_FEATURES.length)
    })

    const tableKey =
      await test.step("create_asset returns four clay previews", async () => {
        const result = await agent.ok("create_asset", {
          key: "e2e-round-oak-side-table",
          spec: SIDE_TABLE,
        })
        expect(result.text).toContain(`Created asset "${SIDE_TABLE.name}"`)
        expect(result.images).toHaveLength(4)
        for (const image of result.images) {
          expect(image.mimeType).toBe("image/png")
          expect(pngSize(image.data)).toEqual(PREVIEW_SIZE)
        }
        // The previews were stored on the asset too.
        const stored = await convex.query(api.assets.getByKey, {
          key: "e2e-round-oak-side-table",
        })
        expect(stored?.previewUrls.map((p) => p.view).sort()).toEqual([
          "front",
          "iso",
          "side",
          "top",
        ])
        return result.structured.key as string
      })

    const layoutId =
      await test.step("create_layout makes an empty layout", async () => {
        const result = await agent.ok("create_layout", {
          roomId,
          name: LAYOUT_NAME,
          notes:
            "Sofa against W6 facing the window wall, side table beside it.",
        })
        expect((result.structured.lint as LintReport).ok).toBe(true)
        return result.structured.layoutId as Id<"layouts">
      })

    await test.step("apply_changes reports an overlap as E001", async () => {
      const ops = [
        {
          op: "add",
          id: "sofa",
          asset: "generic-sofa",
          position: { mode: "against", wall: "W6", at: 3700 },
        },
        {
          op: "add",
          id: "coffee-table",
          asset: "generic-coffee-table",
          position: { mode: "centerOn", placement: "sofa", dx: 1175 },
        },
        // Dropped straight onto the sofa.
        {
          op: "add",
          id: "side-table",
          asset: tableKey,
          position: { mode: "centerOn", placement: "sofa" },
        },
      ] satisfies LayoutOp[]
      const result = await agent.ok("apply_changes", { layoutId, ops })
      const lint = result.structured.lint as LintReport
      expect(lint.ok).toBe(false)
      const overlaps = issuesOf(lint, "E001")
      expect(overlaps).toHaveLength(1)
      expect([...overlaps[0]!.placementIds].sort()).toEqual([
        "side-table",
        "sofa",
      ])
      // The agent reads the code, the message and the hint.
      expect(result.text).toContain("E001")
      expect(result.text).toContain(overlaps[0]!.message)
    })

    await test.step("apply_changes fixes it: lint is ok", async () => {
      // Beside the sofa instead: the sofa spans 2,600–4,800mm along W6, so
      // the 500mm table goes at 2,300 (50mm clear of it).
      const ops = [
        {
          op: "move",
          id: "side-table",
          position: { mode: "against", wall: "W6", at: 2300 },
        },
      ] satisfies LayoutOp[]
      const result = await agent.ok("apply_changes", { layoutId, ops })
      const lint = result.structured.lint as LintReport
      expect(issuesOf(lint, "E001")).toEqual([])
      expect(lint.counts.error).toBe(0)
      expect(lint.ok).toBe(true)
      expect(result.structured.revision).toBe(2)
      // Server truth agrees.
      const stored = await convex.query(api.layouts.get, {
        layoutId,
      })
      expect(stored?.lint.ok).toBe(true)
      expect(stored?.placements.map((p) => p.id)).toEqual([
        "sofa",
        "coffee-table",
        "side-table",
      ])
    })

    await test.step("render_plan returns the floor plan PNG", async () => {
      const result = await agent.ok("render_plan", { layoutId })
      expect(result.images).toHaveLength(1)
      const size = pngSize(result.images[0]!.data)
      expect(Math.max(size.width, size.height)).toBe(PLAN_MAX_SIDE)
      // The room is taller (z) than wide (x) on the plan.
      expect(size.height).toBeGreaterThan(size.width)
      expect(result.text).toContain(`layout "${LAYOUT_NAME}"`)
    })

    await test.step("render_view paints every placement its id colour", async () => {
      const width = 640
      const height = 960
      const result = await agent.ok("render_view", {
        layoutId,
        camera: "top",
        pass: "both",
        width,
        height,
      })
      expect(result.images).toHaveLength(2)
      const [clay, id] = result.images
      expect(pngSize(clay!.data)).toEqual({ width, height })
      expect(pngSize(id!.data)).toEqual({ width, height })
      // Clay is shaded; the id pass is flat colour, no shading or blending.
      expect(distinctColours(clay!.data)).toBeGreaterThan(256)
      expect(distinctColours(id!.data)).toBeLessThan(32)

      // Placement i wears palette colour i; the legend says so, and the
      // flat, unantialiased id pass shows each colour verbatim.
      const layout = await convex.query(api.layouts.get, {
        layoutId,
      })
      const placements: Placement[] = layout!.placements
      const expected = placements.map((p, i) => ({
        id: p.id,
        ...ID_PASS_PALETTE[i % ID_PASS_PALETTE.length]!,
      }))
      for (const { id: placementId, name, hex } of expected) {
        expect(result.text).toContain(`${name} ${hex}: ${placementId}`)
      }
      const counts = countColours(
        id!.data,
        expected.map((e) => e.hex)
      )
      for (const { id: placementId, hex } of expected) {
        expect(
          counts[hex.toLowerCase()],
          `pixels of ${placementId}'s ${hex}`
        ).toBeGreaterThan(100)
      }
      const shares = result.structured.visibleShare as Record<string, number>
      for (const { id: placementId } of expected) {
        expect(shares[placementId]).toBeGreaterThan(0)
      }
    })

    const renderId =
      await test.step("render_photoreal (stub) stores a render", async () => {
        const result = await agent.ok("render_photoreal", {
          layoutId,
          camera: "from-d2",
          // Free and instant whatever the server's config: never a paid render.
          model: "stub",
          quality: "low",
          size: { width: 768, height: 512 },
        })
        expect(result.structured.model).toBe("stub")
        expect(result.structured.layoutRevision).toBe(2)
        expect(result.images).toHaveLength(1)
        expect(pngSize(result.images[0]!.data)).toEqual({
          width: 768,
          height: 512,
        })
        const id = result.structured.renderId as Id<"renders">
        const record = await convex.query(api.renders.get, {
          renderId: id,
        })
        expect(record).toMatchObject({
          kind: "photoreal",
          status: "done",
          model: "stub",
          layoutRevision: 2,
        })
        expect(record?.outputUrl).toBeTruthy()
        const listed = await agent.ok("list_renders", { layoutId })
        expect(listed.text).toContain(id)
        return id
      })

    await test.step("get_overview reflects everything", async () => {
      const result = await agent.ok("get_overview")
      expect(result.text).toContain(`Room "${ROOM_NAME}"`)
      expect(result.text).toContain(`"${LAYOUT_NAME}"`)
      const rooms = result.structured.rooms as {
        _id: string
        name: string
        featureCount: number
        layouts: {
          _id: string
          name: string
          revision: number
          placementCount: number
          lintCounts: LintReport["counts"]
          price: { amount: number }
        }[]
      }[]
      const room = rooms.find((r) => r._id === roomId)
      expect(room?.featureCount).toBe(LIVING_ROOM_FEATURES.length)
      expect(room?.layouts).toHaveLength(1)
      expect(room?.layouts[0]).toMatchObject({
        _id: layoutId,
        name: LAYOUT_NAME,
        revision: 2,
        placementCount: 3,
        lintCounts: { error: 0 },
        price: { amount: SIDE_TABLE.product!.price },
      })
      const assets = result.structured.assets as { custom: number }
      expect(assets.custom).toBe(1)
    })

    await test.step("the workspace's Renders tab shows the render", async () => {
      await openWorkspace(page, { roomId, layoutId })
      await inspectorTab(page, "Renders").click()
      const card = page.locator('[data-slot="render-card"]')
      await expect(card).toHaveCount(1)
      await expect(card).toHaveAttribute("data-status", "done")
      await expect(
        card.getByRole("button", { name: /^Open .* render$/ })
      ).toBeEnabled()
      await expect(inspectorTab(page, "Renders")).toContainText("1")
      void renderId
    })
  } finally {
    await mcp?.close()
  }
})

test("tool errors explain themselves to the agent", async ({ livingRoom }) => {
  const mcp = await connectMcp()
  try {
    // A feature on a wall the room doesn't have.
    const shell = await mcp.call("apply_shell_changes", {
      roomId: livingRoom.roomId,
      ops: [
        { op: "addFeature", feature: { ...RADIATOR, id: "RAD2", wall: "W99" } },
      ] satisfies ShellOp[],
    })
    expect(shell.isError).toBe(true)
    expect(shell.text).toContain("W99")
    expect(shell.text).toContain("W1, W2, W3, W4, W5, W6")
    expect(shell.text).toMatch(/Nothing in this batch was applied/)
    expect(shell.structured.error).toMatchObject({ code: "INVALID_OP" })

    // Furniture against a wall the room doesn't have.
    const layout = await mcp.call("apply_changes", {
      layoutId: livingRoom.layoutId,
      ops: [
        {
          op: "add",
          asset: "generic-sofa",
          position: { mode: "against", wall: "W42", at: 1000 },
        },
      ] satisfies LayoutOp[],
    })
    expect(layout.isError).toBe(true)
    expect(layout.text).toContain("Wall W42 doesn't exist")
    expect(layout.text).toContain("W1–W6")
    expect(layout.structured.error).toMatchObject({
      code: "INVALID_OP",
      opIndex: 0,
    })

    // A room id where a layout id belongs.
    const wrongId = await mcp.call("get_layout", {
      layoutId: livingRoom.roomId,
    })
    expect(wrongId.isError).toBe(true)
    expect(wrongId.text).toContain("is a room id, not a layout id")

    // Nothing was applied by any of them.
    const room = await convex.query(api.rooms.get, {
      roomId: livingRoom.roomId,
    })
    expect(room?.features.some((f) => f.id === "RAD2")).toBe(false)
    const stored = await convex.query(api.layouts.get, {
      layoutId: livingRoom.layoutId,
    })
    expect(stored?.placements).toHaveLength(3)
    expect(stored?.revision).toBe(1)
  } finally {
    await mcp.close()
  }
})
