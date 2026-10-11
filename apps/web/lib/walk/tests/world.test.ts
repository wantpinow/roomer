import { describe, expect, it } from "vitest"

import {
  FIXTURE_ASSETS,
  FIXTURE_PLACEMENTS,
  FIXTURE_ROOM,
} from "@/lib/scene/fixture-scene"

import { PLAYER } from "../player"
import { blocks, buildWalkWorld, groundAt, isFree, nearestFree } from "../world"

const world = buildWalkWorld({
  room: FIXTURE_ROOM,
  placements: FIXTURE_PLACEMENTS,
  assets: FIXTURE_ASSETS,
})

const byId = (id: string) => world.colliders.filter((c) => c.id === id)

describe("buildWalkWorld", () => {
  it("encloses the walker in the room outline, clear of the skirting", () => {
    expect(world.outline).toEqual(FIXTURE_ROOM.corners)
    expect(world.wallInset).toBe(18)
    expect(world.ceilingHeight).toBe(2450)
    expect(world.wallLabels[5]).toBe("the wall W6")
  })

  it("adds one collider per placed part, named after the item", () => {
    const sofa = byId("sofa")
    expect(sofa).toHaveLength(FIXTURE_ASSETS["test-sofa"].geometry.parts.length)
    expect(sofa.every((c) => c.label === "Test three-seat sofa")).toBe(true)
  })

  it("makes rugs walkable surfaces, never walls", () => {
    const [rug] = byId("rug")
    expect(rug!.walkable).toBe(true)
    expect(blocks(rug!, 0, 1830)).toBe(false)
  })

  it("includes the pier, the radiator and the window sill as fixed obstacles", () => {
    const [pier] = byId("OB1")
    expect(pier).toMatchObject({
      kind: "feature",
      label: "Wall pier",
      y0: 0,
      y1: 2450,
    })
    const [radiator] = byId("RAD1")
    expect(radiator).toMatchObject({ y0: 150, y1: 600 })
    expect(byId("WIN1")).toHaveLength(1)
  })

  it("hangs the ceiling beam overhead: clear of a standing six-footer", () => {
    const [beam] = byId("BM1")
    expect(beam).toMatchObject({
      label: "the ceiling beam",
      y0: 2220,
      y1: 2450,
    })
    expect(blocks(beam!, 0, 1830)).toBe(false)
    // Standing on a 420 mm coffee table, though, it's at head height.
    expect(blocks(beam!, 420, 1830)).toBe(true)
  })

  it("only lets a six-footer stand where his head clears the ceiling", () => {
    const coffeeTop = byId("coffee-table").find((c) => c.y1 === 420)!
    const diningTop = byId("dining-table").find((c) => c.y1 === 750)!
    expect(coffeeTop.standable).toBe(true)
    expect(diningTop.standable).toBe(false)
    // So the dining table blocks even someone standing on a chair.
    expect(blocks(diningTop, 480, 1830)).toBe(true)
    expect(blocks(coffeeTop, 300, 1830)).toBe(false)
  })
})

describe("groundAt", () => {
  it("is the floor in open space and the rug's top on the rug", () => {
    expect(groundAt(world, [1500, 1500], 0)).toBe(0)
    expect(groundAt(world, [1500, 3000], 0)).toBe(10)
  })

  it("only counts surfaces within a step of the feet", () => {
    expect(groundAt(world, [1618, 3950], 0)).toBe(10)
    expect(groundAt(world, [1618, 3950], 300)).toBe(420)
  })
})

describe("spawn", () => {
  it("stands just inside the first door (D1), facing into the room, in free space", () => {
    const [x, z] = world.spawn.position
    expect(x).toBeCloseTo(1550)
    expect(z).toBeCloseTo(300)
    expect(world.spawn.heading).toBeCloseTo(180)
    expect(isFree(world, world.spawn.position)).toBe(true)
  })

  it("moves to the nearest free spot when something stands at the door", () => {
    const blocked = buildWalkWorld({
      room: FIXTURE_ROOM,
      placements: [
        {
          id: "box",
          assetId: "test-sideboard",
          x: 1550,
          z: 400,
          facing: 180,
          elevation: 0,
        },
      ],
      assets: FIXTURE_ASSETS,
    })
    const [x, z] = blocked.spawn.position
    expect(isFree(blocked, blocked.spawn.position)).toBe(true)
    // The sideboard covers z 175..625 here, so the walker ends up past it.
    expect(Math.hypot(x - 1550, z - 300)).toBeLessThan(1000)
    expect(
      z - PLAYER.radius >= 625 - 1 ||
        x + PLAYER.radius <= 750 + 1 ||
        x - PLAYER.radius >= 2350 - 1
    ).toBe(true)
  })

  it("keeps the preferred spot when it is free", () => {
    expect(nearestFree(world, [1500, 1500])).toEqual([1500, 1500])
  })
})
