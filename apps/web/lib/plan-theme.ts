import type { PlanTheme } from "@roomer/core/plan"

import { designTokens } from "./design-tokens"

/**
 * core's floor-plan palette in Roomer's design tokens, per theme: the plan
 * sits on the stage's paper, walls in warm charcoal (light walls in the dark
 * theme), sand furniture, clay for emphasis, and the muted severities.
 */
export function planTheme(mode: "light" | "dark"): PlanTheme {
  const p = designTokens.plan[mode]
  const t = designTokens[mode]
  return {
    paper: p.paper,
    floor: p.floor,
    wall: p.wallFill,
    glass: p.window,
    swing: p.doorSwing,
    furnitureFill: p.furnitureFill,
    furnitureStroke: p.furnitureStroke,
    furnitureDetail: t.rule,
    coveringFill: p.rugFill,
    coveringStroke: p.rugStroke,
    fixture: p.featureStroke,
    fixtureFill: p.featureFill,
    accent: p.furnitureSelectedStroke,
    error: p.errorOutline,
    warning: p.warningOutline,
    info: p.infoOutline,
    text: p.labelText,
    mutedText: p.labelMuted,
    dimension: p.dimensionText,
    fontFamily: designTokens.fonts.sans,
  }
}
