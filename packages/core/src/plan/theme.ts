// Colours and type for the floor plan. The defaults are a warm, quiet,
// Scandinavian palette (architecture §7): paper, charcoal walls, oat and
// sand furniture, one clay accent, and muted severities — brick, ochre and
// slate, never neon. The web app passes its design tokens as a partial theme.

export interface PlanTheme {
  /** Page background around the room. */
  paper: string
  /** Floor inside the walls. */
  floor: string
  /** Wall band, piers and door leaves. */
  wall: string
  /** Glazing lines in window openings. */
  glass: string
  /** Door swing arcs. */
  swing: string
  furnitureFill: string
  furnitureStroke: string
  /** Hairlines between an item's parts. */
  furnitureDetail: string
  /** Rugs and other floor coverings. */
  coveringFill: string
  coveringStroke: string
  /** Radiators, sockets, lights and other fixtures. */
  fixture: string
  fixtureFill: string
  /** Emphasis: highlighted items, the selection. */
  accent: string
  error: string
  warning: string
  info: string
  text: string
  mutedText: string
  dimension: string
  /** CSS font stack for every label. */
  fontFamily: string
}

export const DEFAULT_PLAN_THEME: PlanTheme = {
  paper: "#F6F2EA",
  floor: "#FCFAF6",
  wall: "#2F2B27",
  glass: "#7F9097",
  swing: "#9A8F84",
  furnitureFill: "#ECE3D3",
  furnitureStroke: "#857A6E",
  furnitureDetail: "#C2B6A5",
  coveringFill: "#F3ECE0",
  coveringStroke: "#BFB3A3",
  fixture: "#6F665D",
  fixtureFill: "#E6DFD4",
  accent: "#B5694A",
  error: "#A63D30",
  warning: "#B78A2E",
  info: "#5C7180",
  text: "#3A342E",
  mutedText: "#8C8278",
  dimension: "#6F665D",
  fontFamily: "Geist, Inter, system-ui, sans-serif",
}

export function resolveTheme(theme?: Partial<PlanTheme>): PlanTheme {
  return { ...DEFAULT_PLAN_THEME, ...theme }
}
