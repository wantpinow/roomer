import type { Point } from "@roomer/core/geometry"
import { describe, expect, it } from "vitest"

import {
  FIXTURE_ASSETS,
  FIXTURE_PLACEMENTS,
  FIXTURE_ROOM,
} from "@/lib/scene/fixture-scene"

import {
  advanceWalk,
  createWalkState,
  eyeHeight,
  headBob,
  IDLE,
  reseat,
  stepWalk,
  teleport,
  type WalkInput,
  type WalkState,
} from "../physics"
import { JUMP_SPEED, PLAYER, SUBSTEP } from "../player"
import { buildWalkWorld, isFree, type WalkWorld } from "../world"

const world = buildWalkWorld({
  room: FIXTURE_ROOM,
  placements: FIXTURE_PLACEMENTS,
  assets: FIXTURE_ASSETS,
})

const SKIRTING = 18
const CLEARANCE = PLAYER.radius + SKIRTING

/** Runs `seconds` of 60 fps frames with the same input. */
function hold(
  state: WalkState,
  input: Partial<WalkInput>,
  seconds: number,
  w: WalkWorld = world
): WalkState {
  const full: WalkInput = { ...IDLE, heading: state.heading, ...input }
  let s = state
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60)
    s = advanceWalk(w, s, full, 1 / 60)
  return s
}

function at(position: Point, heading: number, feet?: number): WalkState {
  return teleport(world, createWalkState(world), position, heading, feet)
}

describe("createWalkState", () => {
  it("starts at the spawn, standing, at rest", () => {
    const s = createWalkState(world)
    expect(s.position).toEqual(world.spawn.position)
    expect(s).toMatchObject({ feet: 0, vy: 0, grounded: true, bump: null })
    expect(eyeHeight(world, s)).toBe(world.player.eyeHeight)
    expect(world.player).toEqual({ height: 1830, eyeHeight: 1711 })
  })
})

describe("walking", () => {
  it("walks at 1.4 m/s and runs at 3 m/s", () => {
    const start = createWalkState(world)
    const walk = hold(start, { forward: 1 }, 1)
    const run = hold(start, { forward: 1, run: true }, 1)
    expect(Math.hypot(...walk.velocity)).toBeCloseTo(PLAYER.walkSpeed, -1)
    expect(Math.hypot(...run.velocity)).toBeCloseTo(PLAYER.runSpeed, -1)
    expect(run.position[1] - start.position[1]).toBeGreaterThan(
      2 * (walk.position[1] - start.position[1])
    )
  })

  it("moves relative to the heading: forward, back and sideways", () => {
    const start = at([1500, 1500], 90)
    expect(hold(start, { forward: 1 }, 0.5).position[0]).toBeGreaterThan(1800)
    expect(hold(start, { forward: -1 }, 0.5).position[0]).toBeLessThan(1200)
    // Facing +x, right is +z (down the plan).
    expect(hold(start, { strafe: 1 }, 0.5).position[1]).toBeGreaterThan(1800)
  })

  it("doesn't go faster diagonally", () => {
    const s = hold(at([1500, 1500], 180), { forward: 1, strafe: 1 }, 1)
    expect(Math.hypot(...s.velocity)).toBeCloseTo(PLAYER.walkSpeed, -1)
  })

  it("comes to rest when the keys are released", () => {
    const moving = hold(at([1500, 1500], 180), { forward: 1 }, 0.5)
    const stopped = hold(moving, {}, 1)
    expect(Math.hypot(...stopped.velocity)).toBeLessThan(1)
    expect(headBob(stopped)).toBeCloseTo(0, 1)
  })

  it("is deterministic", () => {
    const run = () =>
      hold(
        hold(createWalkState(world), { forward: 1, strafe: 0.3 }, 2),
        { jump: true },
        0.5
      )
    expect(run()).toEqual(run())
  })

  it("bobs the head while walking, not while standing", () => {
    expect(headBob(createWalkState(world))).toBe(0)
    const s = hold(createWalkState(world), { forward: 1 }, 0.9)
    expect(Math.abs(headBob(s))).toBeGreaterThan(0)
    expect(Math.abs(headBob(s))).toBeLessThanOrEqual(14)
  })
})

describe("collisions", () => {
  it("stops at the sofa and slides along its front", () => {
    const start = at([1500, 3000], 260)
    const s = hold(start, { forward: 1 }, 0.8)
    // The sofa's front is x = 968; the body stops a radius away…
    expect(s.position[0]).toBeGreaterThan(968 + PLAYER.radius - 1)
    expect(s.position[0]).toBeLessThan(968 + PLAYER.radius + 5)
    // …and keeps sliding down the plan along it.
    expect(s.position[1]).toBeGreaterThan(start.position[1] + 50)
    expect(s.bump).toMatchObject({
      bumped: "sofa",
      kind: "placement",
      label: "Test three-seat sofa",
    })
  })

  it("can't walk through a wall", () => {
    const s = hold(at([1500, 1400], 270), { forward: 1, run: true }, 3)
    expect(s.position[0]).toBeGreaterThanOrEqual(CLEARANCE - 1)
    expect(s.bump).toMatchObject({
      bumped: "wall",
      kind: "wall",
      label: "the wall W6",
    })
  })

  it("can't walk through the pier", () => {
    const s = hold(at([1000, 2270], 270), { forward: 1, run: true }, 3)
    expect(s.position[0]).toBeGreaterThanOrEqual(120 + PLAYER.radius - 1e-3)
    expect(s.bump).toMatchObject({ bumped: "OB1", label: "Wall pier" })
  })

  it("wedges into a corner without tunnelling", () => {
    const s = hold(at([700, 700], 315), { forward: 1, run: true }, 3)
    expect(s.position[0]).toBeCloseTo(CLEARANCE, 0)
    expect(s.position[1]).toBeCloseTo(CLEARANCE, 0)
    expect(isFree(world, s.position)).toBe(true)
  })

  it("slides round the pier into the corner it makes with the sofa's end", () => {
    // Heading down-left along W6: the 120 mm pier is shallower than the
    // body, so the walker slides round its corner, down its face, and
    // wedges against the end of the sofa (z 2850) — never through either.
    let s = at([700, 1200], 225)
    for (let i = 0; i < 30; i++) {
      s = hold(s, { forward: 1, run: true }, 0.1)
      expect(isFree(world, s.position)).toBe(true)
    }
    expect(s.position[0]).toBeCloseTo(120 + PLAYER.radius, 0)
    expect(s.position[1]).toBeCloseTo(2850 - PLAYER.radius, 0)
  })

  it("won't squeeze through a gap narrower than the body", () => {
    // Between the sofa (front x 968) and the coffee table (x 1318): 350 mm.
    const s = hold(at([1268, 3050], 180), { forward: 1, run: true }, 3)
    expect(s.position[1]).toBeLessThan(3400)
    expect(isFree(world, s.position)).toBe(true)
  })

  it("never ends up inside anything on a long random-ish walk", () => {
    let s = createWalkState(world)
    for (let i = 0; i < 40; i++) {
      s = hold(
        s,
        {
          forward: 1,
          strafe: Math.sin(i),
          run: i % 3 === 0,
          heading: (i * 97) % 360,
        },
        0.4
      )
      expect(isFree(world, s.position)).toBe(true)
    }
  })
})

describe("standing on things", () => {
  it("walks onto the rug", () => {
    const s = hold(at([1500, 2650], 180), { forward: 1 }, 0.3)
    expect(s.position[1]).toBeGreaterThan(2700)
    expect(s.feet).toBe(10)
    expect(s.grounded).toBe(true)
  })

  it("can't step onto the coffee table without jumping", () => {
    const s = hold(at([1618, 3000], 180), { forward: 1 }, 2)
    expect(s.position[1]).toBeLessThanOrEqual(3400 - PLAYER.radius + 1)
    expect(s.feet).toBe(10)
    expect(s.bump).toMatchObject({ bumped: "coffee-table" })
  })

  it("jumps onto the coffee table and stands there", () => {
    const blocked = hold(at([1618, 3000], 180), { forward: 1 }, 0.6)
    const jumped = hold(blocked, { forward: 1, jump: true }, 0.4)
    const standing = hold(jumped, {}, 1)
    expect(standing.feet).toBe(420)
    expect(standing.grounded).toBe(true)
    expect(standing.position[1]).toBeGreaterThan(3400 - PLAYER.radius)
    expect(eyeHeight(world, standing)).toBeCloseTo(
      420 + world.player.eyeHeight,
      0
    )
  })

  it("lands back on the floor after walking off the table", () => {
    const onTable = teleport(
      world,
      createWalkState(world),
      [1618, 3950],
      180,
      420
    )
    const settled = hold(onTable, {}, 0.2)
    expect(settled.feet).toBe(420)
    // Off the table onto the rug (to z 4950), then onto the bare floor.
    const off = hold(settled, { forward: 1 }, 1.5)
    expect(off.position[1]).toBeGreaterThan(4950 + PLAYER.radius)
    expect(off.feet).toBe(0)
  })

  it("can't climb onto the dining table: a six-footer wouldn't fit under the ceiling", () => {
    // From a chair seat (480 mm), the table top (750) is within a jump but
    // 750 + 1830 > 2450.
    const onChair = hold(
      teleport(world, createWalkState(world), [635, 5740], 180, 480),
      {},
      0.2
    )
    expect(onChair.feet).toBe(480)
    const tried = hold(hold(onChair, { forward: 1, jump: true }, 0.6), {}, 1)
    expect(tried.feet).toBeLessThan(750)
  })
})

describe("jumping", () => {
  it("rises to the jump height and lands", () => {
    let s = at([1500, 1500], 180)
    let apex = 0
    s = advanceWalk(world, s, { ...IDLE, heading: 180, jump: true }, SUBSTEP)
    expect(s.vy).toBeCloseTo(JUMP_SPEED - PLAYER.gravity * SUBSTEP, 0)
    for (let i = 0; i < 120; i++) {
      s = advanceWalk(world, s, { ...IDLE, heading: 180, jump: true }, SUBSTEP)
      apex = Math.max(apex, s.feet)
    }
    expect(apex).toBeGreaterThan(480)
    expect(apex).toBeLessThanOrEqual(500)
    expect(s.feet).toBe(0)
    expect(s.grounded).toBe(true)
  })

  it("only jumps from the ground, and a held key doesn't bounce", () => {
    let s = at([1500, 1500], 180)
    s = hold(s, { jump: true }, 1.2)
    // Landed while still holding jump: no second jump.
    expect(s.feet).toBe(0)
    expect(s.vy).toBe(0)
    const midAir = hold(at([1500, 1500], 180), { jump: true }, 0.1)
    const again = stepWalk(
      world,
      { ...midAir, jumpHeld: false },
      { ...IDLE, heading: 180, jump: true }
    )
    expect(again.vy).toBeLessThan(midAir.vy)
  })

  it("bumps its head on the ceiling jumping from the sofa", () => {
    // Sofa cushions are 560 mm up: 560 + 1830 + a 500 mm jump > 2450.
    const onSofa = hold(
      teleport(world, createWalkState(world), [520, 3950], 90, 560),
      {},
      0.2
    )
    expect(onSofa.feet).toBe(560)
    let s = onSofa
    let highest = 0
    for (let i = 0; i < 60; i++) {
      s = advanceWalk(world, s, { ...IDLE, heading: 90, jump: true }, 1 / 60)
      highest = Math.max(highest, s.feet + world.player.height)
    }
    expect(highest).toBeLessThanOrEqual(2450)
    expect(s.bump).toMatchObject({
      bumped: "ceiling",
      kind: "ceiling",
      label: "the ceiling",
    })
    expect(s.feet).toBe(560)
  })
})

describe("stature", () => {
  const short = buildWalkWorld({
    room: FIXTURE_ROOM,
    placements: FIXTURE_PLACEMENTS,
    assets: FIXTURE_ASSETS,
    statureMm: 1626, // 5′4″
  })

  it("sets eye height from stature", () => {
    expect(short.player).toEqual({ height: 1626, eyeHeight: 1520 })
    expect(eyeHeight(short, createWalkState(short))).toBe(1520)
  })

  it("lets a 5′4″ walker stand on the dining table under a 2,450 mm ceiling", () => {
    // 750 + 1626 = 2376 ≤ 2450; for a six-footer 750 + 1830 = 2580 is not.
    const onTable = teleport(
      short,
      createWalkState(short),
      [1085, 6300],
      180,
      750
    )
    const settled = hold(onTable, {}, 0.3, short)
    expect(settled.feet).toBe(750)
    expect(settled.grounded).toBe(true)
    const tall = teleport(world, createWalkState(world), [1085, 6300], 180, 750)
    expect(hold(tall, {}, 0.3).feet).toBeLessThan(750)
  })

  it("bumps heads at the new height", () => {
    // A 4′10″ walker jumping under the beam (underside 2220) tops out at
    // 1473 + 500 = 1973: no bump. A 6′10″ walker hits it.
    const jumpUnderBeam = (w: WalkWorld) => {
      let s = teleport(w, createWalkState(w), [1500, 2650], 180)
      for (let i = 0; i < 60; i++) {
        s = advanceWalk(w, s, { ...IDLE, heading: 180, jump: true }, 1 / 60)
      }
      return s
    }
    const make = (statureMm: number) =>
      buildWalkWorld({
        room: FIXTURE_ROOM,
        placements: FIXTURE_PLACEMENTS,
        assets: FIXTURE_ASSETS,
        statureMm,
      })
    expect(jumpUnderBeam(make(1473)).bump).toBeNull()
    expect(jumpUnderBeam(make(2083)).bump).toMatchObject({ bumped: "BM1" })
  })
})

describe("reseat", () => {
  it("keeps the walker's spot and heading in a rebuilt world", () => {
    const moved = hold(at([1500, 1500], 135), { forward: 1 }, 0.5)
    const taller = buildWalkWorld({
      room: FIXTURE_ROOM,
      placements: FIXTURE_PLACEMENTS,
      assets: FIXTURE_ASSETS,
      statureMm: 1930,
    })
    const s = reseat(taller, moved)
    expect(s.position).toEqual(moved.position)
    expect(s.heading).toBe(135)
    expect(s.velocity).toEqual([0, 0])
    expect(eyeHeight(taller, s)).toBe(Math.round(1930 * 0.935))
  })

  it("keeps someone standing on the coffee table up there", () => {
    const onTable = hold(
      teleport(world, createWalkState(world), [1618, 3950], 180, 420),
      {},
      0.2
    )
    const s = reseat(
      buildWalkWorld({
        room: FIXTURE_ROOM,
        placements: FIXTURE_PLACEMENTS,
        assets: FIXTURE_ASSETS,
        statureMm: 1700,
      }),
      onTable
    )
    expect(s.feet).toBe(420)
  })

  it("steps aside when furniture now stands where the walker was", () => {
    const standing = at([1500, 1500], 180)
    const blocked = buildWalkWorld({
      room: FIXTURE_ROOM,
      placements: [
        ...FIXTURE_PLACEMENTS,
        {
          id: "box",
          assetId: "test-sideboard",
          x: 1500,
          z: 1500,
          facing: 180,
          elevation: 0,
        },
      ],
      assets: FIXTURE_ASSETS,
    })
    const s = reseat(blocked, standing)
    expect(s.position).not.toEqual(standing.position)
    expect(isFree(blocked, s.position)).toBe(true)
  })
})

describe("the ceiling beam", () => {
  it("walks under it without a bump", () => {
    const s = hold(at([1500, 2000], 180), { forward: 1 }, 0.7)
    expect(s.position[1]).toBeGreaterThan(2775)
    expect(s.bump).toBeNull()
  })

  it("bumps the head jumping under it", () => {
    let s = at([1500, 2650], 180)
    let highest = 0
    for (let i = 0; i < 60; i++) {
      s = advanceWalk(world, s, { ...IDLE, heading: 180, jump: true }, 1 / 60)
      highest = Math.max(highest, s.feet + world.player.height)
    }
    expect(highest).toBeLessThanOrEqual(2220)
    expect(s.bump).toMatchObject({
      bumped: "BM1",
      kind: "feature",
      label: "the ceiling beam",
    })
  })
})

describe("advanceWalk", () => {
  it("runs whole fixed steps and carries the remainder", () => {
    const s = advanceWalk(
      world,
      createWalkState(world),
      { ...IDLE, heading: 180 },
      0.02
    )
    expect(s.time).toBeCloseTo(2 * SUBSTEP)
    expect(s.carry).toBeCloseTo(0.02 - 2 * SUBSTEP)
  })

  it("clips a stalled frame instead of teleporting", () => {
    const s = advanceWalk(
      world,
      createWalkState(world),
      { ...IDLE, heading: 180, forward: 1 },
      5
    )
    expect(s.time).toBeCloseTo(0.1, 2)
  })
})
