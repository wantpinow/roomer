import type {
  CapsulePart,
  ExtrudePart,
  LathePart,
  Part,
  RoundedBoxPart,
  TorusPart,
} from "@roomer/core"
import {
  cleanProfile,
  extrudeRings,
  latheArc,
  revolvePoint,
  torusArc,
  type Arc,
} from "@roomer/core/assets"
import { isSimplePolygon, signedArea, type Point } from "@roomer/core/geometry"
import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Shape,
  ShapeUtils,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

import { toMetres } from "./types"

// Asset parts → three.js geometry, in metres. Each geometry is centred on
// the part's own origin (its `position`), so a mesh only needs the pose from
// `partPose`. The shapes follow core's bounds exactly (see
// packages/core/src/assets/bounds.ts) so what is drawn is what lint checks:
// round shapes use segment counts divisible by four, which puts vertices at
// the ±radius extremes.

export const CYLINDER_SEGMENTS = 32
export const SPHERE_WIDTH_SEGMENTS = 32
export const SPHERE_HEIGHT_SEGMENTS = 16
export const LATHE_SEGMENTS = 48
export const ROUNDED_BOX_SEGMENTS = 4
/** Segments per quarter of a rounded-rectangle slab's corners. */
export const SLAB_CORNER_SEGMENTS = 16
export const CAPSULE_CAP_SEGMENTS = 8
export const CAPSULE_RADIAL_SEGMENTS = 32
/** Segments around a torus's tube (divisible by four, like the rest). */
export const TORUS_TUBE_SEGMENTS = 24
/**
 * Widest angle (degrees) between the steps of a partial revolve or a ring:
 * a turned arc's extreme falls between two steps, and 3.75° keeps that
 * within 0.6mm of the true circle for radii up to 1m.
 */
export const ARC_STEP_DEGREES = 3.75

/** Mesh pose of a part inside its item group: metres and radians ("XYZ"). */
export interface PartPose {
  position: [number, number, number]
  rotation: [number, number, number]
}

export function partPose(part: Part): PartPose {
  const [x, y, z] = part.position
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0]
  const deg = Math.PI / 180
  return {
    position: [toMetres(x), toMetres(y), toMetres(z)],
    rotation: [rx * deg, ry * deg, rz * deg],
  }
}

/** The part's mesh matrix (pose only — geometry is already in metres). */
export function partMatrix(part: Part): Matrix4 {
  const { position, rotation } = partPose(part)
  return new Matrix4()
    .makeRotationFromEuler(new Euler(...rotation, "XYZ"))
    .setPosition(...position)
}

/** Builds the part's geometry in metres, centred on the part's origin. */
export function partGeometry(part: Part): BufferGeometry {
  switch (part.shape) {
    case "box": {
      const [w, h, d] = part.size.map(toMetres) as [number, number, number]
      return new BoxGeometry(w, h, d)
    }
    case "roundedBox": {
      if (part.edges === "vertical") return slabGeometry(part)
      const [w, h, d] = part.size.map(toMetres) as [number, number, number]
      return new RoundedBoxGeometry(
        w,
        h,
        d,
        ROUNDED_BOX_SEGMENTS,
        toMetres(part.radius)
      )
    }
    case "cylinder":
      return new CylinderGeometry(
        toMetres(part.radiusTop),
        toMetres(part.radiusBottom),
        toMetres(part.height),
        CYLINDER_SEGMENTS
      )
    case "sphere":
      return new SphereGeometry(
        toMetres(part.radius),
        SPHERE_WIDTH_SEGMENTS,
        SPHERE_HEIGHT_SEGMENTS
      )
    case "capsule":
      return capsuleGeometry(part)
    case "torus":
      return torusGeometry(part)
    case "extrude":
      return part.bevel ? bevelledExtrudeGeometry(part) : extrudeGeometry(part)
    case "lathe":
      return latheGeometry(part)
  }
}

/**
 * A rounded-box with only its upright edges rounded: a rounded rectangle
 * (w × d, corner radius r) extruded through the height. Like a plan
 * extrude, the outline is drawn in (x, z) and stood up along y.
 */
function slabGeometry(part: RoundedBoxPart): BufferGeometry {
  const [w, h, d] = part.size.map(toMetres) as [number, number, number]
  const r = Math.min(toMetres(part.radius), w / 2, d / 2)
  const [x, z] = [w / 2, d / 2]
  const shape = new Shape()
  shape.moveTo(-x + r, -z)
  shape.lineTo(x - r, -z)
  shape.absarc(x - r, -z + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(x, z - r)
  shape.absarc(x - r, z - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-x + r, z)
  shape.absarc(-x + r, z - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-x, -z + r)
  shape.absarc(-x + r, -z + r, r, Math.PI, Math.PI * 1.5, false)
  const geometry = new ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: false,
    steps: 1,
    curveSegments: SLAB_CORNER_SEGMENTS,
  })
  geometry.translate(0, 0, -h / 2)
  // (u, v, e) → (u, −e, v): the outline lies in (x, z), the height on y.
  geometry.rotateX(Math.PI / 2)
  return geometry
}

/** three's capsule: `height` is the straight middle, as in the schema. */
function capsuleGeometry(part: CapsulePart): BufferGeometry {
  return new CapsuleGeometry(
    toMetres(part.radius),
    toMetres(part.length),
    CAPSULE_CAP_SEGMENTS,
    CAPSULE_RADIAL_SEGMENTS
  )
}

/** Steps for an arc of `length` degrees, at most ARC_STEP_DEGREES apart. */
function arcSegments(length: number): number {
  return Math.max(2, Math.ceil(length / ARC_STEP_DEGREES - 1e-9))
}

/**
 * Turns three's torus (ring in its x–y plane, starting at +x towards +y)
 * into the schema's (ring in x–z, starting at +z towards +x): new
 * (x, y, z) = old (y, z, x), a rotation.
 */
const TORUS_FRAME = new Matrix4().set(
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  1
)

/**
 * A flat polygon facing `normal` (metres), as non-indexed triangles with
 * position, normal and uv attributes (so it merges with three's shapes).
 */
function capGeometry(
  outline: readonly Vector3[],
  plane: readonly Point[],
  normal: Vector3
): BufferGeometry | null {
  const contour = plane.map(([u, v]) => new Vector2(u, v))
  const triangles = ShapeUtils.triangulateShape(contour, [])
  if (triangles.length === 0) return null
  const positions: number[] = []
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map((i) => outline[i]!) as [
      Vector3,
      Vector3,
      Vector3,
    ]
    const facing = new Vector3()
      .subVectors(b, a)
      .cross(new Vector3().subVectors(c, a))
      .dot(normal)
    for (const p of facing >= 0 ? [a, b, c] : [a, c, b]) {
      positions.push(p.x, p.y, p.z)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
  const count = positions.length / 3
  geometry.setAttribute(
    "normal",
    new Float32BufferAttribute(
      Array.from({ length: count }, () => [
        normal.x,
        normal.y,
        normal.z,
      ]).flat(),
      3
    )
  )
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(new Array<number>(count * 2).fill(0), 2)
  )
  return geometry
}

/** Merge shapes into one geometry (non-indexed, attributes kept). */
function merged(pieces: (BufferGeometry | null)[]): BufferGeometry {
  const parts = pieces
    .filter((piece): piece is BufferGeometry => piece !== null)
    .map((piece) => (piece.index ? piece.toNonIndexed() : piece))
  const geometry = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!geometry) throw new Error("Could not merge part geometry")
  return geometry
}

/**
 * Unit tangent of a revolve at angle φ (degrees), pointing the way the arc
 * sweeps: d/dφ of (sin φ, cos φ) in (x, z).
 */
function sweepTangent(phi: number): Vector3 {
  const angle = (phi * Math.PI) / 180
  return new Vector3(Math.cos(angle), 0, -Math.sin(angle))
}

/**
 * A torus lying in the x–z plane. A partial ring starts at +z and sweeps
 * towards +x, and its two open ends are capped with flat discs.
 */
function torusGeometry(part: TorusPart): BufferGeometry {
  const arc = torusArc(part)
  const length = arc?.length ?? 360
  const radius = toMetres(part.radius)
  const tube = toMetres(part.tube)
  const ring = new TorusGeometry(
    radius,
    tube,
    TORUS_TUBE_SEGMENTS,
    arcSegments(length),
    (length * Math.PI) / 180
  ).applyMatrix4(TORUS_FRAME)
  if (!arc) return ring
  // End discs: the tube's circle at each end, in the plane of the radius
  // and the vertical, facing away from the ring.
  const disc = (phi: number, outward: Vector3) => {
    const plane: Point[] = Array.from(
      { length: TORUS_TUBE_SEGMENTS },
      (_, i): Point => {
        const v = (2 * Math.PI * i) / TORUS_TUBE_SEGMENTS
        return [radius + tube * Math.cos(v), tube * Math.sin(v)]
      }
    )
    const outline = plane.map(
      ([r, y]) => new Vector3(...revolvePoint(phi, r, y))
    )
    return capGeometry(outline, plane, outward)
  }
  return merged([
    ring,
    disc(arc.start, sweepTangent(arc.start).negate()),
    disc(arc.start + arc.length, sweepTangent(arc.start + arc.length)),
  ])
}

/**
 * Builds an extrusion from core's rings (extrudeRings), which is what a
 * bevel needs: sides between neighbouring rings, flat end faces on the
 * first and last. (u, v, e) is placed with the same rotations as
 * extrudeGeometry, so the faces wind outward.
 */
function bevelledExtrudeGeometry(part: ExtrudePart): BufferGeometry {
  const rings = extrudeRings(part)
  const place = ([u, v]: Point, e: number): Vector3 => {
    const [x, y, z] = [toMetres(u), toMetres(v), toMetres(e)]
    switch (part.axis) {
      case "z":
        return new Vector3(x, y, z)
      case "y":
        return new Vector3(x, -z, y)
      case "x":
        return new Vector3(-z, y, x)
    }
  }
  // In (u, v, e), a positive-area outline's sides face out when each quad
  // runs along the outline and then up the axis; a negative one is reversed.
  // Each outline edge is its own strip: shading is smooth along the strip
  // (round the bevel) and stays sharp at the outline's corners.
  const outward = signedArea(rings[0]!.points) >= 0
  const n = rings[0]!.points.length
  const strips: BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n
    const positions: number[] = []
    for (const ring of rings) {
      for (const p of [
        place(ring.points[i]!, ring.e),
        place(ring.points[k]!, ring.e),
      ]) {
        positions.push(p.x, p.y, p.z)
      }
    }
    const index: number[] = []
    for (let j = 0; j + 1 < rings.length; j++) {
      const [a, b, c, d] = [2 * j, 2 * j + 1, 2 * j + 3, 2 * j + 2]
      if (outward) index.push(a, b, c, a, c, d)
      else index.push(a, c, b, a, d, c)
    }
    const strip = new BufferGeometry()
    strip.setAttribute("position", new Float32BufferAttribute(positions, 3))
    strip.setIndex(index)
    strip.computeVertexNormals()
    strip.setAttribute(
      "uv",
      new Float32BufferAttribute(
        new Array<number>((positions.length / 3) * 2).fill(0),
        2
      )
    )
    strips.push(strip)
  }
  const axis = place([0, 0], 1)
    .sub(place([0, 0], 0))
    .normalize()
  const end = (ring: (typeof rings)[number], normal: Vector3) =>
    capGeometry(
      ring.points.map((point) => place(point, ring.e)),
      ring.points,
      normal
    )
  return merged([
    ...strips,
    end(rings[0]!, axis.clone().negate()),
    end(rings[rings.length - 1]!, axis),
  ])
}

/**
 * An extrude's profile [u, v] is drawn in the shape plane and pushed along
 * the shape's +z, then rotated so the profile lands where the schema says:
 * axis z → (x, y) front profile, y → (x, z) plan outline, x → (z, y) side
 * profile. Rotations (never mirrors) keep the faces' winding outward; the
 * depth is centred, so the sign the rotation gives the extrusion axis does
 * not matter.
 */
function extrudeGeometry(part: ExtrudePart): BufferGeometry {
  const shape = new Shape(
    part.profile.map(([u, v]) => new Vector2(toMetres(u), toMetres(v)))
  )
  const depth = toMetres(part.depth)
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  switch (part.axis) {
    case "z":
      break
    case "y":
      // (u, v, e) → (u, −e, v)
      geometry.rotateX(Math.PI / 2)
      break
    case "x":
      // (u, v, e) → (−e, v, u)
      geometry.rotateY(-Math.PI / 2)
      break
  }
  return geometry
}

/**
 * A lathe revolves its [radius, y] half-profile about the local y axis
 * (three's angle 0 is +z, increasing towards +x — the schema's). A partial
 * arc's cut ends are capped with the profile's outline when it encloses an
 * area.
 */
function latheGeometry(part: LathePart): BufferGeometry {
  const profile = part.profile.map(
    ([r, y]) => new Vector2(toMetres(r), toMetres(y))
  )
  const arc = latheArc(part)
  if (!arc) return new LatheGeometry(profile, LATHE_SEGMENTS)
  const surface = new LatheGeometry(
    profile,
    arcSegments(arc.length),
    (arc.start * Math.PI) / 180,
    (arc.length * Math.PI) / 180
  )
  return merged([surface, ...arcEndCaps(part, arc)])
}

function arcEndCaps(part: LathePart, arc: Arc): (BufferGeometry | null)[] {
  const plane: Point[] = cleanProfile(part.profile).map(([r, y]) => [
    toMetres(r),
    toMetres(y),
  ])
  if (
    plane.length < 3 ||
    !isSimplePolygon(plane) ||
    Math.abs(signedArea(plane)) < 1e-12
  ) {
    return []
  }
  const cap = (phi: number, outward: Vector3) =>
    capGeometry(
      plane.map(([r, y]) => new Vector3(...revolvePoint(phi, r, y))),
      plane,
      outward
    )
  return [
    cap(arc.start, sweepTangent(arc.start).negate()),
    cap(arc.start + arc.length, sweepTangent(arc.start + arc.length)),
  ]
}

/** Lathes are open surfaces whose winding follows the profile's direction. */
export function partIsDoubleSided(part: Part): boolean {
  return part.shape === "lathe"
}
