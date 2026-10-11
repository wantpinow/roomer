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

// --- part vocabulary v2 ------------------------------------------------------

/** Bounds of sample points (item-local, rotation + position applied). */
function sampledBounds(
  points: readonly [number, number, number][],
  rotation: [number, number, number] = [0, 0, 0],
  position: [number, number, number] = [0, 0, 0]
): Aabb3 {
  const box: Aabb3 = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }
  for (const point of points) {
    const p = rotateEulerXYZ(point, rotation)
    for (let i = 0; i < 3; i++) {
      box.min[i] = Math.min(box.min[i]!, p[i]! + position[i]!)
      box.max[i] = Math.max(box.max[i]!, p[i]! + position[i]!)
    }
  }
  return box
}

/** Dense samples of a circle's angles, degrees. */
const degrees = (from: number, length: number, steps = 1440) =>
  Array.from({ length: steps + 1 }, (_, i) => from + (length * i) / steps)

const rad = (deg: number) => (deg * Math.PI) / 180

/** Core bounds equal dense samples of the true surface (within 0.05mm). */
function expectMatchesSamples(part: Part, samples: [number, number, number][]) {
  const exact = partLocalBounds(part)
  const sampled = sampledBounds(samples, part.rotation, part.position)
  for (let i = 0; i < 3; i++) {
    expect(exact.min[i]!).toBeLessThanOrEqual(sampled.min[i]! + 1e-6)
    expect(exact.max[i]!).toBeGreaterThanOrEqual(sampled.max[i]! - 1e-6)
    expect(sampled.min[i]! - exact.min[i]!).toBeLessThan(0.05)
    expect(exact.max[i]! - sampled.max[i]!).toBeLessThan(0.05)
  }
}

const ROTATIONS: [number, number, number][] = [
  [0, 0, 0],
  [0, 37, 0],
  [90, 0, 0],
  [0, 0, 90],
  [12, -40, 25],
]

describe("partLocalBounds: roundedBox with vertical edges", () => {
  const slab = (rotation: [number, number, number]): Part => ({
    shape: "roundedBox",
    name: "top",
    position: [10, 400, -20],
    size: [1200, 30, 600],
    radius: 300,
    edges: "vertical",
    rotation,
  })

  /** The stadium's outline (two semicircles, flat sides) at both faces. */
  function slabSamples(): [number, number, number][] {
    const points: [number, number, number][] = []
    for (const y of [-15, 15]) {
      for (const a of degrees(0, 360)) {
        const cx = Math.sin(rad(a)) >= 0 ? 300 : -300
        points.push([cx + 300 * Math.sin(rad(a)), y, 300 * Math.cos(rad(a))])
      }
    }
    return points
  }

  it.each(ROTATIONS)("is exact turned %j", (...rotation) => {
    expectMatchesSamples(slab(rotation), slabSamples())
  })

  it("is the plain box when upright", () => {
    expectBounds(
      partLocalBounds(slab([0, 0, 0])),
      [-590, 385, -320],
      [610, 415, 280]
    )
  })
})

describe("partLocalBounds: capsule", () => {
  const capsule = (rotation: [number, number, number]): Part => ({
    shape: "capsule",
    name: "arm roll",
    position: [0, 500, 100],
    radius: 80,
    length: 600,
    rotation,
  })

  it("is length + 2 × radius tall along its axis", () => {
    expectBounds(
      partLocalBounds(capsule([0, 0, 0])),
      [-80, 120, 20],
      [80, 880, 180]
    )
    // Lying across (about z): the length runs along x.
    expectBounds(
      partLocalBounds(capsule([0, 0, 90])),
      [-380, 420, 20],
      [380, 580, 180]
    )
  })

  it.each(ROTATIONS)("is exact turned %j", (...rotation) => {
    const samples: [number, number, number][] = []
    for (const end of [-300, 300]) {
      for (const a of degrees(0, 360, 180)) {
        for (const b of degrees(-90, 180, 90)) {
          samples.push([
            80 * Math.cos(rad(b)) * Math.sin(rad(a)),
            end + 80 * Math.sin(rad(b)),
            80 * Math.cos(rad(b)) * Math.cos(rad(a)),
          ])
        }
      }
    }
    const part = capsule(rotation)
    const exact = partLocalBounds(part)
    const sampled = sampledBounds(samples, part.rotation, part.position)
    for (let i = 0; i < 3; i++) {
      expect(exact.min[i]!).toBeLessThanOrEqual(sampled.min[i]! + 1e-6)
      expect(sampled.min[i]! - exact.min[i]!).toBeLessThan(0.5)
      expect(exact.max[i]! - sampled.max[i]!).toBeLessThan(0.5)
    }
  })
})

describe("partLocalBounds: torus", () => {
  const torus = (rotation: [number, number, number], arc?: number): Part => ({
    shape: "torus",
    name: "rim",
    position: [0, 700, -50],
    radius: 360,
    tube: 45,
    rotation,
    ...(arc !== undefined ? { arc } : {}),
  })

  function torusSamples(arc = 360): [number, number, number][] {
    const points: [number, number, number][] = []
    for (const phi of degrees(0, arc, 720)) {
      for (const v of degrees(0, 360, 72)) {
        const r = 360 + 45 * Math.cos(rad(v))
        points.push([
          r * Math.sin(rad(phi)),
          45 * Math.sin(rad(v)),
          r * Math.cos(rad(phi)),
        ])
      }
    }
    return points
  }

  it("lies flat in the x–z plane: radius + tube out, tube up and down", () => {
    expectBounds(
      partLocalBounds(torus([0, 0, 0])),
      [-405, 655, -455],
      [405, 745, 355]
    )
  })

  it("starts its arc at +z and sweeps towards +x", () => {
    // A quarter from the front round to the right, with flat ends: x and z
    // 0…405, y ±tube.
    const quarter = partLocalBounds({
      ...torus([0, 0, 0], 90),
      position: [0, 0, 0],
    })
    expectBounds(quarter, [0, -45, 0], [405, 45, 405])
  })

  it.each(ROTATIONS)("is exact turned %j (full ring)", (...rotation) => {
    expectMatchesSamples(torus(rotation), torusSamples())
  })

  it.each(ROTATIONS)("is exact turned %j (a 270° arc)", (...rotation) => {
    expectMatchesSamples(torus(rotation, 270), torusSamples(270))
  })
})

describe("partLocalBounds: partial lathe", () => {
  const PROFILE: [number, number][] = [
    [300, 0],
    [400, 0],
    [400, 700],
    [300, 700],
    [300, 0],
  ]
  const wall = (
    rotation: [number, number, number],
    arc: [number, number]
  ): Part => ({
    shape: "lathe",
    name: "C wall",
    position: [0, 0, 0],
    profile: PROFILE,
    arc,
    rotation,
  })

  function samples([start, length]: [number, number]) {
    return PROFILE.flatMap(([r, y]) =>
      degrees(start, length).map((a): [number, number, number] => [
        r * Math.sin(rad(a)),
        y,
        r * Math.cos(rad(a)),
      ])
    )
  }

  it("leaves the front open for a C from 45° to 315°", () => {
    const bounds = partLocalBounds(wall([0, 0, 0], [45, 270]))
    expectBounds(bounds, [-400, 0, -400], [400, 700, 400 * Math.SQRT1_2], 6)
  })

  it("treats a 360° arc like a full revolve", () => {
    expect(partLocalBounds(wall([0, 0, 0], [45, 360]))).toEqual(
      partLocalBounds({
        shape: "lathe",
        name: "full wall",
        position: [0, 0, 0],
        profile: PROFILE,
      })
    )
  })

  it.each(ROTATIONS)("is exact turned %j", (...rotation) => {
    for (const arc of [
      [45, 270],
      [100, 60],
      [300, 120],
    ] as [number, number][]) {
      expectMatchesSamples(wall(rotation, arc), samples(arc))
    }
  })
})

describe("partLocalBounds: bevelled extrude", () => {
  it("keeps the outer size of profile × depth", () => {
    const part: Part = {
      shape: "extrude",
      name: "cushion",
      position: [0, 200, 0],
      axis: "z",
      profile: [
        [-300, -100],
        [300, -100],
        [300, 100],
        [-300, 100],
      ],
      depth: 500,
      bevel: 40,
    }
    expectBounds(partLocalBounds(part), [-300, 100, -250], [300, 300, 250])
  })
})
