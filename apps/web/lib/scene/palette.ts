import { ID_PASS_SHELL, type Tone } from "@roomer/core"

import type { ShellRole } from "./room-geometry"

// Colours for every pass. Clay is a family of warm greys (Blender-clay with a
// Scandinavian warmth): item parts pick a shade by `tone`, the shell is a
// touch lighter so furniture reads against it. The id pass uses flat named
// colours from core so the photoreal prompt can refer to them by name.

export const DEFAULT_TONE: Tone = "mid"

export const CLAY_TONES = {
  light: "#ddd6cc",
  mid: "#bdb4a9",
  dark: "#7a7168",
} as const satisfies Record<Tone, string>

export const CLAY_SHELL = {
  floor: "#cbc2b6",
  ceiling: "#f4f2ee",
  wall: "#e9e5df",
  skirting: "#efece7",
  architrave: "#efece7",
  door: "#ece8e1",
  handle: "#8f877e",
  "window-frame": "#f1eee9",
  glass: "#ffffff",
  sill: "#efece7",
  radiator: "#eeebe6",
  pipe: "#e3dfd9",
  obstacle: "#e9e5df",
  hearth: "#c4bcb1",
  plate: "#f2f0ec",
  light: "#f2f0ec",
} as const satisfies Record<ShellRole, string>

/** What the clay pass shows through windows and past the room. */
export const CLAY_BACKGROUND = "#f4f3f0"

/** Asset preview backdrop. */
export const PREVIEW_BACKGROUND = "#efede9"

/** Interactive highlight colours (muted terracotta, architecture §7). */
export const CLAY_SELECTED = "#b5714f"
export const CLAY_HOVERED = "#c99a7f"

/** Which shell colour each role takes in the id pass. */
export const ID_PASS_SHELL_ROLE = {
  floor: "floor",
  hearth: "floor",
  ceiling: "ceiling",
  wall: "walls",
  skirting: "walls",
  architrave: "walls",
  sill: "walls",
  obstacle: "walls",
  glass: "openings",
  door: "fixtures",
  handle: "fixtures",
  "window-frame": "fixtures",
  radiator: "fixtures",
  pipe: "fixtures",
  plate: "fixtures",
  light: "fixtures",
} as const satisfies Record<ShellRole, keyof typeof ID_PASS_SHELL>

/** The id pass background: what is seen through windows and doorways. */
export const ID_PASS_BACKGROUND = ID_PASS_SHELL.openings

export function idPassShellColor(role: ShellRole): string {
  return ID_PASS_SHELL[ID_PASS_SHELL_ROLE[role]]
}

/** Every colour the id pass may draw that is not an item. */
export const ID_PASS_NON_ITEM_COLORS: readonly string[] = [
  ...new Set([...Object.values(ID_PASS_SHELL), ID_PASS_BACKGROUND]),
]
