import { ID_PASS_SHELL } from "@roomer/core"
import {
  DoubleSide,
  FrontSide,
  type Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
} from "three"
import { describe, expect, it } from "vitest"

import { createSceneMaterials, exactColor } from "../materials"
import { CLAY_TONES, ID_PASS_BACKGROUND } from "../palette"

/** The 0–255 bytes a material colour writes with a linear output. */
function bytes(material: Material): number[] {
  if (!(material instanceof MeshBasicMaterial)) throw new Error("not basic")
  return material.color.toArray().map((v) => Math.round(v * 255))
}

describe("exactColor", () => {
  it("stores hex / 255 without an sRGB conversion", () => {
    const c = exactColor("#e6194b")
    expect([c.r, c.g, c.b]).toEqual([230 / 255, 25 / 255, 75 / 255])
  })
})

describe("createSceneMaterials — id pass", () => {
  const materials = createSceneMaterials("id")

  it("paints placement i its palette colour, flat and untone-mapped", () => {
    const sofa = materials.part({ tone: "light", placementIndex: 0 })
    expect(sofa).toBeInstanceOf(MeshBasicMaterial)
    expect(bytes(sofa)).toEqual([230, 25, 75])
    expect(sofa.toneMapped).toBe(false)
    expect(bytes(materials.part({ tone: "dark", placementIndex: 3 }))).toEqual([
      0x43, 0x63, 0xd8,
    ])
  })

  it("ignores tone and interaction state", () => {
    expect(
      materials.part({ tone: "dark", placementIndex: 0, state: "selected" })
    ).toBe(materials.part({ tone: "light", placementIndex: 0 }))
  })

  it("paints the shell in core's shell colours and the background as an opening", () => {
    expect(bytes(materials.shell("wall"))).toEqual([0xd9, 0xd9, 0xd9])
    expect(bytes(materials.shell("floor"))).toEqual([0x8c, 0x8c, 0x8c])
    expect(materials.background.getHexString(undefined)).toBe(
      ID_PASS_BACKGROUND.slice(1)
    )
    expect(ID_PASS_BACKGROUND).toBe(ID_PASS_SHELL.openings)
  })

  it("keeps lathes double-sided", () => {
    expect(
      materials.part({ tone: undefined, placementIndex: 1, doubleSided: true })
        .side
    ).toBe(DoubleSide)
  })
})

describe("createSceneMaterials — clay pass", () => {
  const materials = createSceneMaterials("clay")

  it("shades parts by tone in matte warm greys, mid by default", () => {
    const light = materials.part({ tone: "light", placementIndex: 0 })
    expect(light).toBeInstanceOf(MeshStandardMaterial)
    expect((light as MeshStandardMaterial).color.getHexString()).toBe(
      CLAY_TONES.light.slice(1)
    )
    expect((light as MeshStandardMaterial).roughness).toBeGreaterThan(0.8)
    const unset = materials.part({ tone: undefined, placementIndex: 4 })
    expect((unset as MeshStandardMaterial).color.getHexString()).toBe(
      CLAY_TONES.mid.slice(1)
    )
  })

  it("shares one material per tone across placements", () => {
    expect(materials.part({ tone: "dark", placementIndex: 0 })).toBe(
      materials.part({ tone: "dark", placementIndex: 9 })
    )
  })

  it("tints selected and hovered items", () => {
    const normal = materials.part({
      tone: "mid",
      placementIndex: 0,
    }) as MeshStandardMaterial
    const selected = materials.part({
      tone: "mid",
      placementIndex: 0,
      state: "selected",
    }) as MeshStandardMaterial
    const hovered = materials.part({
      tone: "mid",
      placementIndex: 0,
      state: "hovered",
    }) as MeshStandardMaterial
    expect(selected.color.equals(normal.color)).toBe(false)
    expect(selected.emissiveIntensity).toBeGreaterThan(0)
    expect(hovered.color.equals(normal.color)).toBe(false)
  })

  it("draws glass as unlit daylight", () => {
    const glass = materials.shell("glass")
    expect(glass).toBeInstanceOf(MeshBasicMaterial)
    expect(glass.side).toBe(FrontSide)
  })
})

describe("createSceneMaterials — depth pass", () => {
  it("shares one depth shader with the given range", () => {
    const materials = createSceneMaterials("depth", { near: 0.5, far: 9 })
    const wall = materials.shell("wall")
    expect(wall).toBeInstanceOf(ShaderMaterial)
    expect((wall as ShaderMaterial).uniforms.uNear!.value).toBe(0.5)
    expect((wall as ShaderMaterial).uniforms.uFar!.value).toBe(9)
    expect(materials.part({ tone: "light", placementIndex: 2 })).toBe(
      materials.part({ tone: "dark", placementIndex: 5 })
    )
    expect(materials.background.getHex()).toBe(0)
    expect((wall as ShaderMaterial).uniforms.uRadial!.value).toBe(0)
  })

  it("measures straight-line distance for fisheye sources", () => {
    const materials = createSceneMaterials("depth", {
      near: 0,
      far: 9,
      radial: true,
    })
    const wall = materials.shell("wall") as ShaderMaterial
    expect(wall.uniforms.uRadial!.value).toBe(1)
  })
})

describe("dispose", () => {
  it("disposes every material it made and starts afresh", () => {
    const materials = createSceneMaterials("clay")
    const first = materials.shell("wall")
    let disposed = 0
    first.addEventListener("dispose", () => disposed++)
    materials.dispose()
    expect(disposed).toBe(1)
    expect(materials.shell("wall")).not.toBe(first)
  })
})
