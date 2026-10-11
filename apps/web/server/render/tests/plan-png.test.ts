import { describe, expect, it } from "vitest"

import { pngSize } from "../png"
import { fitLongestSide, rasterisePlan, svgSize } from "../plan-png"

const SVG = (attrs: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect x="0" y="0" width="10" height="10" fill="#26221e"/><text x="1" y="5" font-size="2" font-family="sans-serif">C1</text></svg>`

describe("svgSize", () => {
  it("prefers the viewBox, then width and height", () => {
    expect(svgSize(SVG('viewBox="0 0 2980 7690" width="400"'))).toEqual({
      width: 2980,
      height: 7690,
    })
    expect(svgSize(SVG('width="300" height="200"'))).toEqual({
      width: 300,
      height: 200,
    })
    expect(svgSize(SVG('viewBox="-10,-10,50,20"'))).toEqual({
      width: 50,
      height: 20,
    })
  })

  it("refuses non-SVG input and a size-less SVG", () => {
    expect(() => svgSize("<html/>")).toThrow("Not an SVG document")
    expect(() => svgSize(SVG(""))).toThrow("neither a viewBox nor a width")
  })
})

describe("fitLongestSide", () => {
  it("fits the longer side, clamped to sane bounds", () => {
    expect(fitLongestSide({ width: 2980, height: 7690 }, 1400)).toEqual({
      mode: "height",
      value: 1400,
    })
    expect(fitLongestSide({ width: 400, height: 300 }, 50)).toEqual({
      mode: "width",
      value: 200,
    })
    expect(fitLongestSide({ width: 400, height: 300 }, 1e6)).toEqual({
      mode: "width",
      value: 4000,
    })
  })
})

describe("rasterisePlan", () => {
  it("renders a PNG whose longest side is maxSide", async () => {
    const png = await rasterisePlan(SVG('viewBox="0 0 100 50"'), {
      maxSide: 400,
      background: "#fbf9f5",
    })
    expect(pngSize(png)).toEqual({ width: 400, height: 200 })
  })
})
