import {
  type DoorFeature,
  type Feature,
  isCeilingFeature,
  isFloorFeature,
  isWallFeature,
  type RadiatorFeature,
  type WallFeature,
  type WallId,
  type WindowFeature,
} from "@roomer/core"
import {
  bounds,
  cross,
  deriveWalls,
  placementTransform,
  type Point,
  type RoomGeometry,
  sub,
  type Wall,
  wallPoint,
} from "@roomer/core/geometry"

// The fixed parts of a room as plain solids, in room-space millimetres —
// no three.js here, so the shapes can be unit-tested in node and the scene
// only has to turn each solid into a mesh. Every solid is either a vertical
// prism (a plan footprint extruded between two heights) or an upright
// cylinder, which covers walls, joinery, radiators and fittings alike.
//
// Conventions (architecture §3.1): x right, z down the plan, y up. A wall's
// frame is `along` (mm from its start corner) and `inset` (mm into the room
// along its inward normal; negative = inside or behind the wall).

export const SHELL_ROLES = [
  "floor",
  "ceiling",
  "wall",
  "skirting",
  "architrave",
  "door",
  "handle",
  "window-frame",
  "glass",
  "sill",
  "radiator",
  "pipe",
  "obstacle",
  "hearth",
  "plate",
  "light",
] as const

export type ShellRole = (typeof SHELL_ROLES)[number]

interface SolidCommon {
  role: ShellRole
  /** Bottom and top, mm above the floor. */
  y0: number
  y1: number
  /** The wall this solid belongs to (cut away with it in orbit views). */
  wall?: WallId
  /** The room feature this solid draws, if any. */
  feature?: string
  /** Hidden together with the ceiling (top and orbit views). */
  ceiling?: boolean
}

export interface PrismSolid extends SolidCommon {
  kind: "prism"
  /** Plan outline (x, z) in mm; either winding. */
  footprint: Point[]
}

export interface CylinderSolid extends SolidCommon {
  kind: "cylinder"
  center: Point
  radius: number
}

export type ShellSolid = PrismSolid | CylinderSolid

export interface WindowLight {
  feature: string
  wall: WallId
  /** Centre of the opening on the plaster line, room-space mm. */
  center: [number, number, number]
  /** Unit plan vector pointing into the room. */
  inward: Point
  width: number
  height: number
}

export interface RoomShell {
  walls: Wall[]
  /** Thickness of each wall (mm), indexed like `walls`. */
  thickness: number[]
  /** Interior floor polygon (the solved corners). */
  floor: Point[]
  /** Outer outline including wall thickness (mitred corners). */
  outline: Point[]
  ceilingHeight: number
  solids: ShellSolid[]
  windows: WindowLight[]
}

export const WALL_THICKNESS = 100
export const FLOOR_THICKNESS = 60
export const CEILING_THICKNESS = 60
/** Default depth of a window's reveal when the room doesn't say. */
export const DEFAULT_REVEAL_DEPTH = 60
/** Default interior sill overhang when the room doesn't say. */
export const DEFAULT_SILL_DEPTH = 25

export const WINDOW_FRAME = {
  /** Face width of the outer frame. */
  width: 50,
  /** Frame depth through the wall. */
  depth: 60,
  mullion: 40,
  /** Widest single pane before a mullion is added. */
  maxPane: 900,
  glass: 6,
  /** Wall left behind the frame, outside. */
  outerWall: 30,
  sillThickness: 30,
  sillEars: 40,
} as const

export const DOOR = {
  leafThickness: 40,
  /** Gap around the leaf in its frame. */
  gap: 3,
  /** Gap under the leaf. */
  floorGap: 8,
  /** How far the leaf sits back from the face it opens towards. */
  setBack: 10,
  handleHeight: 1000,
  handleInset: 65,
  leverLength: 120,
} as const

export const ARCHITRAVE = { width: 70, depth: 18 } as const
export const PLATE_DEPTH = 8

const EPS = 1e-6

type Interval = [number, number]

/** `base` minus the union of `cuts`, as sorted, non-empty intervals. */
export function subtractIntervals(
  base: Interval,
  cuts: readonly Interval[]
): Interval[] {
  const sorted = cuts
    .map(([a, b]): Interval => [Math.max(a, base[0]), Math.min(b, base[1])])
    .filter(([a, b]) => b - a > EPS)
    .sort((p, q) => p[0] - q[0])
  const out: Interval[] = []
  let cursor = base[0]
  for (const [a, b] of sorted) {
    if (a - cursor > EPS) out.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (base[1] - cursor > EPS) out.push([cursor, base[1]])
  return out
}

export interface WallHole {
  feature: string
  /** Along the wall, mm from its start corner. */
  u0: number
  u1: number
  /** Heights, mm. */
  y0: number
  y1: number
}

export interface WallPiece {
  u0: number
  u1: number
  y0: number
  y1: number
}

/**
 * Splits a wall face of `length × height` around rectangular holes into the
 * fewest solid pieces that are rectangles in the wall's frame: full-height
 * columns between holes, and pieces below and above each hole.
 */
export function wallPieces(
  length: number,
  height: number,
  holes: readonly WallHole[]
): WallPiece[] {
  const clamp = (u: number) => Math.min(Math.max(u, 0), length)
  const xs = [
    ...new Set([
      0,
      length,
      ...holes.flatMap((h) => [clamp(h.u0), clamp(h.u1)]),
    ]),
  ].sort((a, b) => a - b)
  const pieces: WallPiece[] = []
  const open = new Map<string, WallPiece>()
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!
    const b = xs[i + 1]!
    if (b - a <= EPS) continue
    const covering = holes.filter((h) => h.u0 <= a + EPS && h.u1 >= b - EPS)
    const solid = subtractIntervals(
      [0, height],
      covering.map((h): Interval => [h.y0, h.y1])
    )
    const next = new Map<string, WallPiece>()
    for (const [y0, y1] of solid) {
      const key = `${y0}:${y1}`
      const previous = open.get(key)
      if (previous && Math.abs(previous.u1 - a) <= EPS) {
        previous.u1 = b
        next.set(key, previous)
      } else {
        const piece = { u0: a, u1: b, y0, y1 }
        pieces.push(piece)
        next.set(key, piece)
      }
    }
    open.clear()
    for (const [key, piece] of next) open.set(key, piece)
  }
  return pieces
}

/**
 * Where two walls' offset lines meet at the corner between them: `prev`
 * offset by `dPrev` and `next` offset by `dNext` (positive = into the room).
 * Gives the mitred corner of a strip that runs around the room.
 */
export function offsetCorner(
  prev: Wall,
  dPrev: number,
  next: Wall,
  dNext: number
): Point {
  const a0: Point = [
    prev.start[0] + prev.normal[0] * dPrev,
    prev.start[1] + prev.normal[1] * dPrev,
  ]
  const b0: Point = [
    next.start[0] + next.normal[0] * dNext,
    next.start[1] + next.normal[1] * dNext,
  ]
  const denominator = cross(prev.dir, next.dir)
  if (Math.abs(denominator) < 1e-9) return b0
  const s = cross(sub(b0, a0), next.dir) / denominator
  return [a0[0] + prev.dir[0] * s, a0[1] + prev.dir[1] * s]
}

class ShellBuilder {
  readonly walls: Wall[]
  readonly thickness: number[]
  readonly solids: ShellSolid[] = []

  constructor(
    readonly room: RoomGeometry,
    readonly height: number
  ) {
    this.walls = deriveWalls(room.corners)
    this.thickness = this.walls.map((wall) =>
      wallThickness(wall, room.features)
    )
  }

  prev(index: number): Wall {
    return this.walls[(index - 1 + this.walls.length) % this.walls.length]!
  }

  next(index: number): Wall {
    return this.walls[(index + 1) % this.walls.length]!
  }

  /** Outer corner at the start of wall `index`. */
  outerCorner(index: number): Point {
    const prevIndex = (index - 1 + this.walls.length) % this.walls.length
    return offsetCorner(
      this.walls[prevIndex]!,
      -this.thickness[prevIndex]!,
      this.walls[index]!,
      -this.thickness[index]!
    )
  }

  /**
   * A point on wall `index` at (u, d), mitred onto the neighbouring wall's
   * offset line when it sits on a corner. `neighbourOffset` maps this wall's
   * offset to the neighbour's (the same for skirting; the neighbour's own
   * thickness for the wall's back face).
   */
  stripPoint(
    index: number,
    u: number,
    d: number,
    neighbourOffset: (neighbour: number, d: number) => number
  ): Point {
    const wall = this.walls[index]!
    const n = this.walls.length
    if (Math.abs(u) <= EPS) {
      const p = (index - 1 + n) % n
      return offsetCorner(this.walls[p]!, neighbourOffset(p, d), wall, d)
    }
    if (Math.abs(u - wall.length) <= EPS) {
      const q = (index + 1) % n
      return offsetCorner(wall, d, this.walls[q]!, neighbourOffset(q, d))
    }
    return wallPoint(wall, u, d)
  }

  strip(
    index: number,
    u0: number,
    u1: number,
    d0: number,
    d1: number,
    neighbourOffset: (neighbour: number, d: number) => number
  ): Point[] {
    return [
      this.stripPoint(index, u0, d0, neighbourOffset),
      this.stripPoint(index, u1, d0, neighbourOffset),
      this.stripPoint(index, u1, d1, neighbourOffset),
      this.stripPoint(index, u0, d1, neighbourOffset),
    ]
  }

  /** A box in a wall's frame (no mitring). */
  box(
    wall: Wall,
    role: ShellRole,
    [u0, u1]: Interval,
    [d0, d1]: Interval,
    [y0, y1]: Interval,
    feature?: string
  ): void {
    const clampedU0 = Math.max(0, u0)
    const clampedU1 = Math.min(wall.length, u1)
    const top = Math.min(y1, this.height)
    if (clampedU1 - clampedU0 <= EPS || top - y0 <= EPS || d1 - d0 <= EPS) {
      return
    }
    this.solids.push({
      kind: "prism",
      role,
      wall: wall.id,
      ...(feature ? { feature } : {}),
      footprint: [
        wallPoint(wall, clampedU0, d0),
        wallPoint(wall, clampedU1, d0),
        wallPoint(wall, clampedU1, d1),
        wallPoint(wall, clampedU0, d1),
      ],
      y0,
      y1: top,
    })
  }

  wallCylinder(
    wall: Wall,
    role: ShellRole,
    u: number,
    d: number,
    radius: number,
    [y0, y1]: Interval,
    feature: string
  ): void {
    if (y1 - y0 <= EPS) return
    this.solids.push({
      kind: "cylinder",
      role,
      wall: wall.id,
      feature,
      center: wallPoint(wall, u, d),
      radius,
      y0,
      y1,
    })
  }
}

function wallFeatures(room: RoomGeometry, wall: Wall): WallFeature[] {
  return room.features.filter(
    (f): f is WallFeature => isWallFeature(f) && f.wall === wall.id
  )
}

function revealDepth(window: WindowFeature, thickness: number): number {
  const wanted = window.revealDepth ?? DEFAULT_REVEAL_DEPTH
  const max = thickness - WINDOW_FRAME.depth - WINDOW_FRAME.outerWall
  return Math.max(0, Math.min(wanted, max))
}

/**
 * Walls are 100 mm thick, or thicker where a window's reveal plus its frame
 * needs the depth (real external walls are deep; a deep reveal reads as a
 * window in renders).
 */
export function wallThickness(
  wall: Wall,
  features: readonly Feature[]
): number {
  let thickness = WALL_THICKNESS
  for (const f of features) {
    if (f.type !== "window" || f.wall !== wall.id) continue
    const reveal = f.revealDepth ?? DEFAULT_REVEAL_DEPTH
    thickness = Math.max(
      thickness,
      reveal + WINDOW_FRAME.depth + WINDOW_FRAME.outerWall
    )
  }
  return thickness
}

function isHole(
  f: WallFeature
): f is Extract<WallFeature, { type: "door" | "window" | "opening" }> {
  return f.type === "door" || f.type === "window" || f.type === "opening"
}

function addWalls(b: ShellBuilder): void {
  const H = b.height
  b.walls.forEach((wall, index) => {
    const holes: WallHole[] = wallFeatures(b.room, wall)
      .filter(isHole)
      .map((f) => ({
        feature: f.id,
        u0: f.offset,
        u1: f.offset + f.width,
        y0: f.bottom,
        y1: Math.min(f.bottom + f.height, H),
      }))
    const t = b.thickness[index]!
    for (const piece of wallPieces(wall.length, H, holes)) {
      b.solids.push({
        kind: "prism",
        role: "wall",
        wall: wall.id,
        footprint: b.strip(index, piece.u0, piece.u1, -t, 0, (n, d) =>
          d === 0 ? 0 : -b.thickness[n]!
        ),
        y0: piece.y0,
        y1: piece.y1,
      })
    }
  })
}

function addSkirting(b: ShellBuilder): void {
  const { height, depth } = b.room.skirting
  if (height <= 0 || depth <= 0) return
  const same = (_: number, d: number) => d
  b.walls.forEach((wall, index) => {
    const features = wallFeatures(b.room, wall)
    const cuts = features
      .filter((f) => (isHole(f) || f.type === "obstacle") && f.bottom < height)
      .map((f): Interval => [f.offset, f.offset + f.width])
    for (const [u0, u1] of subtractIntervals([0, wall.length], cuts)) {
      b.solids.push({
        kind: "prism",
        role: "skirting",
        wall: wall.id,
        footprint: b.strip(index, u0, u1, 0, depth, same),
        y0: 0,
        y1: Math.min(height, b.height),
      })
    }
    // Skirting wraps the exposed faces of obstacles standing on the floor.
    for (const f of features) {
      if (f.type !== "obstacle" || f.bottom >= height) continue
      const a = f.offset
      const c = f.offset + f.width
      const ys: Interval = [0, height]
      b.box(
        wall,
        "skirting",
        [a - depth, c + depth],
        [f.depth, f.depth + depth],
        ys,
        f.id
      )
      if (a - depth >= 0)
        b.box(wall, "skirting", [a - depth, a], [0, f.depth], ys, f.id)
      if (c + depth <= wall.length)
        b.box(wall, "skirting", [c, c + depth], [0, f.depth], ys, f.id)
    }
  })
}

function addDoor(b: ShellBuilder, wall: Wall, door: DoorFeature): void {
  const t = b.thickness[wall.index]!
  const top = Math.min(door.bottom + door.height, b.height)
  const leaves = door.leaves ?? 1
  const { leafThickness, gap, floorGap, setBack } = DOOR
  // The leaf sits towards the side it opens to.
  const leafD: Interval =
    door.swing === "in"
      ? [-setBack - leafThickness, -setBack]
      : door.swing === "out"
        ? [-t + setBack, -t + setBack + leafThickness]
        : [-t / 2 - leafThickness / 2, -t / 2 + leafThickness / 2]
  const leafWidth = (door.width - 2 * gap - (leaves - 1) * gap) / leaves
  for (let k = 0; k < leaves; k++) {
    const u0 = door.offset + gap + k * (leafWidth + gap)
    b.box(
      wall,
      "door",
      [u0, u0 + leafWidth],
      leafD,
      [door.bottom + floorGap, top - gap],
      door.id
    )
  }
  // Lever handles on the room side, at the latch edge of each leaf.
  const latchEdges: { edge: number; towardsHinge: 1 | -1 }[] =
    leaves === 2
      ? [
          { edge: door.offset + door.width / 2, towardsHinge: -1 },
          { edge: door.offset + door.width / 2, towardsHinge: 1 },
        ]
      : door.hinge === "start"
        ? [{ edge: door.offset + door.width, towardsHinge: -1 }]
        : [{ edge: door.offset, towardsHinge: 1 }]
  const hy = door.bottom + DOOR.handleHeight
  const face = leafD[1]
  for (const { edge, towardsHinge } of latchEdges) {
    const u = edge + towardsHinge * DOOR.handleInset
    b.box(
      wall,
      "handle",
      [u - 10, u + 10],
      [face, face + 50],
      [hy - 10, hy + 10],
      door.id
    )
    const lever: Interval =
      towardsHinge === 1 ? [u, u + DOOR.leverLength] : [u - DOOR.leverLength, u]
    b.box(
      wall,
      "handle",
      lever,
      [face + 38, face + 54],
      [hy - 9, hy + 9],
      door.id
    )
  }
  addArchitrave(
    b,
    wall,
    door.offset,
    door.offset + door.width,
    door.bottom,
    top,
    door.id
  )
}

function addArchitrave(
  b: ShellBuilder,
  wall: Wall,
  u0: number,
  u1: number,
  bottom: number,
  top: number,
  feature: string
): void {
  const { width, depth } = ARCHITRAVE
  const d: Interval = [0, depth]
  const head = Math.min(top + width, b.height)
  b.box(wall, "architrave", [u0 - width, u0], d, [bottom, head], feature)
  b.box(wall, "architrave", [u1, u1 + width], d, [bottom, head], feature)
  if (top < b.height)
    b.box(wall, "architrave", [u0, u1], d, [top, head], feature)
}

function addWindow(
  b: ShellBuilder,
  wall: Wall,
  win: WindowFeature
): WindowLight {
  const t = b.thickness[wall.index]!
  const reveal = revealDepth(win, t)
  const { width: fw, depth: fd, mullion, maxPane, glass } = WINDOW_FRAME
  const u0 = win.offset
  const u1 = win.offset + win.width
  const bottom = win.bottom
  const top = Math.min(win.bottom + win.height, b.height)
  const frameD: Interval = [-reveal - fd, -reveal]
  b.box(wall, "window-frame", [u0, u0 + fw], frameD, [bottom, top], win.id)
  b.box(wall, "window-frame", [u1 - fw, u1], frameD, [bottom, top], win.id)
  b.box(
    wall,
    "window-frame",
    [u0 + fw, u1 - fw],
    frameD,
    [top - fw, top],
    win.id
  )
  b.box(
    wall,
    "window-frame",
    [u0 + fw, u1 - fw],
    frameD,
    [bottom, bottom + fw],
    win.id
  )
  const inner = u1 - u0 - 2 * fw
  const panes = Math.max(1, Math.ceil(inner / maxPane))
  const paneWidth = (inner - (panes - 1) * mullion) / panes
  for (let k = 1; k < panes; k++) {
    const m0 = u0 + fw + k * paneWidth + (k - 1) * mullion
    b.box(
      wall,
      "window-frame",
      [m0, m0 + mullion],
      frameD,
      [bottom + fw, top - fw],
      win.id
    )
  }
  const mid = -reveal - fd / 2
  b.box(
    wall,
    "glass",
    [u0 + fw, u1 - fw],
    [mid - glass / 2, mid + glass / 2],
    [bottom + fw, top - fw],
    win.id
  )
  // Internal sill: from the frame to `sillDepth` proud of the plaster,
  // standing a little above the opening's bottom so faces never coincide.
  const sillDepth = win.sillDepth ?? DEFAULT_SILL_DEPTH
  if (bottom > 0) {
    b.box(
      wall,
      "sill",
      [u0 - WINDOW_FRAME.sillEars, u1 + WINDOW_FRAME.sillEars],
      [-reveal, sillDepth],
      [bottom - 5, bottom + WINDOW_FRAME.sillThickness - 5],
      win.id
    )
  }
  const centre = wallPoint(wall, (u0 + u1) / 2, 0)
  return {
    feature: win.id,
    wall: wall.id,
    center: [centre[0], (bottom + top) / 2, centre[1]],
    inward: wall.normal,
    width: win.width,
    height: top - bottom,
  }
}

function addRadiator(b: ShellBuilder, wall: Wall, rad: RadiatorFeature): void {
  const front = rad.depth
  const back = Math.max(Math.min(15, front / 2), front - 70)
  const ys: Interval = [rad.bottom, rad.bottom + rad.height]
  b.box(
    wall,
    "radiator",
    [rad.offset, rad.offset + rad.width],
    [back, front - 10],
    ys,
    rad.id
  )
  // Convector fins on the front panel.
  const finWidth = 22
  const pitch = 45
  const count = Math.max(1, Math.floor((rad.width - 30) / pitch))
  const start = rad.offset + (rad.width - (count - 1) * pitch - finWidth) / 2
  for (let k = 0; k < count; k++) {
    const u = start + k * pitch
    b.box(wall, "radiator", [u, u + finWidth], [front - 10, front], ys, rad.id)
  }
  // Feed pipes down to the floor.
  if (rad.bottom > 0) {
    const d = (back + front - 10) / 2
    for (const u of [rad.offset + 25, rad.offset + rad.width - 25]) {
      b.wallCylinder(wall, "pipe", u, d, 8, [0, rad.bottom], rad.id)
    }
  }
}

function addWallFeature(
  b: ShellBuilder,
  wall: Wall,
  f: WallFeature,
  windows: WindowLight[]
): void {
  const ys: Interval = [f.bottom, f.bottom + f.height]
  const span: Interval = [f.offset, f.offset + f.width]
  switch (f.type) {
    case "door":
      return addDoor(b, wall, f)
    case "window":
      windows.push(addWindow(b, wall, f))
      return
    case "opening":
      return
    case "radiator":
      return addRadiator(b, wall, f)
    case "obstacle":
      return b.box(wall, "obstacle", span, [0, f.depth], ys, f.id)
    case "socket":
    case "switch":
    case "data":
    case "aerial":
      return b.box(wall, "plate", span, [0, PLATE_DEPTH], ys, f.id)
    case "wall-light":
      return b.box(wall, "light", span, [0, 90], ys, f.id)
  }
}

function addFloorAndCeilingFeatures(b: ShellBuilder): void {
  const H = b.height
  for (const f of b.room.features) {
    if (isFloorFeature(f)) {
      const t = placementTransform({
        x: f.x,
        z: f.z,
        facing: f.facing ?? 180,
        elevation: 0,
      })
      const w = f.width / 2
      const d = f.depth / 2
      const footprint = [
        t.toPlan(-w, -d),
        t.toPlan(w, -d),
        t.toPlan(w, d),
        t.toPlan(-w, d),
      ]
      const role: ShellRole =
        f.type === "hearth"
          ? "hearth"
          : f.type === "floor-socket"
            ? "plate"
            : "obstacle"
      const height =
        f.type === "floor-socket" ? Math.min(f.height, 5) : f.height
      b.solids.push({
        kind: "prism",
        role,
        feature: f.id,
        footprint,
        y0: 0,
        y1: height,
      })
    } else if (isCeilingFeature(f)) {
      const center: Point = [f.x, f.z]
      const ceiling = {
        kind: "cylinder",
        feature: f.id,
        center,
        ceiling: true,
      } as const
      switch (f.type) {
        case "pendant": {
          b.solids.push({
            ...ceiling,
            role: "light",
            radius: 55,
            y0: H - 25,
            y1: H,
          })
          if (f.drop && f.drop > 85) {
            const holder = H - f.drop
            b.solids.push({
              ...ceiling,
              role: "light",
              radius: 4,
              y0: holder,
              y1: H - 25,
            })
            b.solids.push({
              ...ceiling,
              role: "light",
              radius: 20,
              y0: holder - 60,
              y1: holder,
            })
          }
          break
        }
        case "ceiling-light":
          b.solids.push({
            ...ceiling,
            role: "light",
            radius: 170,
            y0: H - 90,
            y1: H,
          })
          break
        case "spotlight":
          b.solids.push({
            ...ceiling,
            role: "light",
            radius: 45,
            y0: H - 8,
            y1: H,
          })
          break
        case "smoke-alarm":
          b.solids.push({
            ...ceiling,
            role: "light",
            radius: 60,
            y0: H - 45,
            y1: H,
          })
          break
      }
    }
  }
}

/** Builds every fixed solid of the room: slab, walls, joinery and fittings. */
export function buildRoomShell(room: RoomGeometry): RoomShell {
  const H = room.ceilingHeight
  const b = new ShellBuilder(room, H)
  const outline = b.walls.map((_, index) => b.outerCorner(index))
  b.solids.push({
    kind: "prism",
    role: "floor",
    footprint: outline,
    y0: -FLOOR_THICKNESS,
    y1: 0,
  })
  b.solids.push({
    kind: "prism",
    role: "ceiling",
    ceiling: true,
    footprint: outline,
    y0: H,
    y1: H + CEILING_THICKNESS,
  })
  addWalls(b)
  addSkirting(b)
  const windows: WindowLight[] = []
  for (const wall of b.walls) {
    for (const f of wallFeatures(room, wall))
      addWallFeature(b, wall, f, windows)
  }
  addFloorAndCeilingFeatures(b)
  return {
    walls: b.walls,
    thickness: b.thickness,
    floor: room.corners.map(([x, z]): Point => [x, z]),
    outline,
    ceilingHeight: H,
    solids: b.solids,
    windows,
  }
}

export interface ShellBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minY: number
  maxY: number
}

/** Room-space bounds of the shell including wall thickness and slabs (mm). */
export function shellBounds(shell: RoomShell): ShellBounds {
  const plan = bounds(shell.outline)
  return {
    minX: plan.minX,
    maxX: plan.maxX,
    minZ: plan.minZ,
    maxZ: plan.maxZ,
    minY: -FLOOR_THICKNESS,
    maxY: shell.ceilingHeight + CEILING_THICKNESS,
  }
}

/**
 * Walls whose room-side face points away from a viewpoint outside the room,
 * i.e. walls the viewer looks through from behind. Orbit views cut these.
 */
export function wallsFacingAway(
  walls: readonly Wall[],
  viewpoint: Point
): WallId[] {
  return walls
    .filter((wall) => {
      const mid: Point = [
        (wall.start[0] + wall.end[0]) / 2,
        (wall.start[1] + wall.end[1]) / 2,
      ]
      const rel = sub(viewpoint, mid)
      return rel[0] * wall.normal[0] + rel[1] * wall.normal[1] < 0
    })
    .map((wall) => wall.id)
}

/**
 * Cuts the given walls (and everything attached to them) down to `maxY` mm,
 * dropping solids that start above it. Used by the orbit "dollhouse" view.
 */
export function cutWalls(
  solids: readonly ShellSolid[],
  walls: readonly WallId[],
  maxY: number
): ShellSolid[] {
  const cut = new Set(walls)
  const out: ShellSolid[] = []
  for (const solid of solids) {
    if (!solid.wall || !cut.has(solid.wall)) {
      out.push(solid)
    } else if (solid.y0 < maxY - EPS) {
      out.push({ ...solid, y1: Math.min(solid.y1, maxY) })
    }
  }
  return out
}
