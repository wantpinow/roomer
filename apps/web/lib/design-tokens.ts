// Hex mirror of Roomer's palette for code that can't read CSS variables: the
// floor-plan SVG/PNG renderer, three.js clay materials, <meta theme-color>.
// The CSS source of truth is packages/ui/src/styles/globals.css — when a
// colour changes there, change it here too (same names, camelCased).

const light = {
  paper: "#f5f2ec",
  surface: "#fbf9f5",
  popover: "#fdfcf9",
  sunken: "#ede8df",
  ink: "#26221e",
  inkSoft: "#5c554c",
  muted: "#6b6359",
  faint: "#a39a8d",
  hairline: "#e3ddd3",
  rule: "#d3cbbe",
  ring: "#b85c38",
  clay: "#9e4b2a",
  clayFill: "#b85c38",
  clayTint: "#f5e6dc",
  oak: "#7c5e3b",
  oakFill: "#c4a27a",
  oakTint: "#f0e6d7",
  sage: "#566447",
  sageFill: "#8a9a72",
  sageTint: "#e6e9dc",
  error: "#a23b2c",
  errorFill: "#b4483a",
  errorTint: "#f5e3de",
  warning: "#8a6116",
  warningFill: "#c8952f",
  warningTint: "#f4ead2",
  info: "#4d6070",
  infoFill: "#6f8495",
  infoTint: "#e4e9ec",
} as const

const dark = {
  paper: "#1b1916",
  surface: "#221f1b",
  popover: "#26231f",
  sunken: "#2a2722",
  ink: "#eee9e1",
  inkSoft: "#c2baae",
  muted: "#a0978a",
  faint: "#6f675d",
  hairline: "#35312b",
  rule: "#45403a",
  ring: "#d07a54",
  clay: "#e08b65",
  clayFill: "#d07a54",
  clayTint: "#3a2a22",
  oak: "#c9a57a",
  oakFill: "#a88559",
  oakTint: "#332b21",
  sage: "#aab98f",
  sageFill: "#8a9a72",
  sageTint: "#2a2e24",
  error: "#e8836f",
  errorFill: "#d2685a",
  errorTint: "#3a2420",
  warning: "#ddae55",
  warningFill: "#c9973c",
  warningTint: "#372e1c",
  info: "#9db2c3",
  infoFill: "#7f96a8",
  infoTint: "#242c33",
} as const satisfies Record<keyof typeof light, string>

export type ThemePalette = typeof light | typeof dark

/**
 * Floor-plan palette: an architect's drawing on warm paper. Solid charcoal
 * walls, a faint oat floor, sand furniture with a hairline stroke, clay for
 * the selection, and the muted severity colours for lint outlines (drawn at
 * `issueWashOpacity` for the fill behind the outline).
 */
const planLight = {
  paper: "#fbf9f5",
  floor: "#f1ebe1",
  wallFill: "#3a3530",
  wallHairline: "#26221e",
  door: "#5c554c",
  doorSwing: "#a39a8d",
  window: "#6f8495",
  windowGlass: "#e4e9ec",
  featureFill: "#ddd5c8",
  featureStroke: "#a39a8d",
  furnitureFill: "#ebe3d6",
  furnitureStroke: "#8a7f70",
  rugFill: "#f3ede3",
  rugStroke: "#c9bfb0",
  furnitureSelectedFill: "#f5e6dc",
  furnitureSelectedStroke: "#b85c38",
  furnitureHoverStroke: "#5c554c",
  dimensionLine: "#a39a8d",
  dimensionText: "#6b6359",
  labelText: "#26221e",
  labelMuted: "#6b6359",
  errorOutline: "#b4483a",
  warningOutline: "#c8952f",
  infoOutline: "#6f8495",
  issueWashOpacity: 0.14,
} as const

const planDark = {
  paper: "#1f1c19",
  floor: "#26231f",
  wallFill: "#d9d2c6",
  wallHairline: "#eee9e1",
  door: "#c2baae",
  doorSwing: "#6f675d",
  window: "#9db2c3",
  windowGlass: "#242c33",
  featureFill: "#3a352f",
  featureStroke: "#6f675d",
  furnitureFill: "#332f29",
  furnitureStroke: "#a0978a",
  rugFill: "#2a2722",
  rugStroke: "#45403a",
  furnitureSelectedFill: "#3a2a22",
  furnitureSelectedStroke: "#e08b65",
  furnitureHoverStroke: "#c2baae",
  dimensionLine: "#6f675d",
  dimensionText: "#a0978a",
  labelText: "#eee9e1",
  labelMuted: "#a0978a",
  errorOutline: "#e8836f",
  warningOutline: "#ddae55",
  infoOutline: "#9db2c3",
  issueWashOpacity: 0.18,
} as const satisfies Record<keyof typeof planLight, string | number>

export type PlanPalette = typeof planLight | typeof planDark

/**
 * Clay scene: warm greys for the 3D viewer and clay pass, one per part
 * `tone` (core `zTone`), plus the shell. Deliberately low-chroma so the
 * photoreal model reads form, not colour.
 */
const scene = {
  clayLight: "#e9e4dc",
  clayMid: "#cfc8bd",
  clayDark: "#8f877c",
  walls: "#f2eee8",
  floor: "#ddd6cb",
  ceiling: "#f7f4ef",
  background: "#f5f2ec",
  selection: "#b85c38",
  hover: "#5c554c",
} as const

export const designTokens = {
  light,
  dark,
  plan: { light: planLight, dark: planDark },
  scene,
  fonts: {
    sans: '"Albert Sans", ui-sans-serif, system-ui, sans-serif',
    display: "Newsreader, ui-serif, Georgia, serif",
    mono: '"Fragment Mono", ui-monospace, Menlo, monospace',
  },
  radius: { xs: 2, sm: 4, md: 6, lg: 8, xl: 12 },
} as const

export type DesignTokens = typeof designTokens
