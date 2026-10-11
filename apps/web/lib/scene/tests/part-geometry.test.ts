import { type Part, TEST_ASSETS } from "@roomer/core"
import {
  type Aabb3,
  assetLocalBounds,
  partLocalBounds,
} from "@roomer/core/assets"
import type { BufferGeometry } from "three"
import { describe, expect, it } from "vitest"

import {
  CYLINDER_SEGMENTS,
  partGeometry,
  partIsDoubleSided,
  partMatrix,
  partPose,
} from "../part-geometry"

/** The mesh's exact bounds in item-local mm (every vertex transformed). */
function meshBounds(part: Part): Aabb3 {
  const geometry = partGeometry(part).applyMatrix4(partMatrix(part))
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  return {
    min: [box.min.x * 1000, box.min.y * 1000, box.min.z * 1000],
    max: [box.max.x * 1000, box.max.y * 1000, box.max.z * 1000],
  }
}

function expectBoundsClose(actual: Aabb3, expected: Aabb3, tolerance = 1) {
  for (const key of ["min", "max"] as const) {
    for (let i = 0; i < 3; i++) {
      expect(
        Math.abs(actual[key][i]! - expected[key][i]!),
        `${key}[${i}]: mesh ${actual[key][i]} vs core ${expected[key][i]}`
      ).toBeLessThanOrEqual(tolerance)
    }
  }
}

/** Signed volume of a closed triangle mesh: > 0 when faces wind outward. */
function signedVolume(geometry: BufferGeometry): number {
  const position = geometry.getAttribute("position")
  const index = geometry.getIndex()
  const count = index ? index.count : position.count
  const vertex = (i: number) => {
    const k = index ? index.getX(i) : i
    return [position.getX(k), position.getY(k), position.getZ(k)] as const
  }
  let volume = 0
  for (let i = 0; i < count; i += 3) {
    const [ax, ay, az] = vertex(i)
    const [bx, by, bz] = vertex(i + 1)
    const [cx, cy, cz] = vertex(i + 2)
    volume +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6
  }
  return volume
}

const L_PROFILE: [number, number][] = [
  [0, 0],
  [1000, 0],
  [1000, 300],
  [300, 300],
  [300, 800],
  [0, 800],
]

const VASE_PROFILE: [number, number][] = [
  [0, 0],
  [90, 0],
  [120, 150],
  [70, 300],
  [80, 360],
]

const base = { name: "part", tone: "mid" } as const

const CASES: { label: string; part: Part; tolerance?: number }[] = [
  {
    label: "box",
    part: {
      ...base,
      shape: "box",
      position: [10, 200, -30],
      size: [400, 400, 200],
    },
  },
  {
    label: "box turned 30° about y",
    part: {
      ...base,
      shape: "box",
      position: [0, 300, 0],
      size: [800, 600, 200],
      rotation: [0, 30, 0],
    },
  },
  {
    label: "box tilted about every axis",
    part: {
      ...base,
      shape: "box",
      position: [100, 500, 50],
      size: [500, 120, 300],
      rotation: [10, 20, 30],
    },
  },
  {
    label: "rounded box",
    part: {
      ...base,
      shape: "roundedBox",
      position: [0, 250, 0],
      size: [900, 500, 700],
      radius: 40,
    },
  },
  {
    label: "rounded box turned a quarter",
    part: {
      ...base,
      shape: "roundedBox",
      position: [0, 250, 0],
      size: [900, 500, 700],
      radius: 40,
      rotation: [0, 90, 0],
    },
  },
  {
    label: "cylinder",
    part: {
      ...base,
      shape: "cylinder",
      position: [0, 300, 0],
      radiusTop: 120,
      radiusBottom: 120,
      height: 600,
    },
  },
  {
    label: "cone (pendant shade)",
    part: {
      ...base,
      shape: "cylinder",
      position: [0, 150, 0],
      radiusTop: 60,
      radiusBottom: 200,
      height: 300,
    },
  },
  {
    label: "cylinder lying along z",
    part: {
      ...base,
      shape: "cylinder",
      position: [0, 100, 0],
      radiusTop: 100,
      radiusBottom: 100,
      height: 1200,
      rotation: [90, 0, 0],
    },
  },
  {
    label: "splayed leg (tilted about x and z)",
    part: {
      ...base,
      shape: "cylinder",
      position: [0, 200, 0],
      radiusTop: 20,
      radiusBottom: 12,
      height: 400,
      rotation: [12, 0, -8],
    },
  },
  {
    label: "sphere",
    part: { ...base, shape: "sphere", position: [0, 150, 0], radius: 150 },
  },
  {
    label: "plan extrude (axis y)",
    part: {
      ...base,
      shape: "extrude",
      position: [-500, 200, -400],
      axis: "y",
      profile: L_PROFILE,
      depth: 400,
    },
  },
  {
    label: "side extrude (axis x)",
    part: {
      ...base,
      shape: "extrude",
      position: [0, 0, 0],
      axis: "x",
      profile: L_PROFILE,
      depth: 600,
    },
  },
  {
    label: "front extrude (axis z)",
    part: {
      ...base,
      shape: "extrude",
      position: [0, 0, 0],
      axis: "z",
      profile: L_PROFILE,
      depth: 250,
    },
  },
  {
    label: "plan extrude turned 45° about y",
    part: {
      ...base,
      shape: "extrude",
      position: [0, 200, 0],
      axis: "y",
      profile: L_PROFILE,
      depth: 400,
      rotation: [0, 45, 0],
    },
  },
  {
    label: "lathe",
    part: {
      ...base,
      shape: "lathe",
      position: [0, 0, 0],
      profile: VASE_PROFILE,
    },
  },
  {
    label: "lathe on its side",
    part: {
      ...base,
      shape: "lathe",
      position: [0, 120, 0],
      profile: VASE_PROFILE,
      rotation: [0, 0, 90],
    },
  },
]

describe("partGeometry", () => {
  it.each(CASES)(
    "$label matches core's partLocalBounds",
    ({ part, tolerance }) => {
      expectBoundsClose(meshBounds(part), partLocalBounds(part), tolerance)
    }
  )

  it("maps plan extrude profiles to (x, z) and centres the depth on y", () => {
    expectBoundsClose(
      meshBounds({
        ...base,
        shape: "extrude",
        position: [-500, 200, -400],
        axis: "y",
        profile: L_PROFILE,
        depth: 400,
      }),
      { min: [-500, 0, -400], max: [500, 400, 400] }
    )
  })

  it("maps side extrude profiles to (z, y) and front profiles to (x, y)", () => {
    const side = {
      ...base,
      shape: "extrude",
      position: [0, 0, 0] as [number, number, number],
      depth: 600,
    } as const
    expectBoundsClose(meshBounds({ ...side, axis: "x", profile: L_PROFILE }), {
      min: [-300, 0, 0],
      max: [300, 800, 1000],
    })
    expectBoundsClose(meshBounds({ ...side, axis: "z", profile: L_PROFILE }), {
      min: [0, 0, -300],
      max: [1000, 800, 300],
    })
  })

  it("keeps extruded faces winding outward for every axis (no mirroring)", () => {
    for (const axis of ["x", "y", "z"] as const) {
      const geometry = partGeometry({
        ...base,
        shape: "extrude",
        position: [0, 0, 0],
        axis,
        profile: L_PROFILE,
        depth: 400,
      })
      // L-shape area 0.48 m² minus nothing, × 0.4 m depth.
      const area = (1000 * 300 + 300 * 500) / 1e6
      expect(signedVolume(geometry)).toBeCloseTo(area * 0.4, 6)
    }
  })

  it("winds clockwise extrude profiles outward too", () => {
    const geometry = partGeometry({
      ...base,
      shape: "extrude",
      position: [0, 0, 0],
      axis: "y",
      profile: [...L_PROFILE].reverse(),
      depth: 400,
    })
    expect(signedVolume(geometry)).toBeGreaterThan(0)
  })

  it("only over-estimates a turned rounded box by its rounded corners", () => {
    const part: Part = {
      ...base,
      shape: "roundedBox",
      position: [0, 250, 0],
      size: [900, 500, 700],
      radius: 40,
      rotation: [0, 45, 0],
    }
    const mesh = meshBounds(part)
    const core = partLocalBounds(part)
    for (let i = 0; i < 3; i++) {
      expect(mesh.min[i]!).toBeGreaterThanOrEqual(core.min[i]! - 1e-6)
      expect(mesh.max[i]!).toBeLessThanOrEqual(core.max[i]! + 1e-6)
      // A rounded corner pulls in by at most r(√2 − 1) along a diagonal.
      expect(mesh.max[i]! - core.max[i]!).toBeGreaterThanOrEqual(
        -40 * (Math.SQRT2 - 1) - 1
      )
    }
  })

  it("builds every fixture asset to its listed dims", () => {
    for (const asset of Object.values(TEST_ASSETS)) {
      const meshes = asset.geometry.parts.map(meshBounds)
      const min = [0, 1, 2].map((i) =>
        Math.min(...meshes.map((m) => m.min[i]!))
      )
      const max = [0, 1, 2].map((i) =>
        Math.max(...meshes.map((m) => m.max[i]!))
      )
      const core = assetLocalBounds(asset)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(min[i]! - core.min[i]!)).toBeLessThanOrEqual(1)
        expect(Math.abs(max[i]! - core.max[i]!)).toBeLessThanOrEqual(1)
      }
      expect(max[0]! - min[0]!).toBeCloseTo(asset.dims.w, 0)
      expect(max[1]! - min[1]!).toBeCloseTo(asset.dims.h, 0)
      expect(max[2]! - min[2]!).toBeCloseTo(asset.dims.d, 0)
    }
  })

  it("uses a segment count that puts cylinder vertices on the ±radius extremes", () => {
    expect(CYLINDER_SEGMENTS % 4).toBe(0)
  })
})

describe("partPose", () => {
  it("converts millimetres to metres and degrees to radians", () => {
    const pose = partPose({
      ...base,
      shape: "box",
      position: [1000, 250, -40],
      size: [1, 1, 1],
      rotation: [90, -45, 180],
    })
    expect(pose.position).toEqual([1, 0.25, -0.04])
    expect(pose.rotation[0]).toBeCloseTo(Math.PI / 2)
    expect(pose.rotation[1]).toBeCloseTo(-Math.PI / 4)
    expect(pose.rotation[2]).toBeCloseTo(Math.PI)
  })

  it("defaults to no rotation", () => {
    expect(
      partPose({ ...base, shape: "sphere", position: [0, 0, 0], radius: 1 })
        .rotation
    ).toEqual([0, 0, 0])
  })
})

describe("partIsDoubleSided", () => {
  it("is true only for open lathe surfaces", () => {
    expect(
      partIsDoubleSided({
        ...base,
        shape: "lathe",
        position: [0, 0, 0],
        profile: VASE_PROFILE,
      })
    ).toBe(true)
    expect(
      partIsDoubleSided({
        ...base,
        shape: "box",
        position: [0, 0, 0],
        size: [1, 1, 1],
      })
    ).toBe(false)
  })
})
