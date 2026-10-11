import { describe, expect, it } from "vitest"

import { designTokens } from "@/lib/design-tokens"

import { layoutDetail, roomDetail } from "../../mcp/tests/fakes"
import { pngSize } from "../../render/png"
import { planSvgFor, planTheme, renderPlan } from "../plan"

describe("planTheme", () => {
  it("maps the web plan palette onto the core plan theme", () => {
    const light = planTheme("light")
    expect(light.paper).toBe(designTokens.plan.light.paper)
    expect(light.wall).toBe(designTokens.plan.light.wallFill)
    expect(light.error).toBe(designTokens.plan.light.errorOutline)
    expect(planTheme("dark").paper).toBe(designTokens.plan.dark.paper)
  })
})

describe("planSvgFor", () => {
  it("draws the room and the layout in the app's palette", () => {
    const svg = planSvgFor({ room: roomDetail(), layout: layoutDetail() })
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain(designTokens.plan.light.paper)
    expect(svg).toContain('data-placement-id="sofa"')
  })

  it("can draw dark and a bare room", () => {
    const svg = planSvgFor({ room: roomDetail(), theme: "dark" })
    expect(svg).toContain(designTokens.plan.dark.paper)
    expect(svg).not.toContain("data-placement-id")
  })
})

describe("renderPlan", () => {
  it("rasterises with the longest side at maxSide", async () => {
    const { png } = await renderPlan({ room: roomDetail(), maxSide: 500 })
    const size = pngSize(png)
    expect(Math.max(size.width, size.height)).toBe(500)
    expect(size.height).toBeGreaterThan(size.width)
  })
})
