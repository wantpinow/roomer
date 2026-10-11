import { describe, expect, it } from "vitest"

import { DEFAULT_PLAN_THEME } from "@roomer/core/plan"

import { designTokens } from "../design-tokens"
import { planTheme } from "../plan-theme"

describe("planTheme", () => {
  it.each(["light", "dark"] as const)(
    "fills every colour core's plan uses (%s)",
    (mode) => {
      const theme = planTheme(mode)
      expect(Object.keys(theme).sort()).toEqual(
        Object.keys(DEFAULT_PLAN_THEME).sort()
      )
      for (const [key, value] of Object.entries(theme)) {
        if (key === "fontFamily") continue
        expect(value, key).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  )

  it("puts the plan on the stage's paper, so it reads as one sheet", () => {
    expect(planTheme("light").paper).toBe(designTokens.light.paper)
    expect(planTheme("dark").paper).toBe(designTokens.dark.paper)
  })

  it("draws dark-theme walls light", () => {
    expect(planTheme("dark").wall).toBe(designTokens.plan.dark.wallFill)
  })
})
