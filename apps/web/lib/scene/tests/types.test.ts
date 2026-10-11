import { describe, expect, it } from "vitest"

import { buildFixtureScene, FIXTURE_CAMERAS } from "../fixture-scene"
import {
  showsCeiling,
  toMetres,
  zRenderAssetScene,
  zRenderScene,
} from "../types"

const scene = buildFixtureScene({
  view: { kind: "camera", camera: FIXTURE_CAMERAS.fromDoor },
})

describe("zRenderScene", () => {
  it("accepts the fixture scene", () => {
    expect(zRenderScene.safeParse(scene).success).toBe(true)
  })

  it("names a placement whose asset is missing", () => {
    const assets = Object.fromEntries(
      Object.entries(scene.assets).filter(([id]) => id !== "test-sofa")
    )
    const result = zRenderScene.safeParse({ ...scene, assets })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Placement "sofa" uses asset "test-sofa", which is not in `assets`',
    ])
  })

  it("rejects sizes outside 16–4096 px and fractional sizes", () => {
    expect(zRenderScene.safeParse({ ...scene, width: 8 }).success).toBe(false)
    expect(zRenderScene.safeParse({ ...scene, height: 5000 }).success).toBe(
      false
    )
    expect(zRenderScene.safeParse({ ...scene, width: 100.5 }).success).toBe(
      false
    )
  })

  it("rejects unknown passes and views", () => {
    expect(zRenderScene.safeParse({ ...scene, pass: "normal" }).success).toBe(
      false
    )
    expect(
      zRenderScene.safeParse({ ...scene, view: { kind: "fisheye" } }).success
    ).toBe(false)
  })
})

describe("zRenderAssetScene", () => {
  it("accepts a preview request and rejects unknown views", () => {
    const asset = scene.assets["test-sofa"]!
    expect(
      zRenderAssetScene.safeParse({
        asset,
        view: "iso",
        width: 512,
        height: 512,
      }).success
    ).toBe(true)
    expect(
      zRenderAssetScene.safeParse({
        asset,
        view: "back",
        width: 512,
        height: 512,
      }).success
    ).toBe(false)
  })
})

describe("showsCeiling", () => {
  it("defaults to on for room cameras and off for top and orbit views", () => {
    expect(showsCeiling(scene)).toBe(true)
    expect(showsCeiling({ view: { kind: "top" } })).toBe(false)
    expect(showsCeiling({ view: { kind: "orbit" } })).toBe(false)
  })

  it("follows an explicit choice", () => {
    expect(showsCeiling({ ...scene, showCeiling: false })).toBe(false)
    expect(showsCeiling({ view: { kind: "top" }, showCeiling: true })).toBe(
      true
    )
  })
})

describe("toMetres", () => {
  it("divides exactly", () => {
    expect(toMetres(350)).toBe(0.35)
  })
})
