import { describe, expect, it } from "vitest"

import {
  buildFixtureScene,
  FIXTURE_ASSETS,
  FIXTURE_CAMERAS,
  FIXTURE_PLACEMENTS,
} from "../fixture-scene"

describe("FIXTURE_PLACEMENTS", () => {
  it("uses unique ids and only known assets", () => {
    const ids = FIXTURE_PLACEMENTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of FIXTURE_PLACEMENTS)
      expect(FIXTURE_ASSETS).toHaveProperty(p.assetId)
  })

  it("stands the sofa with its back on the skirting of W6, facing into the room", () => {
    const sofa = FIXTURE_PLACEMENTS.find((p) => p.id === "sofa")!
    expect(sofa.facing).toBe(90)
    expect(sofa.x - FIXTURE_ASSETS["test-sofa"].dims.d / 2).toBe(18)
  })

  it("hangs the pendant from the ceiling", () => {
    const pendant = FIXTURE_PLACEMENTS.find((p) => p.id === "pendant")!
    expect(pendant.elevation + FIXTURE_ASSETS["test-pendant"].dims.h).toBe(2450)
  })
})

describe("buildFixtureScene", () => {
  it("defaults to a 1536 × 1024 clay render", () => {
    const scene = buildFixtureScene({
      view: { kind: "camera", camera: FIXTURE_CAMERAS.fromDoor },
    })
    expect(scene).toMatchObject({ pass: "clay", width: 1536, height: 1024 })
    expect(scene).not.toHaveProperty("showCeiling")
  })

  it("passes the pass, size and ceiling through", () => {
    const scene = buildFixtureScene({
      view: { kind: "top" },
      pass: "id",
      width: 800,
      height: 600,
      showCeiling: false,
    })
    expect(scene).toMatchObject({
      pass: "id",
      width: 800,
      height: 600,
      showCeiling: false,
    })
  })
})
