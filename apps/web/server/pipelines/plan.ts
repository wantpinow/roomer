import { toRoomGeometry } from "@roomer/core/geometry"
import { planSvg, type PlanTheme } from "@roomer/core/plan"

import { designTokens } from "@/lib/design-tokens"

import type { LayoutDetail, RoomDetail } from "../convex"
import { DEFAULT_PLAN_MAX_SIDE, rasterisePlan } from "../render/plan-png"

import { sceneAssets } from "./views"

// The floor plan of a room, or of a layout in its room (items, lint
// highlights), as SVG text from @roomer/core and as a PNG for the agent.

export type PlanThemeMode = "light" | "dark"

/** The web app's plan palette (lib/design-tokens.ts) as a core plan theme. */
export function planTheme(mode: PlanThemeMode = "light"): Partial<PlanTheme> {
  const plan = designTokens.plan[mode]
  return {
    paper: plan.paper,
    floor: plan.floor,
    wall: plan.wallFill,
    glass: plan.window,
    swing: plan.doorSwing,
    furnitureFill: plan.furnitureFill,
    furnitureStroke: plan.furnitureStroke,
    coveringFill: plan.rugFill,
    coveringStroke: plan.rugStroke,
    fixture: plan.featureStroke,
    fixtureFill: plan.featureFill,
    accent: plan.furnitureSelectedStroke,
    error: plan.errorOutline,
    warning: plan.warningOutline,
    info: plan.infoOutline,
    text: plan.labelText,
    mutedText: plan.labelMuted,
    dimension: plan.dimensionText,
    fontFamily: designTokens.fonts.sans,
  }
}

export interface PlanInput {
  room: Pick<
    RoomDetail,
    "name" | "shell" | "ceilingHeight" | "skirting" | "features"
  >
  layout?: Pick<LayoutDetail, "name" | "placements" | "assets" | "lint">
  /** Placement ids to emphasise. */
  highlight?: readonly string[]
  /** Longest side of the PNG in px. */
  maxSide?: number
  /** Palette; the PNG for the agent is always light. Default light. */
  theme?: PlanThemeMode
}

export function planSvgFor(input: PlanInput): string {
  const { room, layout } = input
  return planSvg({
    room: toRoomGeometry(room),
    ...(layout
      ? {
          placements: layout.placements,
          assets: sceneAssets(layout),
          lint: layout.lint,
        }
      : {}),
    options: {
      width: input.maxSide ?? DEFAULT_PLAN_MAX_SIDE,
      title: layout ? `${room.name} — ${layout.name}` : room.name,
      ...(input.highlight?.length ? { highlight: input.highlight } : {}),
      theme: planTheme(input.theme),
    },
  })
}

export async function renderPlan(
  input: PlanInput
): Promise<{ svg: string; png: Buffer }> {
  const svg = planSvgFor(input)
  const png = await rasterisePlan(svg, {
    maxSide: input.maxSide ?? DEFAULT_PLAN_MAX_SIDE,
    background: designTokens.plan[input.theme ?? "light"].paper,
  })
  return { svg, png }
}
