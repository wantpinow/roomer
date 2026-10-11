import { describe, expect, it } from "vitest"

import {
  aabbSize,
  assetLocalBounds,
  partLocalBounds,
  type Aabb3,
} from "../../src/assets"
import { SOFA, TEST_ASSETS } from "../../src/fixtures"
import { rotateEulerXYZ } from "../../src/geometry"
import type { CylinderPart, Part } from "../../src/schema"

const expectBounds = (
  actual: Aabb3,
  min: [number, number, number],
  max: [number, number, number],
  digits = 6
) => {
  actual.min.forEach((v, i) => expect(v).toBeCloseTo(min[i]!, digits))
  actual.max.forEach((v, i) => expect(v).toBeCloseTo(max[i]!, digits))
}

const box = (
  size: [number, number, number],
  rotation?: [number, number, number],
  position: [number, number, number] = [0, 0, 0]
): Part => ({ shape: "box", name: "box", position, size, rotation })

describe("partLocalBounds: boxes", () => {
  it("centres the size on the position", () => {
    expectBounds(
      partLocalBounds(box([100, 200, 300], undefined, [10, 20, 30])),
      [-40, -80, -120],
      [60, 120, 180]
    )
  })

  it("swaps x and z extents for a 90° turn about y", () => {
    const bounds = partLocalBounds(box([1000, 100, 100], [0, 90, 0]))
    expect(aabbSize(bounds)).toEqual([100, 100, 1000])
  })

  it("grows to enclose a box turned 45° about y", () => {
    const bounds = partLocalBounds(box([1000, 100, 100], [0, 45, 0]))
    const half = (500 + 50) * Math.SQRT1_2
    expectBounds(bounds, [-half, -50, -half], [half, 50, half])
  })

  it("treats a rounded box like a box", () => {
    const bounds = partLocalBounds({
      shape: "roundedBox",
      name: "cushion",
      position: [0, 50, 0],
      size: [600, 100, 600],
      radius: 30,
      rotation: [90, 0, 0],
    })
    expectBounds(bounds, [-300, -250, -50], [300, 350, 50])
  })
})

describe("partLocalBounds: round shapes", () => {
  const cone: CylinderPart = {
    shape: "cylinder",
    name: "shade",
    position: [0, 150, 0],
    radiusTop: 60,
    radiusBottom: 200,
    height: 300,
  }

  it("bounds an upright cone by its larger radius", () => {
    expectBounds(partLocalBounds(cone), [-200, 0, -200], [200, 300, 200])
  })

  it("lays a cylinder along z when turned 90° about x", () => {
    expectBounds(
      partLocalBounds({
        shape: "cylinder",
        name: "bolster",
        position: [0, 0, 0],
        radiusTop: 20,
        radiusBottom: 20,
        height: 400,
        rotation: [90, 0, 0],
      }),
      [-20, -20, -200],
      [20, 20, 200]
    )
  })

  it("uses each end's own radius when a cone is tipped over", () => {
    // Rz(90) points the cone's axis along −x: the wide base sits at +x.
    expectBounds(
      partLocalBounds({
        shape: "cylinder",
        name: "cone",
        position: [0, 0, 0],
        radiusTop: 0,
        radiusBottom: 100,
        height: 200,
        rotation: [0, 0, 90],
      }),
      [-100, -100, -100],
      [100, 100, 100]
    )
  })

  it("is exact for a tilted cylinder (matches a dense surface sample)", () => {
    const part: CylinderPart = {
      shape: "cylinder",
      name: "leg",
      position: [0, 0, 0],
      radiusTop: 25,
      radiusBottom: 40,
      height: 500,
      rotation: [20, 35, -10],
    }
    const sampled: Aabb3 = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    }
    for (const [y, r] of [
      [-250, 40],
      [250, 25],
    ] as const) {
      for (let k = 0; k < 3600; k++) {
        const a = (k / 3600) * 2 * Math.PI
        const p = rotateEulerXYZ(
          [r * Math.cos(a), y, r * Math.sin(a)],
          part.rotation!
        )
        p.forEach((v, i) => {
          sampled.min[i] = Math.min(sampled.min[i]!, v)
          sampled.max[i] = Math.max(sampled.max[i]!, v)
        })
      }
    }
    const exact = partLocalBounds(part)
    exact.min.forEach((v, i) => expect(v).toBeCloseTo(sampled.min[i]!, 2))
    exact.max.forEach((v, i) => expect(v).toBeCloseTo(sampled.max[i]!, 2))
  })

  it("ignores rotation for spheres", () => {
    expectBounds(
      partLocalBounds({
        shape: "sphere",
        name: "ball",
        position: [100, 150, 0],
        radius: 150,
        rotation: [30, 40, 50],
      }),
      [-50, 0, -150],
      [250, 300, 150]
    )
  })

  it("bounds a lathe by its widest radius and its profile heights", () => {
    expectBounds(
      partLocalBounds({
        shape: "lathe",
        name: "vase",
        position: [0, 0, 100],
        profile: [
          [0, 0],
          [150, 0],
          [100, 300],
          [0, 320],
        ],
      }),
      [-150, 0, -50],
      [150, 320, 250]
    )
  })

  it("rotates a lathe's axis like a cylinder's", () => {
    expectBounds(
      partLocalBounds({
        shape: "lathe",
        name: "horn",
        position: [0, 0, 0],
        profile: [
          [150, 0],
          [0, 320],
        ],
        rotation: [90, 0, 0],
      }),
      [-150, -150, 0],
      [150, 150, 320]
    )
  })
})

describe("partLocalBounds: extrudes", () => {
  const triangle: [number, number][] = [
    [0, 0],
    [400, 0],
    [0, 300],
  ]

  it("maps the profile to the plan (x, z) for axis y", () => {
    expectBounds(
      partLocalBounds({
        shape: "extrude",
        name: "seat",
        axis: "y",
        position: [0, 200, 0],
        depth: 400,
        profile: [
          [-500, -300],
          [500, -300],
          [500, 0],
          [0, 0],
          [0, 300],
          [-500, 300],
        ],
      }),
      [-500, 0, -300],
      [500, 400, 300]
    )
  })

  it("maps the profile to (z, y) for axis x", () => {
    expectBounds(
      partLocalBounds({
        shape: "extrude",
        name: "arm",
        axis: "x",
        position: [0, 0, 0],
        depth: 100,
        profile: triangle,
      }),
      [-50, 0, 0],
      [50, 300, 400]
    )
  })

  it("maps the profile to (x, y) for axis z", () => {
    expectBounds(
      partLocalBounds({
        shape: "extrude",
        name: "front",
        axis: "z",
        position: [0, 0, 0],
        depth: 100,
        profile: triangle,
      }),
      [0, 0, -50],
      [400, 300, 50]
    )
  })

  it("bounds the rotated outline itself, not a rotated box", () => {
    // A thin diagonal bar turned 45° about y lines up with the x axis.
    const bounds = partLocalBounds({
      shape: "extrude",
      name: "bar",
      axis: "y",
      position: [0, 0, 0],
      depth: 10,
      profile: [
        [0, 0],
        [1000, 1000],
        [990, 1010],
        [-10, 10],
      ],
      rotation: [0, 45, 0],
    })
    expect(bounds.max[2] - bounds.min[2]).toBeCloseTo(10 * Math.SQRT2, 6)
  })
})

describe("assetLocalBounds", () => {
  it("unions every part", () => {
    expectBounds(assetLocalBounds(SOFA), [-1100, 0, -475], [1100, 820, 475])
  })

  it("matches dims for every test asset", () => {
    for (const asset of Object.values(TEST_ASSETS)) {
      expect(aabbSize(assetLocalBounds(asset))).toEqual([
        asset.dims.w,
        asset.dims.h,
        asset.dims.d,
      ])
    }
  })
})
