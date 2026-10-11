import { describe, expect, it } from "vitest"

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_CORNERS,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_SKIRTING,
  TEST_ASSETS,
} from "@roomer/core/fixtures"
import { area, type Point, type RoomGeometry } from "@roomer/core/geometry"
import type { AssetSpec, Placement } from "@roomer/core/schema"

import {
  centreHeight,
  clampLift,
  clipToConvex,
  describeHeight,
  elevationBadge,
  heightKind,
  heightSelection,
  liftOps,
  parseHeight,
  restLabel,
  setElevationOps,
  sharedElevation,
  supportSurfaces,
  withElevation,
  type PlacedThing,
} from "../elevation"
import { previewOps } from "../optimistic"

const room: RoomGeometry = {
  corners: LIVING_ROOM_CORNERS,
  ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
  skirting: LIVING_ROOM_SKIRTING,
  features: LIVING_ROOM_FEATURES,
}

/** A table lamp: a 180mm base disc, a stem and a shade, 500mm tall. */
const LAMP: AssetSpec = {
  name: "Table lamp",
  category: "lighting",
  mount: "floor",
  dims: { w: 300, d: 300, h: 500 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "cylinder",
        name: "base",
        position: [0, 10, 0],
        radiusTop: 90,
        radiusBottom: 90,
        height: 20,
      },
      {
        shape: "cylinder",
        name: "stem",
        position: [0, 160, 0],
        radiusTop: 10,
        radiusBottom: 10,
        height: 280,
      },
      {
        shape: "cylinder",
        name: "shade",
        position: [0, 400, 0],
        radiusTop: 100,
        radiusBottom: 150,
        height: 200,
      },
    ],
  },
}

/** A floating wall shelf, 600 × 300, 20mm thick. */
const SHELF: AssetSpec = {
  name: "Wall shelf",
  category: "storage",
  mount: "wall",
  dims: { w: 600, d: 300, h: 20 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "box",
        name: "board",
        position: [0, 10, 0],
        size: [600, 20, 300],
      },
    ],
  },
}

/** A plant whose pot sits on 50mm feet that start 50mm up its model. */
const LIFTED_POT: AssetSpec = {
  ...LAMP,
  name: "Pot on feet",
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "cylinder",
        name: "pot",
        position: [0, 250, 0],
        radiusTop: 120,
        radiusBottom: 120,
        height: 400,
      },
    ],
  },
}

const place = (
  id: string,
  assetId: string,
  x: number,
  z: number,
  elevation = 0,
  facing = 180
): Placement => ({ id, assetId, x, z, facing, elevation })

const ASSETS: Record<string, AssetSpec> = {
  lamp: LAMP,
  sideboard: TEST_ASSETS.sideboard,
  table: TEST_ASSETS.coffeeTable,
  rug: TEST_ASSETS.rug,
  tv: TEST_ASSETS.wallTv,
  pendant: TEST_ASSETS.pendantLamp,
  shelf: SHELF,
  pot: LIFTED_POT,
}

const thing = (placement: Placement, name?: string): PlacedThing => ({
  placement,
  asset: ASSETS[placement.assetId]!,
  name: name ?? ASSETS[placement.assetId]!.name,
})

// The sideboard is 1600 × 450 at (1500, 2000); its top is 750mm up.
const sideboard = place("sideboard", "sideboard", 1500, 2000)

describe("heightKind", () => {
  it("reads floor, wall and ceiling items", () => {
    expect(heightKind("floor")).toBe("floor")
    expect(heightKind("floor-covering")).toBe("floor")
    expect(heightKind("wall")).toBe("wall")
    expect(heightKind("ceiling")).toBe("ceiling")
  })
})

describe("clampLift and liftOps", () => {
  it("raises as asked", () => {
    expect(clampLift([{ elevation: 0 }], 10)).toBe(10)
    expect(
      liftOps([place("a", "lamp", 0, 0), place("b", "lamp", 0, 0, 750)], 100)
    ).toEqual([
      { op: "nudge", id: "a", dy: 100 },
      { op: "nudge", id: "b", dy: 100 },
    ])
  })

  it("lowers a group only as far as its lowest item can go", () => {
    expect(clampLift([{ elevation: 750 }, { elevation: 30 }], -100)).toBe(-30)
    expect(
      liftOps([place("a", "lamp", 0, 0, 750), place("b", "lamp", 0, 0, 5)], -10)
    ).toEqual([
      { op: "nudge", id: "a", dy: -5 },
      { op: "nudge", id: "b", dy: -5 },
    ])
  })

  it("sends nothing when something is already on the floor", () => {
    expect(clampLift([{ elevation: 0 }], -10)).toBe(0)
    expect(liftOps([place("a", "lamp", 0, 0)], -10)).toEqual([])
    expect(
      liftOps([place("a", "lamp", 0, 0, 750), place("b", "lamp", 0, 0)], -10)
    ).toEqual([])
    expect(liftOps([], 10)).toEqual([])
  })

  it("never asks core for a BELOW_FLOOR", () => {
    const placements = [
      place("lamp", "lamp", 1500, 2000, 780),
      place("pot", "pot", 3000, 2000, 30),
    ]
    const after = previewOps({
      room,
      placements,
      assets: ASSETS,
      ops: liftOps(placements, -100),
    })
    expect(after?.map((p) => p.elevation)).toEqual([750, 0])
  })
})

describe("setElevationOps and withElevation", () => {
  it("sets only the items not already at that height, in whole mm", () => {
    expect(
      setElevationOps(
        [place("a", "lamp", 0, 0, 750), place("b", "lamp", 0, 0, 0)],
        750.4
      )
    ).toEqual([{ op: "set", id: "b", elevation: 750 }])
    expect(setElevationOps([place("a", "lamp", 0, 0, 750)], -20)).toEqual([
      { op: "set", id: "a", elevation: 0 },
    ])
  })

  it("previews the same heights core then stores", () => {
    const placements = [sideboard, place("lamp", "lamp", 1500, 2000)]
    const preview = withElevation(placements, ["lamp"], 750)
    const applied = previewOps({
      room,
      placements,
      assets: ASSETS,
      ops: setElevationOps([placements[1]!], 750),
    })
    expect(preview).toEqual(applied)
    // Untouched items keep their identity (cheap re-renders).
    expect(preview[0]).toBe(placements[0])
  })
})

describe("sharedElevation", () => {
  it("is the common height, mixed, or null", () => {
    expect(sharedElevation([])).toBeNull()
    expect(sharedElevation([{ elevation: 750 }, { elevation: 750 }])).toBe(750)
    expect(sharedElevation([{ elevation: 750 }, { elevation: 0 }])).toBe(
      "mixed"
    )
  })
})

describe("centreHeight", () => {
  it("is the bottom plus half the item's height", () => {
    // The TV is 840 tall: hung at 680, its middle is at 1,100.
    expect(centreHeight({ elevation: 680 }, TEST_ASSETS.wallTv)).toBe(1100)
  })
})

describe("supportSurfaces", () => {
  it("offers the sideboard's top to a lamp dragged onto it on the floor", () => {
    const lamp = place("lamp", "lamp", 1500, 2000)
    expect(
      supportSurfaces(thing(lamp, "Lamp"), [thing(sideboard, "Sideboard")])
    ).toEqual([
      {
        id: "sideboard",
        name: "Sideboard",
        top: 750,
        elevation: 750,
        share: 1,
        current: false,
      },
    ])
  })

  it("marks the surface the item already stands on", () => {
    const lamp = place("lamp", "lamp", 1500, 2000, 750)
    const [surface] = supportSurfaces(thing(lamp), [thing(sideboard)])
    expect(surface).toMatchObject({ elevation: 750, current: true })
  })

  it("offers a surface below a floating item", () => {
    const lamp = place("lamp", "lamp", 1500, 2000, 1200)
    expect(
      supportSurfaces(thing(lamp), [thing(sideboard)]).map((s) => s.elevation)
    ).toEqual([750])
  })

  it("needs half of the item's base over the surface", () => {
    // The sideboard's front edge is at z 2225; a lamp centred on it has
    // half its base over the top — just enough.
    const half = place("lamp", "lamp", 1500, 2225)
    expect(supportSurfaces(thing(half), [thing(sideboard)])).toHaveLength(1)
    const mostlyOff = place("lamp", "lamp", 1500, 2260)
    expect(supportSurfaces(thing(mostlyOff), [thing(sideboard)])).toEqual([])
    const beside = place("lamp", "lamp", 1500, 2600)
    expect(supportSurfaces(thing(beside), [thing(sideboard)])).toEqual([])
  })

  it("ignores a shelf high above an item that fits under it", () => {
    const shelf = place("shelf", "shelf", 1500, 2000, 1500)
    const lamp = place("lamp", "lamp", 1500, 2000)
    expect(supportSurfaces(thing(lamp), [thing(shelf)])).toEqual([])
    // …but one within reach is offered.
    const low = place("shelf", "shelf", 1500, 2000, 250)
    expect(
      supportSurfaces(thing(lamp), [thing(low)]).map((s) => s.top)
    ).toEqual([270])
  })

  it("offers an item's real top when the lamp clashes with its body", () => {
    // A sideboard whose body stops at 776 under a 24mm top: dragged onto
    // it on the floor, the lamp hits the body but belongs on the top.
    const slabbed: AssetSpec = {
      ...TEST_ASSETS.sideboard,
      geometry: {
        kind: "parts",
        parts: [
          {
            shape: "box",
            name: "body",
            position: [0, 388, 0],
            size: [1600, 776, 450],
          },
          {
            shape: "box",
            name: "top",
            position: [0, 788, 0],
            size: [1600, 24, 450],
          },
        ],
      },
    }
    const other = {
      placement: place("sideboard", "slabbed", 1500, 2000),
      asset: slabbed,
      name: "Sideboard",
    }
    const lamp = place("lamp", "lamp", 1500, 2000)
    expect(
      supportSurfaces(thing(lamp), [other]).map((s) => s.elevation)
    ).toEqual([800])
    // Resting on the body's top, inside the slab, it still offers the top.
    const inside = place("lamp", "lamp", 1500, 2000, 776)
    expect(
      supportSurfaces(thing(inside), [other]).map((s) => s.elevation)
    ).toEqual([800])
  })

  it("offers a table top the lamp is standing inside, not one it fits under", () => {
    const table = place("table", "table", 1500, 2000)
    const tall = place("lamp", "lamp", 1500, 2000)
    expect(
      supportSurfaces(thing(tall), [thing(table)]).map((s) => s.top)
    ).toEqual([420])
    // A 300mm stool-height item fits under the 380mm underside.
    const short = { ...LAMP, name: "Short lamp" }
    const shortAsset: AssetSpec = {
      ...short,
      geometry: {
        kind: "parts",
        parts: [
          {
            shape: "cylinder",
            name: "base",
            position: [0, 150, 0],
            radiusTop: 90,
            radiusBottom: 90,
            height: 300,
          },
        ],
      },
    }
    expect(
      supportSurfaces(
        {
          placement: place("short", "short", 1500, 2000),
          asset: shortAsset,
          name: "Short lamp",
        },
        [thing(table)]
      )
    ).toEqual([])
  })

  it("lists several surfaces by height, and skips rugs and pendants", () => {
    const lamp = place("lamp", "lamp", 1500, 2000, 900)
    const others = [
      thing(place("table", "table", 1500, 2000), "Coffee table"),
      thing(sideboard, "Sideboard"),
      thing(place("rug", "rug", 1500, 2000), "Rug"),
      thing(place("pendant", "pendant", 1500, 2000, 1550), "Pendant"),
      thing(place("lamp", "lamp", 1500, 2000, 900), "Itself"),
    ]
    const surfaces = supportSurfaces(thing(lamp), others)
    expect(surfaces.map((s) => [s.name, s.top, s.elevation])).toEqual([
      ["Sideboard", 750, 750],
      ["Coffee table", 420, 420],
    ])
    expect(restLabel(surfaces[0]!)).toBe("Rest on Sideboard (750 mm)")
  })

  it("stands an item whose model starts above y 0 on its lowest point", () => {
    // The pot's lowest point is 50mm up its model, so it stands on the
    // sideboard at elevation 700.
    const pot = place("pot", "pot", 1500, 2000)
    const [surface] = supportSurfaces(thing(pot), [thing(sideboard)])
    expect(surface).toMatchObject({ top: 750, elevation: 700 })
  })
})

describe("clipToConvex", () => {
  const square = (x: number, z: number, size: number): Point[] => [
    [x, z],
    [x + size, z],
    [x + size, z + size],
    [x, z + size],
  ]

  it("finds the overlap whichever way the outlines wind", () => {
    const a = square(0, 0, 100)
    const b = square(50, 50, 100)
    expect(area(clipToConvex(a, b))).toBeCloseTo(2500)
    expect(area(clipToConvex(a, [...b].reverse()))).toBeCloseTo(2500)
    expect(area(clipToConvex([...a].reverse(), b))).toBeCloseTo(2500)
  })

  it("is empty when they don't meet, whole when one is inside", () => {
    expect(clipToConvex(square(0, 0, 10), square(50, 50, 10))).toEqual([])
    expect(area(clipToConvex(square(20, 20, 10), square(0, 0, 100)))).toBe(100)
  })
})

describe("heightSelection", () => {
  it("describes one floor item", () => {
    expect(
      heightSelection([thing(place("lamp", "lamp", 1500, 2000, 750))])
    ).toEqual({
      kind: "floor",
      ids: ["lamp"],
      value: 750,
      canLower: true,
      raised: ["lamp"],
    })
  })

  it("gives a wall item its centre height", () => {
    expect(
      heightSelection([thing(place("tv", "tv", 2960, 4000, 680))])
    ).toEqual({
      kind: "wall",
      ids: ["tv"],
      value: 680,
      centre: 1100,
      canLower: true,
      raised: [],
    })
  })

  it("leaves ceiling items out, and is fixed when that's all there is", () => {
    const pendant = thing(place("pendant", "pendant", 1500, 2000, 1550))
    expect(heightSelection([pendant])).toMatchObject({
      kind: "ceiling",
      ids: [],
      canLower: false,
    })
    const group = heightSelection([
      pendant,
      thing(sideboard),
      thing(place("lamp", "lamp", 1500, 2000, 750)),
    ])
    expect(group).toEqual({
      kind: "floor",
      ids: ["sideboard", "lamp"],
      value: "mixed",
      range: [0, 750],
      canLower: false,
      raised: ["lamp"],
    })
  })

  it("is null for nothing selected", () => {
    expect(heightSelection([])).toBeNull()
  })
})

describe("readouts", () => {
  it("badges raised items only", () => {
    expect(elevationBadge(0)).toBeNull()
    expect(elevationBadge(800)).toBe("↑ 800")
    expect(elevationBadge(1100)).toBe("↑ 1,100")
  })

  it("describes heights in words", () => {
    expect(describeHeight({ value: 0, kind: "floor" })).toBe("on the floor")
    expect(describeHeight({ value: 760, kind: "floor" })).toBe(
      "760 mm off the floor"
    )
    expect(
      describeHeight({ value: "mixed", kind: "floor", range: [0, 820] })
    ).toBe("0–820 mm off the floor")
    expect(describeHeight({ value: "mixed", kind: "floor" })).toBe(
      "mixed heights"
    )
    expect(describeHeight({ value: 680, kind: "wall", centre: 1100 })).toBe(
      "bottom 680 mm · centre 1,100 mm"
    )
    expect(describeHeight({ value: 680, kind: "wall" })).toBe("bottom 680 mm")
    expect(describeHeight({ value: 1550, kind: "ceiling" })).toBe(
      "hangs from the ceiling"
    )
  })

  it("parses typed heights", () => {
    expect(parseHeight("750")).toBe(750)
    expect(parseHeight(" 1,100 mm")).toBe(1100)
    expect(parseHeight("12.6")).toBe(13)
    expect(parseHeight("")).toBeNull()
    expect(parseHeight("-20")).toBeNull()
    expect(parseHeight("tall")).toBeNull()
  })
})
