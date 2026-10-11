import { TEST_ASSETS } from "@roomer/core"
import { assetLocalBounds } from "@roomer/core/assets"
import { describe, expect, it } from "vitest"

import { FIXTURE_CAMERAS, FIXTURE_ROOM } from "../fixture-scene"
import { buildRoomShell, shellBounds } from "../room-geometry"
import {
  assetViewSetup,
  boxCorners,
  fitOrthographic,
  fitPerspective,
  ORBIT_CUT_RATIO,
  type PerspectiveSetup,
  PREVIEW_MARGIN,
  projectNdc,
  roomViewSetup,
  TOP_VIEW_CUT_HEIGHT,
  type Vec3,
  viewDirection,
} from "../views"

const shell = buildRoomShell(FIXTURE_ROOM)
const ASPECT = 1536 / 1024

function expectInFrame(
  points: Vec3[],
  setup: PerspectiveSetup,
  aspect: number,
  margin: number
) {
  const ndc = projectNdc(
    points,
    setup.position,
    setup.target,
    setup.fov,
    aspect
  )
  const worst = Math.max(
    ...ndc.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))
  )
  expect(worst).toBeLessThanOrEqual(1 / (1 + margin) + 1e-6)
  // Tight: the subject fills most of the frame.
  expect(worst).toBeGreaterThan(0.8)
  expect(ndc.every((p) => p.depth > setup.near)).toBe(true)
}

describe("fitOrthographic", () => {
  it("widens to the image aspect when the subject is tall", () => {
    expect(fitOrthographic(2, 8, 1.5, 0)).toEqual({
      halfWidth: 6,
      halfHeight: 4,
    })
  })

  it("heightens to the image aspect when the subject is wide", () => {
    expect(fitOrthographic(9, 1, 1.5, 0)).toEqual({
      halfWidth: 4.5,
      halfHeight: 3,
    })
  })

  it("adds the margin", () => {
    expect(fitOrthographic(2, 2, 1, 0.1).halfWidth).toBeCloseTo(1.1)
  })
})

describe("viewDirection", () => {
  it("points along the plan bearing and up by the elevation", () => {
    const [x, y, z] = viewDirection(90, 0)
    expect([x, y, z].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 0, 0])
    const down = viewDirection(180, 45)
    expect(down[1]).toBeCloseTo(Math.SQRT1_2)
    expect(down[2]).toBeCloseTo(Math.SQRT1_2)
  })
})

describe("fitPerspective", () => {
  it("frames every point with the margin to spare", () => {
    const points = boxCorners([0, 0, 0], [3, 2.5, 8])
    const fit = fitPerspective(points, viewDirection(225, 40), 30, ASPECT, 0.06)
    expectInFrame(
      points,
      {
        kind: "perspective",
        ...fit,
        up: [0, 1, 0],
        fov: 30,
        near: 0.05,
        far: 100,
      },
      ASPECT,
      0.06
    )
  })
})

describe("roomViewSetup", () => {
  it("turns a saved camera into metres", () => {
    const { camera, cutWalls } = roomViewSetup(
      { kind: "camera", camera: FIXTURE_CAMERAS.fromDoor },
      shell,
      ASPECT
    )
    expect(camera.kind).toBe("perspective")
    expect(camera.position).toEqual([1.55, 1.5, 0.3])
    expect(camera.target).toEqual([1.55, 1.5, 7.69])
    expect(camera.kind === "perspective" && camera.fov).toBe(70)
    expect(cutWalls).toEqual([])
  })

  it("fits the top view to the outline, centred, at the image aspect", () => {
    const { camera, cutWalls, cutHeight } = roomViewSetup(
      { kind: "top" },
      shell,
      ASPECT
    )
    // A plan section: every wall cut at the plan-cut height.
    expect(cutWalls).toEqual(["W1", "W2", "W3", "W4", "W5", "W6"])
    expect(cutHeight).toBe(TOP_VIEW_CUT_HEIGHT)
    if (camera.kind !== "orthographic") throw new Error("expected orthographic")
    const b = shellBounds(shell)
    expect(camera.position[0]).toBeCloseTo((b.minX + b.maxX) / 2000)
    expect(camera.position[2]).toBeCloseTo((b.minZ + b.maxZ) / 2000)
    expect(camera.up).toEqual([0, 0, -1])
    expect(camera.halfWidth / camera.halfHeight).toBeCloseTo(ASPECT)
    // The room is long in z: its length (plus margin) sets the height.
    expect(camera.halfHeight).toBeCloseTo(((b.maxZ - b.minZ) / 2000) * 1.06)
    expect(camera.halfWidth).toBeGreaterThan((b.maxX - b.minX) / 2000)
    expect(camera.position[1]).toBeGreaterThan(b.maxY / 1000)
  })

  it("looks into the room from the bottom-left by default, cutting the near walls", () => {
    const { camera, cutWalls, cutHeight } = roomViewSetup(
      { kind: "orbit" },
      shell,
      ASPECT
    )
    if (camera.kind !== "perspective") throw new Error("expected perspective")
    const b = shellBounds(shell)
    expect(camera.position[0]).toBeLessThan(b.minX / 1000)
    expect(camera.position[2]).toBeGreaterThan(b.maxZ / 1000)
    expect(camera.position[1]).toBeGreaterThan(2.45)
    expect(cutWalls).toEqual(["W3", "W5", "W6"])
    expect(cutHeight).toBe(Math.round(2450 * ORBIT_CUT_RATIO))
    expectInFrame(
      boxCorners(
        [b.minX / 1000, b.minY / 1000, b.minZ / 1000],
        [b.maxX / 1000, 2.45, b.maxZ / 1000]
      ),
      camera,
      ASPECT,
      0.06
    )
  })

  it("follows a requested azimuth and elevation", () => {
    const { camera, cutWalls } = roomViewSetup(
      { kind: "orbit", azimuth: 45, elevation: 60 },
      shell,
      ASPECT
    )
    // From the top-right: the kitchen-end wall, the long right wall and the
    // recess side (seen from outside) are cut.
    expect(cutWalls).toEqual(["W1", "W2", "W4"])
    const dx = camera.position[0] - camera.target[0]
    const dy = camera.position[1] - camera.target[1]
    const dz = camera.position[2] - camera.target[2]
    expect((Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI).toBeCloseTo(60)
    expect((Math.atan2(dx, -dz) * 180) / Math.PI).toBeCloseTo(45)
  })
})

describe("assetViewSetup", () => {
  const bounds = assetLocalBounds(TEST_ASSETS.sofa)

  it("frames the front elevation on width × height", () => {
    const setup = assetViewSetup("front", bounds, 1)
    if (setup.kind !== "orthographic") throw new Error("expected orthographic")
    expect(setup.position[2]).toBeGreaterThan(bounds.max[2] / 1000)
    expect(setup.target).toEqual([0, 0.41, 0])
    // 2200 wide, square image → width sets both halves.
    expect(setup.halfWidth).toBeCloseTo(1.1 * (1 + PREVIEW_MARGIN))
    expect(setup.halfHeight).toBeCloseTo(setup.halfWidth)
  })

  it("frames the side elevation on depth × height from the item's right", () => {
    const setup = assetViewSetup("side", bounds, 0.5)
    if (setup.kind !== "orthographic") throw new Error("expected orthographic")
    expect(setup.position[0]).toBeGreaterThan(bounds.max[0] / 1000)
    // 950 deep, 820 tall in a portrait image: depth sets the width.
    expect(setup.halfWidth).toBeCloseTo(0.475 * (1 + PREVIEW_MARGIN))
  })

  it("frames the plan from above with the front at the bottom", () => {
    const setup = assetViewSetup("top", bounds, 1)
    if (setup.kind !== "orthographic") throw new Error("expected orthographic")
    expect(setup.position[1]).toBeGreaterThan(bounds.max[1] / 1000)
    expect(setup.up).toEqual([0, 0, -1])
  })

  it("frames a 3/4 view from the front-right, above", () => {
    const setup = assetViewSetup("iso", bounds, 1)
    if (setup.kind !== "perspective") throw new Error("expected perspective")
    expect(setup.position[0]).toBeGreaterThan(setup.target[0])
    expect(setup.position[1]).toBeGreaterThan(setup.target[1])
    expect(setup.position[2]).toBeGreaterThan(setup.target[2])
    const min = bounds.min.map((v) => v / 1000) as Vec3
    const max = bounds.max.map((v) => v / 1000) as Vec3
    expectInFrame(boxCorners(min, max), setup, 1, PREVIEW_MARGIN)
  })
})
