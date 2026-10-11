import type { AssetSpec } from "../schema"

// Small, hand-checked assets for tests. Every one's parts fit `dims` exactly
// (the comments give each part's extent) so they double as examples of how
// to build an asset from parts.

export const COFFEE_TABLE: AssetSpec = {
  name: "Test coffee table",
  category: "table",
  mount: "floor",
  dims: { w: 1100, d: 600, h: 420 },
  geometry: {
    kind: "parts",
    parts: [
      // top: y 380..420
      {
        shape: "box",
        name: "top",
        position: [0, 400, 0],
        size: [1100, 40, 600],
      },
      // legs: y 0..380, inset 20mm from each edge
      {
        shape: "box",
        name: "leg front left",
        position: [-530, 190, 280],
        size: [40, 380, 40],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg front right",
        position: [530, 190, 280],
        size: [40, 380, 40],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg back left",
        position: [-530, 190, -280],
        size: [40, 380, 40],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg back right",
        position: [530, 190, -280],
        size: [40, 380, 40],
        tone: "dark",
      },
    ],
  },
}

export const SOFA: AssetSpec = {
  name: "Test three-seat sofa",
  category: "sofa",
  mount: "floor",
  dims: { w: 2200, d: 950, h: 820 },
  clearance: { front: 350 },
  geometry: {
    kind: "parts",
    parts: [
      // base: x ±1100, y 60..440, z ±475
      {
        shape: "box",
        name: "base",
        position: [0, 250, 0],
        size: [2200, 380, 950],
      },
      // back: y 420..820, z −475..−275
      {
        shape: "box",
        name: "back",
        position: [0, 620, -375],
        size: [2200, 400, 200],
      },
      // arms: x 900..1100, y 440..640, z −275..475
      {
        shape: "box",
        name: "arm left",
        position: [-1000, 540, 100],
        size: [200, 200, 750],
      },
      {
        shape: "box",
        name: "arm right",
        position: [1000, 540, 100],
        size: [200, 200, 750],
      },
      // seat cushions: y 440..560, z −225..475
      {
        shape: "box",
        name: "cushion left",
        position: [-450, 500, 125],
        size: [900, 120, 700],
        tone: "light",
      },
      {
        shape: "box",
        name: "cushion right",
        position: [450, 500, 125],
        size: [900, 120, 700],
        tone: "light",
      },
      // legs: y 0..60
      {
        shape: "cylinder",
        name: "leg front left",
        position: [-1050, 30, 425],
        radiusTop: 20,
        radiusBottom: 20,
        height: 60,
        tone: "dark",
      },
      {
        shape: "cylinder",
        name: "leg front right",
        position: [1050, 30, 425],
        radiusTop: 20,
        radiusBottom: 20,
        height: 60,
        tone: "dark",
      },
      {
        shape: "cylinder",
        name: "leg back left",
        position: [-1050, 30, -425],
        radiusTop: 20,
        radiusBottom: 20,
        height: 60,
        tone: "dark",
      },
      {
        shape: "cylinder",
        name: "leg back right",
        position: [1050, 30, -425],
        radiusTop: 20,
        radiusBottom: 20,
        height: 60,
        tone: "dark",
      },
    ],
  },
}

export const DINING_TABLE: AssetSpec = {
  name: "Test dining table",
  category: "table",
  mount: "floor",
  dims: { w: 1800, d: 900, h: 750 },
  geometry: {
    kind: "parts",
    parts: [
      // top: y 710..750
      {
        shape: "box",
        name: "top",
        position: [0, 730, 0],
        size: [1800, 40, 900],
      },
      // legs: y 0..710
      {
        shape: "box",
        name: "leg front left",
        position: [-870, 355, 420],
        size: [60, 710, 60],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg front right",
        position: [870, 355, 420],
        size: [60, 710, 60],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg back left",
        position: [-870, 355, -420],
        size: [60, 710, 60],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg back right",
        position: [870, 355, -420],
        size: [60, 710, 60],
        tone: "dark",
      },
    ],
  },
}

export const DINING_CHAIR: AssetSpec = {
  name: "Test dining chair",
  category: "chair",
  mount: "floor",
  dims: { w: 450, d: 520, h: 800 },
  clearance: { back: 350 },
  geometry: {
    kind: "parts",
    parts: [
      // seat: y 430..480, z −190..260
      {
        shape: "box",
        name: "seat",
        position: [0, 455, 35],
        size: [450, 50, 450],
      },
      // back: y 480..800, z −260..−220
      {
        shape: "box",
        name: "back",
        position: [0, 640, -240],
        size: [450, 320, 40],
      },
      // legs: y 0..430
      {
        shape: "box",
        name: "leg front left",
        position: [-210, 215, 245],
        size: [30, 430, 30],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg front right",
        position: [210, 215, 245],
        size: [30, 430, 30],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg back left",
        position: [-210, 215, -235],
        size: [30, 430, 30],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg back right",
        position: [210, 215, -235],
        size: [30, 430, 30],
        tone: "dark",
      },
    ],
  },
}

export const SIDEBOARD: AssetSpec = {
  name: "Test sideboard",
  category: "storage",
  mount: "floor",
  dims: { w: 1600, d: 450, h: 750 },
  clearance: { front: 500 },
  geometry: {
    kind: "parts",
    parts: [
      // body: y 100..750
      {
        shape: "box",
        name: "body",
        position: [0, 425, 0],
        size: [1600, 650, 450],
      },
      // legs: y 0..100
      {
        shape: "box",
        name: "leg front left",
        position: [-760, 50, 185],
        size: [40, 100, 40],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg front right",
        position: [760, 50, 185],
        size: [40, 100, 40],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg back left",
        position: [-760, 50, -185],
        size: [40, 100, 40],
        tone: "dark",
      },
      {
        shape: "box",
        name: "leg back right",
        position: [760, 50, -185],
        size: [40, 100, 40],
        tone: "dark",
      },
    ],
  },
}

export const RUG: AssetSpec = {
  name: "Test rug",
  category: "rug",
  mount: "floor-covering",
  dims: { w: 2000, d: 1400, h: 10 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "box",
        name: "rug",
        position: [0, 5, 0],
        size: [2000, 10, 1400],
        tone: "light",
      },
    ],
  },
}

export const WALL_TV: AssetSpec = {
  name: "Test 65in TV",
  category: "media",
  mount: "wall",
  dims: { w: 1450, d: 40, h: 840 },
  geometry: {
    kind: "parts",
    parts: [
      {
        shape: "box",
        name: "screen",
        position: [0, 420, 0],
        size: [1450, 840, 40],
        tone: "dark",
      },
    ],
  },
}

export const PENDANT_LAMP: AssetSpec = {
  name: "Test pendant lamp",
  category: "lighting",
  mount: "ceiling",
  dims: { w: 400, d: 400, h: 900 },
  geometry: {
    kind: "parts",
    parts: [
      // shade: y 0..300
      {
        shape: "cylinder",
        name: "shade",
        position: [0, 150, 0],
        radiusTop: 60,
        radiusBottom: 200,
        height: 300,
        tone: "light",
      },
      // cable: y 300..900
      {
        shape: "cylinder",
        name: "cable",
        position: [0, 600, 0],
        radiusTop: 5,
        radiusBottom: 5,
        height: 600,
        tone: "dark",
      },
    ],
  },
}

export const TEST_ASSETS = {
  coffeeTable: COFFEE_TABLE,
  sofa: SOFA,
  diningTable: DINING_TABLE,
  diningChair: DINING_CHAIR,
  sideboard: SIDEBOARD,
  rug: RUG,
  wallTv: WALL_TV,
  pendantLamp: PENDANT_LAMP,
} as const satisfies Record<string, AssetSpec>
