import { describe, expect, it } from "vitest"

import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import { LIVING_ROOM_CORNERS, TEST_ASSETS } from "@roomer/core/fixtures"
import type { PlacementRelation } from "@roomer/core/placement"

import {
  activityEvents,
  assetSpecOf,
  defaultLayout,
  entityLabels,
  itemPosition,
  liveLayoutIds,
  roomStats,
  toAssetSummary,
  toRenderSummary,
} from "../view-models"

const counts = (error: number, warning = 0, info = 0) => ({
  error,
  warning,
  info,
})

describe("roomStats", () => {
  it("measures the living room's outline", () => {
    expect(
      roomStats({
        shell: { corners: LIVING_ROOM_CORNERS },
        ceilingHeight: 2450,
      })
    ).toEqual({
      widthMm: 2980,
      depthMm: 7690,
      areaMm2: 2980 * 7090 + 2170 * 600,
      ceilingHeightMm: 2450,
      wallCount: 6,
    })
  })
})

describe("liveLayoutIds", () => {
  const event = (actor: "agent" | "user" | "system", createdAt: number) => ({
    actor,
    createdAt,
  })
  const layouts = (
    entries: { id: string; latest: ReturnType<typeof event> | null }[]
  ) =>
    entries.map(({ id, latest }) => ({
      layoutId: id as Id<"layouts">,
      name: id,
      latest: latest
        ? {
            ...latest,
            _id: `${id}-e` as Id<"layoutEvents">,
            _creationTime: 0,
            layoutId: id as Id<"layouts">,
            revision: 1,
            summary: "",
            changes: [],
            lintCounts: counts(0),
            lintCountsBefore: counts(0),
          }
        : null,
    }))

  it("marks layouts the agent changed within the window", () => {
    const now = 1_000_000
    const live = liveLayoutIds(
      {
        layouts: layouts([
          { id: "a", latest: event("agent", now - 10_000) },
          { id: "b", latest: event("agent", now - 200_000) },
          { id: "c", latest: event("user", now - 1_000) },
          { id: "d", latest: null },
        ]),
      },
      now
    )
    expect([...live]).toEqual(["a"])
  })

  it("is empty while activity is loading", () => {
    expect(liveLayoutIds(undefined, 0).size).toBe(0)
  })
})

describe("defaultLayout", () => {
  it("picks the best status, then the most recent", () => {
    const pick = defaultLayout([
      { id: "d", status: "draft" as const, updatedAt: 9 },
      { id: "c1", status: "candidate" as const, updatedAt: 1 },
      { id: "c2", status: "candidate" as const, updatedAt: 5 },
      { id: "a", status: "archived" as const, updatedAt: 10 },
    ])
    expect(pick?.id).toBe("c2")
  })

  it("returns undefined for no layouts", () => {
    expect(defaultLayout([])).toBeUndefined()
  })
})

describe("itemPosition", () => {
  const relation = (touching: boolean): PlacementRelation => ({
    nearestWall: { wall: "W6", gapMm: 18, along: 2400, span: [1300, 3500] },
    touchingWalls: touching ? ["W6"] : [],
    facingDescription: "into the room",
  })

  it("reads items against a wall", () => {
    expect(itemPosition(relation(true), "floor")).toEqual({
      mode: "against",
      wall: "W6",
      along: 2400,
    })
  })

  it("reads wall-mounted items as on the wall", () => {
    expect(itemPosition(relation(true), "wall")?.mode).toBe("onWall")
  })

  it("has no wall readout for free-standing items", () => {
    expect(itemPosition(relation(false), "floor")).toBeUndefined()
    expect(itemPosition(undefined, "floor")).toBeUndefined()
  })
})

describe("entityLabels", () => {
  it("names placements by label, then asset name, and features by label", () => {
    const labels = entityLabels(
      {
        placements: [
          { id: "sofa", assetId: "a1", label: "Big sofa" },
          { id: "table", assetId: "a2" },
          { id: "ghost", assetId: "a9" },
        ],
        assets: { a2: { name: "Coffee table" } },
      },
      [{ id: "D1", label: "Kitchen door" }, { id: "S1" }]
    )
    expect(labels).toEqual({
      D1: "Kitchen door",
      sofa: "Big sofa",
      table: "Coffee table",
      ghost: "ghost",
    })
  })
})

describe("activityEvents", () => {
  it("takes each event's 'before' from the older event", () => {
    const row = (id: string, revision: number, error: number) => ({
      _id: id as Id<"layoutEvents">,
      actor: "agent" as const,
      summary: `rev ${revision}`,
      revision,
      createdAt: revision * 1000,
      lintCounts: counts(error),
    })
    const events = activityEvents([
      row("e3", 3, 0),
      row("e2", 2, 2),
      row("e1", 1, 1),
    ])
    expect(
      events.map((e) => [e.id, e.lintBefore?.error, e.lintAfter?.error])
    ).toEqual([
      ["e3", 2, 0],
      ["e2", 1, 2],
      ["e1", undefined, 1],
    ])
  })
})

describe("toRenderSummary", () => {
  const base = {
    _id: "r1" as Id<"renders">,
    status: "done" as const,
    view: {
      id: "from-d1",
      name: "From the kitchen door",
      position: [0, 1600, 0] as [number, number, number],
      target: [0, 1000, 3000] as [number, number, number],
      fov: 50,
    },
    createdAt: 5,
    layoutRevision: 3,
    model: undefined,
    durationMs: undefined,
    error: undefined,
  }
  const input = (role: "clay" | "id" | "reference", url: string) => ({
    role,
    storageId: `${role}-s` as Id<"_storage">,
    url,
  })

  it("maps a photoreal render with its passes", () => {
    const summary = toRenderSummary({
      ...base,
      kind: "photoreal",
      model: "openai/gpt-image-2.5-flare",
      outputUrl: "out.png",
      inputUrls: [
        input("clay", "clay.png"),
        input("id", "id.png"),
        input("reference", "ref.png"),
      ],
    })
    expect(summary).toMatchObject({
      id: "r1",
      kind: "photoreal",
      imageUrl: "out.png",
      clayUrl: "clay.png",
      idUrl: "id.png",
      cameraName: "From the kitchen door",
      model: "openai/gpt-image-2.5-flare",
    })
  })

  it("uses a clay pass's own image as its clay", () => {
    const summary = toRenderSummary({
      ...base,
      kind: "clay",
      outputUrl: "clay-out.png",
      inputUrls: [],
    })
    expect(summary).toMatchObject({
      imageUrl: "clay-out.png",
      clayUrl: "clay-out.png",
      idUrl: undefined,
    })
  })

  it("leaves URLs empty while pending", () => {
    const summary = toRenderSummary({
      ...base,
      kind: "photoreal",
      status: "pending",
      outputUrl: null,
      inputUrls: [{ ...input("clay", ""), url: null }],
    })
    expect(summary.imageUrl).toBeUndefined()
    expect(summary.clayUrl).toBeUndefined()
  })
})

describe("toAssetSummary", () => {
  const row = {
    _id: "a1" as Id<"assets">,
    key: "generic-sofa",
    name: "Generic sofa",
    category: "sofa" as const,
    mount: "floor" as const,
    dims: { w: 2200, d: 950, h: 820 },
    product: undefined,
    description: undefined,
  }

  it("prefers the product photo", () => {
    expect(
      toAssetSummary({
        ...row,
        primaryImageUrl: "photo.jpg",
        previewUrls: [{ view: "iso" as const, url: "iso.png" }],
      }).imageUrl
    ).toBe("photo.jpg")
  })

  it("falls back to the iso preview, then nothing", () => {
    expect(
      toAssetSummary({
        ...row,
        primaryImageUrl: null,
        previewUrls: [
          { view: "front" as const, url: "front.png" },
          { view: "iso" as const, url: "iso.png" },
        ],
      }).imageUrl
    ).toBe("iso.png")
    expect(
      toAssetSummary({ ...row, primaryImageUrl: null, previewUrls: [] })
        .imageUrl
    ).toBeUndefined()
  })
})

describe("assetSpecOf", () => {
  it("drops everything that isn't part of the spec", () => {
    const stored = {
      ...TEST_ASSETS.sofa,
      _id: "a1",
      key: "k",
      primaryImageUrl: null,
    }
    const spec = assetSpecOf(stored)
    expect(Object.keys(spec).sort()).toEqual(
      Object.keys(TEST_ASSETS.sofa).sort()
    )
  })
})
