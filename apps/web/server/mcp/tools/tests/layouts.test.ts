import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import {
  fakeDeps,
  imagesOf,
  LAYOUT_ID,
  layoutDetail,
  LINT_WITH_ERROR,
  ROOM_ID,
  textOf,
} from "../../tests/fakes"
import {
  applyChanges,
  createLayout,
  getLayout,
  lintLayout,
  listLayouts,
  updateLayout,
} from "../layouts"

describe("list_layouts / get_layout", () => {
  it("lists a room's layouts", async () => {
    const deps = fakeDeps()
    const text = textOf(await listLayouts.call({ roomId: ROOM_ID }, deps))
    expect(text).toMatch(/^Layouts \(1\):\n- "Starter" — id /)
  })

  it("details placements with their wall relations and the lint report", async () => {
    const deps = fakeDeps()
    const result = await getLayout.call({ layoutId: LAYOUT_ID }, deps)
    const text = textOf(result)
    expect(text).toContain('room "Living room"')
    expect(text).toMatch(/- sofa: Generic sofa \[generic-sofa\]/)
    expect(text).toContain("back against W6")
    expect(text).toContain("Errors (must fix):")
    expect(imagesOf(result)).toBe(0)
    const withPlan = await getLayout.call(
      { layoutId: LAYOUT_ID, includePlan: true },
      deps
    )
    expect(imagesOf(withPlan)).toBe(1)
  })

  it("explains a missing layout", async () => {
    const deps = fakeDeps()
    deps.api.layouts.get.mockResolvedValueOnce(null)
    const result = await getLayout.call({ layoutId: "gone" }, deps)
    expect(textOf(result)).toBe(
      "Error NOT_FOUND: There's no layout with id gone. get_overview and list_layouts list them."
    )
  })
})

describe("create_layout / update_layout", () => {
  it("creates as the agent, copying when asked", async () => {
    const deps = fakeDeps()
    const result = await createLayout.call(
      {
        roomId: ROOM_ID,
        name: "Window sofa",
        fromLayoutId: LAYOUT_ID,
        notes: "Try it",
      },
      deps
    )
    expect(deps.api.layouts.create).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      name: "Window sofa",
      fromLayoutId: LAYOUT_ID,
      notes: "Try it",
      actor: "agent",
    })
    expect(textOf(result)).toContain(`as a copy of ${LAYOUT_ID} (3 items)`)
    expect(textOf(result)).toContain("Lint: clean")
  })

  it("updates fields as the agent, including clearing finishes", async () => {
    const deps = fakeDeps()
    const result = await updateLayout.call(
      {
        layoutId: LAYOUT_ID,
        status: "candidate",
        finishes: null,
        expectedRevision: 3,
      },
      deps
    )
    expect(deps.api.layouts.update).toHaveBeenCalledWith({
      layoutId: LAYOUT_ID,
      status: "candidate",
      finishes: null,
      expectedRevision: 3,
      actor: "agent",
    })
    expect(textOf(result)).toBe(
      `Updated status, finishes — layout ${LAYOUT_ID} is at revision 4.`
    )
  })
})

describe("apply_changes", () => {
  const ops = [
    {
      op: "move",
      id: "coffee-table",
      position: { mode: "centerOn", placement: "sofa", dx: 1200 },
    },
  ]

  it("applies as the agent and shows where touched items ended up", async () => {
    const deps = fakeDeps()
    const result = await applyChanges.call({ layoutId: LAYOUT_ID, ops }, deps)
    expect(deps.api.layouts.applyChanges).toHaveBeenCalledWith({
      layoutId: LAYOUT_ID,
      ops,
      actor: "agent",
    })
    const text = textOf(result)
    expect(text).toContain(
      "Applied 1 change → revision 4.\n- Moved coffee-table 130mm right"
    )
    expect(text).toContain("Now:\n- coffee-table: Generic coffee table")
    expect(text).not.toContain("- sofa:")
    expect(text).toContain("Lint: clean")
    expect(imagesOf(result)).toBe(0)
  })

  it("lists lint errors first and adds the plan on request", async () => {
    const deps = fakeDeps()
    deps.api.layouts.applyChanges.mockResolvedValueOnce({
      revision: 5,
      changes: [
        {
          index: 0,
          op: "move",
          id: "coffee-table",
          summary: "Moved coffee-table",
        },
      ],
      lint: LINT_WITH_ERROR,
      placements: layoutDetail().placements,
    })
    const result = await applyChanges.call(
      { layoutId: LAYOUT_ID, ops, includePlan: true, expectedRevision: 4 },
      deps
    )
    const text = textOf(result)
    expect(text.indexOf("E001")).toBeLessThan(text.indexOf("W103"))
    expect(imagesOf(result)).toBe(1)
    expect(deps.api.layouts.applyChanges).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 4 })
    )
  })

  it("relays op errors and conflicts", async () => {
    const deps = fakeDeps()
    deps.api.layouts.applyChanges.mockRejectedValueOnce(
      new ConvexError({
        code: "INVALID_OP",
        message:
          "ops[0] (move): no placement with id 'table'. Existing ids: sofa, coffee-table, rug.",
        opIndex: 0,
      })
    )
    const failed = await applyChanges.call({ layoutId: LAYOUT_ID, ops }, deps)
    expect(failed.isError).toBe(true)
    expect(textOf(failed)).toContain("Existing ids: sofa, coffee-table, rug.")
    expect(textOf(failed)).toContain("Nothing in this batch was applied")
    deps.api.layouts.applyChanges.mockRejectedValueOnce(
      new ConvexError({
        code: "CONFLICT",
        message:
          "Layout 'Starter' is at revision 5, not 4: it changed since you read it.",
      })
    )
    const conflict = await applyChanges.call(
      { layoutId: LAYOUT_ID, ops, expectedRevision: 4 },
      deps
    )
    expect(textOf(conflict)).toMatch(
      /^Error CONFLICT: Layout 'Starter' is at revision 5/
    )
  })

  it("names the exact field of a bad op or position", async () => {
    const deps = fakeDeps()
    const result = await applyChanges.call(
      {
        layoutId: LAYOUT_ID,
        ops: [
          {
            op: "add",
            asset: "generic-sofa",
            position: { mode: "against", wall: "W1" },
          },
          { op: "move", id: "sofa", position: { mode: "teleport" } },
        ],
      },
      deps
    )
    expect(textOf(result)).toBe(
      [
        "Error INVALID_INPUT: Invalid input (2 problems):",
        "- ops[0].position.at: Invalid input: expected number, received undefined",
        "- ops[1].position.mode: Invalid discriminator value. Expected 'at' | 'against' | 'onWall' | 'centerOn' | 'inCorner'",
      ].join("\n")
    )
    expect(deps.api.layouts.applyChanges).not.toHaveBeenCalled()
  })

  it("rejects an unknown op before calling the backend", async () => {
    const deps = fakeDeps()
    const result = await applyChanges.call(
      { layoutId: LAYOUT_ID, ops: [{ op: "teleport", id: "sofa" }] },
      deps
    )
    expect(result.isError).toBe(true)
    expect(deps.api.layouts.applyChanges).not.toHaveBeenCalled()
  })
})

describe("lint_layout", () => {
  it("returns the full report", async () => {
    const text = textOf(
      await lintLayout.call({ layoutId: LAYOUT_ID }, fakeDeps())
    )
    expect(text).toMatch(/^Layout "Starter" at revision 3\.\nLint: 1 error/)
    expect(text).toContain("I203")
  })
})
