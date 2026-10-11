import { describe, expect, it } from "vitest"

import { COFFEE_TABLE, SIDEBOARD, SOFA, WALL_TV } from "../../src/fixtures"
import { describePlacement } from "../../src/placement"
import { livingRoom, placeAs } from "./setup"

describe("describePlacement", () => {
  const ctx = livingRoom()

  it("describes an item backed against a wall", () => {
    const sofa = placeAs("sofa", SOFA, {
      mode: "against",
      wall: "W6",
      at: 2400,
    })
    expect(describePlacement(sofa, SOFA, ctx)).toEqual({
      nearestWall: { wall: "W6", gapMm: 18, along: 2400, span: [1300, 3500] },
      touchingWalls: ["W6"],
      facingDescription:
        "back against W6 (18mm off the plaster), centred 2,400mm along, facing 90° (into the room)",
    })
  })

  it("lists both walls of a corner and prefers the one behind the item", () => {
    const sideboard = placeAs("sideboard", SIDEBOARD, {
      mode: "inCorner",
      corner: "C1",
    })
    const relation = describePlacement(sideboard, SIDEBOARD, ctx)
    expect(relation.touchingWalls).toEqual(["W1", "W6"])
    expect(relation.nearestWall.wall).toBe("W1")
    expect(relation.facingDescription).toBe(
      "back against W1 (18mm off the plaster), centred 818mm along, facing 180° (into the room)"
    )
  })

  it("names the side that touches and the direction along the wall", () => {
    const sideboard = placeAs("sideboard", SIDEBOARD, {
      mode: "against",
      wall: "W6",
      at: 1000,
      side: "left",
    })
    expect(describePlacement(sideboard, SIDEBOARD, ctx).facingDescription).toBe(
      "left side against W6 (18mm off the plaster), centred 1,000mm along, facing 180° (along W6 towards C6)"
    )
  })

  it("says when a wall item is on the plaster", () => {
    const tv = placeAs("tv", WALL_TV, {
      mode: "onWall",
      wall: "W2",
      at: 3000,
      elevation: 1200,
    })
    const relation = describePlacement(tv, WALL_TV, ctx)
    expect(relation.nearestWall.gapMm).toBe(0)
    expect(relation.facingDescription).toBe(
      "back against W2 (flush with the plaster), centred 3,000mm along, facing 270° (into the room)"
    )
  })

  it("gives the distance to the nearest wall for a free-standing item", () => {
    const table = placeAs("coffee-table", COFFEE_TABLE, {
      mode: "at",
      x: 1500,
      z: 3000,
      facing: 90,
    })
    const relation = describePlacement(table, COFFEE_TABLE, ctx)
    expect(relation.touchingWalls).toEqual([])
    expect(relation.nearestWall).toEqual({
      wall: "W2",
      gapMm: 1180,
      along: 3000,
      span: [2450, 3550],
    })
    expect(relation.facingDescription).toBe(
      "1,180mm from W2 (the nearest wall, front towards it), level with 3,000mm along, facing 90° (towards W2)"
    )
  })

  it("reports how far an item goes through a wall", () => {
    const sofa = {
      id: "sofa",
      assetId: "sofa",
      x: 300,
      z: 5290,
      facing: 90,
      elevation: 0,
    }
    const relation = describePlacement(sofa, SOFA, ctx)
    expect(relation.nearestWall.gapMm).toBe(-175)
    expect(relation.facingDescription).toBe(
      "back 175mm through W6, 2,400mm along, facing 90° (into the room)"
    )
  })
})
