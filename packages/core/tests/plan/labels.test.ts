import { describe, expect, it } from "vitest"

import {
  fitLabel,
  labelBounds,
  LabelSpace,
  shorterNames,
  twoLines,
} from "../../src/plan/labels"
import { escapeXml, num, uprightAngle } from "../../src/plan/svg"

describe("plan svg helpers", () => {
  it("rounds numbers to 0.1mm without negative zero", () => {
    expect(num(1234.567)).toBe("1234.6")
    expect(num(2)).toBe("2")
    expect(num(-0.01)).toBe("0")
    expect(num(-12.25)).toBe("-12.2")
  })

  it("escapes text and attributes", () => {
    expect(escapeXml(`"Tom & Jerry" <sofa>`)).toBe(
      "&quot;Tom &amp; Jerry&quot; &lt;sofa&gt;"
    )
  })

  it("keeps text along any direction readable from the bottom or right", () => {
    expect(uprightAngle([1, 0])).toBe(0)
    expect(uprightAngle([-1, 0])).toBe(0)
    expect(uprightAngle([0, 1])).toBe(-90)
    expect(uprightAngle([0, -1])).toBe(-90)
    expect(uprightAngle([1, 1])).toBeCloseTo(45)
    expect(uprightAngle([-1, -1])).toBeCloseTo(45)
  })
})

describe("fitLabel", () => {
  const wide = { first: 2000, second: 800, firstIsHorizontal: true }

  it("sets a short name on one line at full size", () => {
    expect(fitLabel("Sofa", wide, 100, 55)).toEqual({
      lines: ["Sofa"],
      size: 100,
      alongSecond: false,
    })
  })

  it("wraps onto two lines before shrinking below the minimum", () => {
    const fit = fitLabel(
      "Coffee table",
      { first: 520, second: 1000, firstIsHorizontal: true },
      100,
      55
    )
    expect(fit?.lines).toEqual(["Coffee", "table"])
    expect(fit?.alongSecond).toBe(false)
  })

  it("turns the text along a long, thin item", () => {
    const fit = fitLabel(
      "Bookcase",
      { first: 300, second: 1800, firstIsHorizontal: true },
      100,
      55
    )
    expect(fit).toMatchObject({ lines: ["Bookcase"], alongSecond: true })
  })

  it("drops leading words when the full name won't fit", () => {
    const name = "Söderhamn three-seat sofa"
    const medium = fitLabel(
      name,
      { first: 400, second: 200, firstIsHorizontal: true },
      100,
      55
    )
    expect(medium?.lines).toEqual(["three-seat", "sofa"])
    const small = fitLabel(
      name,
      { first: 250, second: 120, firstIsHorizontal: true },
      100,
      55
    )
    expect(small?.lines).toEqual(["sofa"])
  })

  it("sets the name beside an item too thin for any label", () => {
    expect(
      fitLabel(
        "TV",
        { first: 1400, second: 10, firstIsHorizontal: true },
        100,
        55
      )
    ).toMatchObject({ lines: ["TV"], outside: true, alongSecond: false })
  })

  it("falls back to an ellipsis, or nothing for a tiny item", () => {
    const fit = fitLabel(
      "Footstool",
      { first: 250, second: 120, firstIsHorizontal: true },
      100,
      55
    )
    expect(fit?.lines[0]).toMatch(/…$/)
    expect(
      fitLabel(
        "Footstool",
        { first: 90, second: 80, firstIsHorizontal: true },
        100,
        55
      )
    ).toBeUndefined()
  })
})

describe("label text helpers", () => {
  it("splits words into the most even two lines", () => {
    expect(twoLines(["Test", "dining", "chair"])).toEqual([
      "Test dining",
      "chair",
    ])
    expect(twoLines(["Sofa"])).toBeUndefined()
  })

  it("lists shorter names by dropping leading words", () => {
    expect(shorterNames("Test dining chair")).toEqual(["dining chair", "chair"])
  })
})

describe("LabelSpace", () => {
  it("tracks placed labels so later ones avoid them", () => {
    const space = new LabelSpace()
    const fit = { lines: ["Sofa"], size: 100, alongSecond: false }
    const box = labelBounds(fit, [1000, 1000], [1, 0])
    expect(space.isFree(box)).toBe(true)
    space.add(box)
    expect(space.isFree(labelBounds(fit, [1050, 1000], [1, 0]))).toBe(false)
    expect(space.isFree(labelBounds(fit, [1000, 1300], [1, 0]))).toBe(true)
    // A vertical label's box is tall, not wide.
    const vertical = labelBounds(fit, [0, 0], [0, 1])
    expect(vertical.maxZ - vertical.minZ).toBeGreaterThan(
      vertical.maxX - vertical.minX
    )
  })
})
