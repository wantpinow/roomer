import type {
  Feature,
  Finishes,
  ShellMeasurements,
  Skirting,
  Vec2,
} from "../schema"

// Patrick's living/dining room, estimated from the estate-agent floor plan
// (7.69m × 2.98m, notched at the window end). Used as the seed room, as the
// e2e room and as a realistic fixture in tests. Features marked `assumed`
// are guesses to be corrected after measuring.

export const LIVING_ROOM_NAME = "Living room"
export const LIVING_ROOM_CEILING_HEIGHT = 2450

export const LIVING_ROOM_MEASUREMENTS = {
  kind: "walk",
  segments: [
    { length: 2980, turn: 90 }, // W1 kitchen end (C1 → C2), door D1 to the kitchen
    { length: 7090, turn: 90 }, // W2 long right wall, door D2 to the hall
    { length: 810, turn: -90 }, // W3 step into the window recess
    { length: 600, turn: 90 }, // W4 recess side
    { length: 2170, turn: 90 }, // W5 window wall
    { length: 7690, turn: 90 }, // W6 long left wall with the pier
  ],
} as const satisfies ShellMeasurements

/** The corners the walk above should solve to (exact: it closes perfectly). */
export const LIVING_ROOM_CORNERS: Vec2[] = [
  [0, 0],
  [2980, 0],
  [2980, 7090],
  [2170, 7090],
  [2170, 7690],
  [0, 7690],
]

export const LIVING_ROOM_SKIRTING: Skirting = { height: 150, depth: 18 }

export const LIVING_ROOM_FEATURES: Feature[] = [
  {
    type: "door",
    id: "D1",
    label: "Kitchen door",
    wall: "W1",
    offset: 1150,
    width: 800,
    bottom: 0,
    height: 1980,
    hinge: "end",
    swing: "out",
  },
  {
    type: "door",
    id: "D2",
    label: "Hall door",
    wall: "W2",
    offset: 5250,
    width: 760,
    bottom: 0,
    height: 1980,
    hinge: "end",
    swing: "in",
  },
  {
    type: "window",
    id: "WIN1",
    label: "Front window",
    wall: "W5",
    offset: 120,
    width: 1930,
    bottom: 650,
    height: 1450,
    opens: "out",
    revealDepth: 100,
    sillDepth: 50,
  },
  {
    type: "obstacle",
    id: "OB1",
    label: "Wall pier",
    wall: "W6",
    offset: 4920,
    width: 1000,
    bottom: 0,
    height: LIVING_ROOM_CEILING_HEIGHT,
    depth: 120,
    kind: "pier",
  },
  {
    type: "radiator",
    id: "RAD1",
    label: "Radiator under window",
    wall: "W5",
    offset: 385,
    width: 1400,
    bottom: 150,
    height: 450,
    depth: 110,
    assumed: true,
  },
  {
    type: "pendant",
    id: "L1",
    label: "Pendant (kitchen end)",
    x: 1490,
    z: 2400,
    assumed: true,
  },
  {
    type: "pendant",
    id: "L2",
    label: "Pendant (window end)",
    x: 1490,
    z: 5600,
    assumed: true,
  },
  {
    type: "socket",
    id: "S1",
    wall: "W6",
    offset: 1000,
    width: 146,
    bottom: 300,
    height: 86,
    gang: 2,
    assumed: true,
  },
  {
    type: "socket",
    id: "S2",
    wall: "W6",
    offset: 6000,
    width: 146,
    bottom: 300,
    height: 86,
    gang: 2,
    assumed: true,
  },
  {
    type: "socket",
    id: "S3",
    wall: "W2",
    offset: 1500,
    width: 146,
    bottom: 300,
    height: 86,
    gang: 2,
    assumed: true,
  },
  {
    type: "socket",
    id: "S4",
    wall: "W2",
    offset: 4500,
    width: 146,
    bottom: 300,
    height: 86,
    gang: 2,
    assumed: true,
  },
]

export const LIVING_ROOM_FINISHES: Finishes = {
  walls: "soft warm white, matt",
  floor: "light natural oak boards, matt finish",
  ceiling: "white",
  skirting: "warm white, satin",
  notes:
    "Calm, warm, Scandinavian-leaning interior: natural oak and walnut, boucle and linen, cream, sand and terracotta accents, soft daylight.",
}
