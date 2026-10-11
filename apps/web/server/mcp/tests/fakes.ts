import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import { assetFootprint } from "@roomer/core/assets"
import { defaultCameras } from "@roomer/core/cameras"
import {
  COFFEE_TABLE,
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
  LIVING_ROOM_MEASUREMENTS,
  LIVING_ROOM_NAME,
  LIVING_ROOM_SKIRTING,
  RUG,
  SOFA,
} from "@roomer/core/fixtures"
import { deriveWalls, toRoomGeometry } from "@roomer/core/geometry"
import { describePlacement } from "@roomer/core/placement"
import type {
  AssetSpec,
  LintReport,
  Placement,
  RoomSpec,
} from "@roomer/core/schema"
import { solveShell } from "@roomer/core/shell"
import { PNG } from "pngjs"
import { vi, type Mock } from "vitest"

import { hexToRgb, idPassColor } from "@/lib/scene/id-pass"
import type { RenderScene } from "@/lib/scene/types"

import type {
  AssetDetail,
  LayoutDetail,
  RenderRecord,
  RoomDetail,
  RoomerApi,
} from "../../convex"
import type { PipelineDeps, SceneRenderer } from "../../pipelines/deps"
import type { ImageRenderer } from "../../photoreal/types"

// In-memory stand-ins for Convex, the headless renderer and the image
// models, built from @roomer/core's fixtures (Patrick's living room and the
// test assets). Every API method is a vi.fn so tests can assert calls or
// swap in failures with mockRejectedValueOnce.

export const ROOM_ID = "room00000000000000000000000001" as Id<"rooms">
export const LAYOUT_ID = "layout0000000000000000000000001" as Id<"layouts">
export const SOFA_ID = "assetsofa000000000000000000001" as Id<"assets">
export const TABLE_ID = "assettable00000000000000000001" as Id<"assets">
export const RUG_ID = "assetrug0000000000000000000001" as Id<"assets">
export const RENDER_ID = "render0000000000000000000000001" as Id<"renders">

export const NOW = Date.UTC(2026, 9, 11, 19, 15)

export function storageId(n: number): Id<"_storage"> {
  return `storage${String(n).padStart(23, "0")}` as Id<"_storage">
}

/** A solid PNG of a given size (passes, previews, photos). */
export function solidPng(
  width: number,
  height: number,
  [r, g, b]: readonly [number, number, number] = [200, 200, 200]
): Buffer {
  const png = new PNG({ width, height })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r
    png.data[i + 1] = g
    png.data[i + 2] = b
    png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}

export function roomSpec(): RoomSpec {
  const solved = solveShell(LIVING_ROOM_MEASUREMENTS)
  const geometry = {
    corners: solved.corners,
    ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
    skirting: LIVING_ROOM_SKIRTING,
    features: LIVING_ROOM_FEATURES,
  }
  return {
    name: LIVING_ROOM_NAME,
    ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
    shell: {
      measurements: LIVING_ROOM_MEASUREMENTS,
      corners: solved.corners,
      solve: solved.solve,
    },
    skirting: LIVING_ROOM_SKIRTING,
    features: LIVING_ROOM_FEATURES,
    finishes: LIVING_ROOM_FINISHES,
    cameras: defaultCameras(geometry),
  }
}

export function roomDetail(): RoomDetail {
  const spec = roomSpec()
  return {
    ...spec,
    _id: ROOM_ID,
    _creationTime: NOW,
    referencePhotos: [],
    updatedAt: NOW,
    walls: deriveWalls(spec.shell.corners).map((wall) => ({
      id: wall.id,
      startCorner: wall.startCorner,
      endCorner: wall.endCorner,
      length: Math.round(wall.length),
      inwardBearing: Math.round(wall.inwardBearing * 10) / 10,
    })),
    referencePhotoUrls: [],
  }
}

const SPECS: Record<string, { key: string; spec: AssetSpec }> = {
  [SOFA_ID]: { key: "generic-sofa", spec: { ...SOFA, name: "Generic sofa" } },
  [TABLE_ID]: {
    key: "generic-coffee-table",
    spec: {
      ...COFFEE_TABLE,
      name: "Generic coffee table",
      product: {
        url: "https://example.com/table",
        retailer: "Example",
        price: 369,
        currency: "GBP",
        dimsSource: "listing",
      },
    },
  },
  [RUG_ID]: { key: "generic-rug", spec: { ...RUG, name: "Generic rug" } },
}

export function assetDetail(id: Id<"assets"> = SOFA_ID): AssetDetail {
  const entry = SPECS[id]
  if (!entry) throw new Error(`no fixture asset ${id}`)
  const withPhoto = id === TABLE_ID
  return {
    ...entry.spec,
    _id: id,
    _creationTime: NOW,
    key: entry.key,
    source: "library",
    images: withPhoto
      ? [
          {
            storageId: storageId(900),
            primary: true,
            sourceUrl: "https://example.com/table.jpg",
          },
        ]
      : [],
    previews: [],
    updatedAt: NOW,
    imageUrls: withPhoto
      ? [
          {
            storageId: storageId(900),
            primary: true,
            sourceUrl: "https://example.com/table.jpg",
            url: "http://127.0.0.1:3210/api/storage/table",
          },
        ]
      : [],
    primaryImageUrl: withPhoto
      ? "http://127.0.0.1:3210/api/storage/table"
      : null,
    previewUrls: [],
  }
}

export function assetSummary(id: Id<"assets"> = SOFA_ID) {
  const detail = assetDetail(id)
  const { geometry, imageUrls, ...rest } = detail
  void imageUrls
  return {
    ...rest,
    partCount: geometry.parts.length,
    footprint: assetFootprint(detail),
  }
}

export const PLACEMENTS: (Placement & { assetId: Id<"assets"> })[] = [
  {
    id: "sofa",
    assetId: SOFA_ID,
    x: 493,
    z: 3700,
    facing: 90,
    elevation: 0,
  },
  {
    id: "coffee-table",
    assetId: TABLE_ID,
    x: 1668,
    z: 3700,
    facing: 90,
    elevation: 0,
  },
  {
    id: "rug",
    assetId: RUG_ID,
    label: "Living rug",
    x: 1668,
    z: 3700,
    facing: 90,
    elevation: 0,
  },
]

export const LINT_WITH_ERROR: LintReport = {
  ok: false,
  counts: { error: 1, warning: 1, info: 1 },
  issues: [
    {
      code: "I203",
      severity: "info",
      message: "A 120mm gap between Generic sofa and W6 collects dust.",
      placementIds: ["sofa"],
      featureIds: [],
    },
    {
      code: "W103",
      severity: "warning",
      message: "Generic sofa is 200mm in front of RAD1.",
      placementIds: ["sofa"],
      featureIds: ["RAD1"],
      hint: "Move it 100mm away from the radiator.",
    },
    {
      code: "E001",
      severity: "error",
      message:
        "Generic sofa overlaps Generic coffee table by 120mm (x) × 340mm (z).",
      placementIds: ["sofa", "coffee-table"],
      featureIds: [],
      hint: "Move Generic coffee table 130mm towards +x.",
    },
  ],
}

export const LINT_CLEAN: LintReport = {
  ok: true,
  counts: { error: 0, warning: 0, info: 0 },
  issues: [],
}

export function layoutDetail(
  overrides: Partial<
    Pick<LayoutDetail, "lint" | "placements" | "revision">
  > = {}
): LayoutDetail {
  const room = roomSpec()
  const geometry = toRoomGeometry(room)
  const walls = deriveWalls(geometry.corners)
  const placements = overrides.placements ?? PLACEMENTS
  const assets = Object.fromEntries(
    [SOFA_ID, TABLE_ID, RUG_ID].map((id) => {
      const detail = assetDetail(id)
      return [
        id,
        {
          ...SPECS[id]!.spec,
          _id: id,
          key: detail.key,
          source: detail.source,
          primaryImageUrl: detail.primaryImageUrl,
        },
      ]
    })
  )
  return {
    _id: LAYOUT_ID,
    _creationTime: NOW,
    roomId: ROOM_ID,
    name: "Starter",
    notes: "Sofa against W6.",
    status: "draft",
    placements,
    revision: overrides.revision ?? 3,
    lint: overrides.lint ?? LINT_WITH_ERROR,
    updatedAt: NOW,
    assets,
    relations: Object.fromEntries(
      placements.map((p) => [
        p.id,
        describePlacement(p, SPECS[p.assetId]!.spec, { room: geometry, walls }),
      ])
    ),
    price: {
      amount: 369,
      currency: "GBP",
      mixedCurrencies: false,
      unpricedItems: 2,
    },
  }
}

export function renderRecord(
  overrides: Partial<RenderRecord> = {}
): RenderRecord {
  const camera = roomSpec().cameras[0]!
  return {
    _id: RENDER_ID,
    _creationTime: NOW,
    layoutId: LAYOUT_ID,
    roomId: ROOM_ID,
    kind: "photoreal",
    status: "done",
    view: camera,
    model: "stub",
    quality: "low",
    inputs: [],
    output: storageId(1),
    layoutRevision: 3,
    layoutSnapshot: { placements: PLACEMENTS },
    durationMs: 4200,
    createdAt: NOW,
    completedAt: NOW + 4200,
    outputUrl: "http://127.0.0.1:3210/api/storage/out",
    inputUrls: [],
    ...overrides,
  }
}

type MockOf<Fn> = Fn extends (...args: infer Args) => infer Result
  ? Mock<(...args: Args) => Result>
  : never

type FakeApi = {
  [Group in keyof RoomerApi]: {
    [Method in keyof RoomerApi[Group]]: MockOf<RoomerApi[Group][Method]>
  }
}

/** A RoomerApi over the fixtures; storage ids count up from storage…1. */
export function fakeApi(): FakeApi {
  let uploads = 0
  return {
    rooms: {
      list: vi.fn(async () => {
        const room = roomDetail()
        return [
          {
            _id: room._id,
            name: room.name,
            ceilingHeight: room.ceilingHeight,
            corners: room.shell.corners,
            featureCount: room.features.length,
            finishes: room.finishes,
            updatedAt: NOW,
            layouts: [],
            bestLayoutId: null,
          },
        ]
      }),
      get: vi.fn(async () => roomDetail()),
      create: vi.fn(async () => {
        const room = roomDetail()
        return {
          roomId: ROOM_ID,
          corners: room.shell.corners,
          solve: room.shell.solve,
          featureIds: room.features.map((f) => f.id),
        }
      }),
      setShell: vi.fn(async () => {
        const room = roomDetail()
        return {
          corners: room.shell.corners,
          solve: room.shell.solve,
          droppedFeatures: [],
        }
      }),
      applyShellChanges: vi.fn(async () => ({
        changes: [
          {
            index: 0,
            op: "addFeature" as const,
            featureId: "S5",
            summary: "Added socket S5 on W6",
          },
        ],
        featureIds: [...roomDetail().features.map((f) => f.id), "S5"],
      })),
      upsertCamera: vi.fn(async () => ({ created: true })),
      addReferencePhotos: vi.fn(async (args) => ({
        referencePhotos: args.storageIds,
      })),
    },
    assets: {
      list: vi.fn(async () => [
        assetSummary(SOFA_ID),
        assetSummary(TABLE_ID),
        assetSummary(RUG_ID),
      ]),
      search: vi.fn(async () => [
        assetSummary(SOFA_ID),
        assetSummary(TABLE_ID),
        assetSummary(RUG_ID),
      ]),
      get: vi.fn(async ({ assetId }) =>
        assetId in SPECS ? assetDetail(assetId) : null
      ),
      getByKey: vi.fn(async ({ key }) => {
        const id = Object.entries(SPECS).find(([, s]) => s.key === key)?.[0]
        return id ? assetDetail(id as Id<"assets">) : null
      }),
      create: vi.fn(async (args) => ({
        assetId: SOFA_ID,
        key: args.key ?? "new-asset",
        warnings: [],
        bounds: {
          min: [-args.dims.w / 2, 0, -args.dims.d / 2],
          max: [args.dims.w / 2, args.dims.h, args.dims.d / 2],
        },
      })),
      update: vi.fn(async () => ({
        warnings: [],
        bounds: { min: [-1100, 0, -475], max: [1100, 820, 475] },
        relintedLayouts: 1,
      })),
      setPreviews: vi.fn(async (args) => ({ previews: args.previews })),
      addImagesFromUrls: vi.fn(async (args) => ({
        results: args.urls.map((url, i) => ({
          url,
          ok: true as const,
          storageId: storageId(500 + i),
        })),
        images: args.urls.map((url, i) => ({
          storageId: storageId(500 + i),
          sourceUrl: url,
          primary: i === (args.primaryIndex ?? 0),
        })),
      })),
    },
    layouts: {
      listByRoom: vi.fn(async () => {
        const layout = layoutDetail()
        return [
          {
            _id: layout._id,
            _creationTime: NOW,
            roomId: ROOM_ID,
            name: layout.name,
            status: layout.status,
            revision: layout.revision,
            lintCounts: layout.lint.counts,
            updatedAt: NOW,
            placementCount: layout.placements.length,
            price: layout.price,
          },
        ]
      }),
      get: vi.fn(async () => layoutDetail()),
      create: vi.fn(async () => ({ layoutId: LAYOUT_ID, lint: LINT_CLEAN })),
      update: vi.fn(async () => ({ revision: 4 })),
      applyChanges: vi.fn(async () => ({
        revision: 4,
        changes: [
          {
            index: 0,
            op: "move" as const,
            id: "coffee-table",
            summary: "Moved coffee-table 130mm right",
          },
        ],
        lint: LINT_CLEAN,
        placements: PLACEMENTS,
      })),
    },
    renders: {
      create: vi.fn(async () => ({ renderId: RENDER_ID, layoutRevision: 3 })),
      complete: vi.fn(async () => null),
      fail: vi.fn(async () => null),
      listByLayout: vi.fn(async () => [renderRecord()]),
      get: vi.fn(async () => renderRecord()),
    },
    files: {
      upload: vi.fn(async () => storageId(++uploads)),
      download: vi.fn(async () => ({
        data: solidPng(8, 8),
        mime: "image/png",
      })),
    },
  }
}

/**
 * Renders flat PNGs at the requested size. The id pass paints the left half
 * in the first placement's colour (so visibility is countable); previews
 * are 64×64.
 */
export function fakeSceneRenderer(): {
  [Method in keyof SceneRenderer]: Mock<SceneRenderer[Method]>
} {
  return {
    renderScene: vi.fn(async (scene: RenderScene) => {
      if (scene.pass !== "id" || scene.placements.length === 0) {
        return solidPng(scene.width, scene.height)
      }
      const png = new PNG({ width: scene.width, height: scene.height })
      const [r, g, b] = hexToRgb(idPassColor(0).hex)
      for (let y = 0; y < scene.height; y++) {
        for (let x = 0; x < scene.width; x++) {
          const i = (y * scene.width + x) * 4
          const left = x < scene.width / 2
          png.data[i] = left ? r : 217
          png.data[i + 1] = left ? g : 217
          png.data[i + 2] = left ? b : 217
          png.data[i + 3] = 255
        }
      }
      return PNG.sync.write(png)
    }),
    renderAssetPreviews: vi.fn(
      async (_asset, views = ["front", "side", "top", "iso"]) =>
        views.map((view) => ({ view, png: solidPng(64, 64) }))
    ),
  }
}

export function fakeImageRenderer(
  id: ImageRenderer["id"] = "stub"
): ImageRenderer & { render: Mock<ImageRenderer["render"]> } {
  return {
    id,
    maxInputImages: 16,
    prefersIdPass: true,
    render: vi.fn(async () => ({ png: solidPng(32, 16, [180, 150, 120]) })),
  }
}

export interface FakeDeps extends PipelineDeps {
  api: ReturnType<typeof fakeApi> & RoomerApi
  renderer: ReturnType<typeof fakeSceneRenderer>
  imageRenderer: ReturnType<typeof fakeImageRenderer>
  photoreal: { renderer: Mock<PipelineDeps["photoreal"]["renderer"]> }
}

export function fakeDeps(): FakeDeps {
  const imageRenderer = fakeImageRenderer()
  let clock = NOW
  return {
    api: fakeApi(),
    renderer: fakeSceneRenderer(),
    imageRenderer,
    photoreal: { renderer: vi.fn(() => imageRenderer) },
    now: () => (clock += 1000),
  }
}

/** The text of a tool result (all text blocks joined). */
export function textOf(result: {
  content: readonly { type: string; text?: string }[]
}): string {
  return result.content
    .flatMap((block) =>
      block.type === "text" && block.text ? [block.text] : []
    )
    .join("\n")
}

export function imagesOf(result: {
  content: readonly { type: string }[]
}): number {
  return result.content.filter((block) => block.type === "image").length
}
