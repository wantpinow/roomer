# Roomer v1 — architecture & engineering plan

Companion to [spec.md](spec.md). The spec says *what*; this doc says *how*. Every engineer
(human or agent) working on v1 should read both before writing code. Where this doc and the spec
disagree, this doc wins (it is newer).

## 0. Decisions recap (from the 2026-10-11 conversation)

- First room: Patrick's living/dining room (floor plan in §9). A rectangle with a notch is fine.
- Agent client: **Claude Code** over MCP on localhost.
- Photoreal default model: `openai/gpt-image-2.5-sunburst` via Vercel AI Gateway (`AI_GATEWAY_API_KEY`).
  Use **low quality / small size for tests** — every e2e run must be cheap, and the default e2e run
  must be free (stub renderer).
- Finishes: room-level solid wall colour + solid floor for v1. Schema must leave room for per-wall
  finishes later (`finishes.walls` is a string today; per-wall overrides later become
  `finishes.wallOverrides?: Record<WallId, string>`).
- Wall-mounted items (TVs, shelves, art) need first-class relative placement in v1 (`onWall`).
- UI dragging is desirable but not required for the first prototype → stretch milestone.
- Style: clean, minimal, warm, Scandinavian. Not "AI slop". Room styling follows Castlery's vibe.
- Code structure follows `../masterguest` (pnpm + turbo monorepo, Convex backend package, tests in
  `tests/` folders, thin Convex handlers with `do*` helpers, ESLint flat + Prettier, Playwright e2e
  against a local Convex backend binary).
- Everything must be **testable end-to-end by an agent without a human**: the agent must be able to
  boot the stack, drive the MCP server, render clay/id passes, run a (cheap) photoreal render, and
  look at the resulting PNGs.

## 1. Repo layout

```
roomer/
  apps/
    web/                 Next.js 16 app: UI, /render page, /api/mcp, server-side render + photoreal pipeline
    e2e/                 Playwright suite (UI e2e + MCP e2e)
  packages/
    core/                @roomer/core — pure TS domain: zod schemas, geometry, solver, placement, lint, plan SVG
    backend/             @roomer/backend — Convex (convex/), tests/, scripts/ (seed, e2e backend)
    ui/                  @roomer/ui — shadcn/radix primitives, globals.css (Tailwind v4 tokens), cn()
    eslint-config/       @roomer/eslint-config — flat configs
    typescript-config/   @roomer/typescript-config — base.json, nextjs.json, react-library.json
  seed/                  seed data (Castlery product research JSON, exported assets/layouts)
  docs/
```

Internal packages export raw `.ts` (no build step), exactly like masterguest. Web imports the backend
as `@roomer/backend/convex/_generated/api`, and `transpilePackages` includes `@roomer/ui`,
`@roomer/backend`, `@roomer/core`.

Pinned versions (keep in sync with masterguest where shared): next 16.3.x, react 19.2.x, convex
1.45+, convex-helpers 0.1.128 (has `server/zod4`), convex-test latest, @edge-runtime/vm 3.2.0,
typescript 5.9.3, tailwindcss 4.1.x, zod 4.x, vitest 4.1.x, @playwright/test 1.6x, turbo 2.8.x,
prettier 3.8.x, three 0.18x, @react-three/fiber 9.x, @react-three/drei 10.x,
@react-three/postprocessing 3.x, mcp-handler 2.x + @modelcontextprotocol/server 2.x (client: 
@modelcontextprotocol/client 2.x), ai 7.x + @ai-sdk/gateway 4.x, polygon-clipping, @resvg/resvg-js,
pngjs. pnpm 10 (root `packageManager`), Node ≥ 22.

## 2. Types & validation strategy (single source of truth)

**Deliberate deviation from masterguest:** masterguest writes Convex `v` validators by hand and has
no zod in Convex. Roomer's domain is geometry-heavy and LLM-facing, so we need (a) semantic
validation (integer millimetres, positive sizes, ranges, polygon validity), (b) field descriptions
that become MCP tool JSON Schema for the agent, and (c) the same shapes in Convex. One definition
must feed all three, so:

1. **Zod 4 schemas in `@roomer/core/src/schema/` are the single source of truth** for every domain
   shape (room, features, cameras, assets, parts, placements, layout ops, lint issues). Every field
   that an agent might fill has a `.describe()`.
2. **Convex validators are derived** from those zod schemas with `zodToConvex` from
   `convex-helpers/server/zod4`, in `packages/backend/convex/validators.ts`. Tables are defined from
   those validators plus Convex-only fields (ids, storage ids, timestamps) in `schema.ts`.
   Convex ids (`v.id("assets")`, `v.id("_storage")`) only appear in the backend layer — core uses
   plain branded strings (`AssetKey` etc.), see §3.4.
3. **Convex functions validate twice**: structurally via the derived `v` validators (Convex does this
   automatically), and semantically via zod `.parse` inside the `do*` helper (or via the
   `zCustomMutation` wrapper). Semantic failures throw `ConvexError` with a structured payload
   `{ code: "INVALID_INPUT", issues: [{ path, message }] }` so MCP can relay precise messages.
4. **MCP tool input schemas** are the same zod schemas (MCP SDK v2 takes zod 4 directly).
5. **Type-level tests** (`expectTypeOf`) in backend tests assert that `Infer<typeof vX>` and
   `z.infer<typeof X>` stay compatible.
6. Frontend uses `Doc<"layouts">`, `FunctionReturnType<typeof api.layouts.get>`, and core types.
   **Never `as any`.** Prefer `satisfies`.

Domain invariants that cannot be expressed structurally (e.g. placement ids unique within a layout,
asset bbox matches dims, corners form a simple polygon) live in core as pure functions returning
issues, are unit-tested, and are enforced in the backend `do*` helpers.

## 3. Domain conventions (core)

### 3.1 Units & frames
- All lengths are **integer millimetres** (`Mm = z.number().int()`). Angles are degrees (float).
- **Room space**: origin at corner C1. Plan view looks down from above: **+x right, +z down the
  page, +y up** (three.js y-up). Plan SVG coordinates are `(x, z)` directly.
- **Corners** C1…Cn are ordered **clockwise as seen on the plan** (x right, z down). With z pointing
  down, clockwise-on-screen polygons have **positive** shoelace area `Σ(x_i·z_{i+1} − x_{i+1}·z_i)`.
  The solver normalises to this orientation.
- **Wall Wi** runs from Ci to Ci+1 (Wn: Cn→C1). Direction `d = normalize(C_{i+1} − C_i)`.
  **Inward normal** `n = (−d.z, d.x)` (points into the room for positive-area polygons).
- **Bearing** of a plan direction `(x, z)`: `b = atan2(x, −z)` in degrees, normalised to `[0, 360)`.
  0 = up the page (−z), 90 = right (+x), 180 = down (+z), 270 = left (−x). Direction of bearing b:
  `(sin b, −cos b)`.
- **Item local space**: origin = centre of footprint at floor level. Local **+z is the item's
  front**, x is width, y is height, z is depth. **"Left"/"right" of an item are as seen by a
  person standing in front of it, facing it** (Castlery's "left-facing chaise" convention):
  `left = local −x`, `right = local +x`.
- **Facing** `f` = bearing the item's front points at. three.js rotation about y:
  `rotationY = degToRad(180 − f)`. (Check: f=180 → identity; f=90 → local +z maps to +x.)
- **World transform of a local point** `(lx, ly, lz)`: if `mirrored`, `lx = −lx`; then rotate by
  φ=180−f: `wx = lx·cosφ + lz·sinφ`, `wz = −lx·sinφ + lz·cosφ`; then translate by `(x, elevation, z)`.
- Scene units in three.js are **metres** (`mm / 1000`) so post-processing params behave.

### 3.2 IDs (human-readable, agent-friendly)
- Corners `C1..Cn`, walls `W1..Wn` (derived, stable for a given polygon).
- Features get readable ids by type, auto-assigned on create if absent: door `D1`, window `WIN1`,
  opening `OP1`, radiator `RAD1`, socket `S1`, switch `SW1`, data `DATA1`, aerial `AER1`,
  wall-light `WL1`, obstacle `OB1`, hearth `H1`, floor-socket `FS1`, pendant/ceiling-light/spotlight
  `L1`, smoke-alarm `SA1`. Agents may supply their own id (`/^[A-Za-z][A-Za-z0-9-]{0,39}$/`).
- Placement ids are slugs unique within a layout (`sofa`, `dining-table`, `chair-1`), auto-derived
  from the asset name if absent (`harper-dining-table`, then `-2`, `-3`).
- Asset **keys**: assets have a Convex `_id` and also a unique human `key` slug
  (`castlery-auburn-chaise-sofa-left-chalk`). MCP tools accept either; placements store the Convex id.

### 3.3 Schemas (zod, in `packages/core/src/schema/`)
Files: `primitives.ts`, `shell.ts` (measurements, corners, walls), `features.ts`, `room.ts`
(finishes, skirting, cameras, `RoomSpec`), `asset.ts` (parts, dims, clearance, product, `AssetSpec`),
`layout.ts` (placement, placement position helpers, ops, `LayoutSpec`), `lint.ts` (issues),
`render.ts` (render passes, photoreal request). `index.ts` re-exports. The spec (§4–§7) is the
field-level reference; additions:

- `ShellMeasurements` adds a **`walk`** form for dictation of non-rectangular rooms:
  `{ kind: "walk", segments: [{ length, turn? }] }` — start at C1 heading +x (right), walk each wall
  length, then turn by `turn` degrees (default +90 = turn right/clockwise on plan; −90 = turn left).
  The last segment's end should coincide with C1; the closure error is distributed proportionally
  along the traverse (compass rule) and reported as `residualMm`.
- `PlacementPosition` (input-only, resolved to `x/z/facing/elevation` by core):
  - `{ at: { x, z }, facing?, elevation? }`
  - `{ against: { wall, at, anchor?: "center"|"start-edge"|"end-edge", side?: "back"|"left"|"right", gap? } }`
    — puts the given side of the item flush with the wall, `skirting.depth + gap` off the plaster.
    `at` is measured from the wall's start corner along the wall.
  - `{ onWall: { wall, at, anchor?, elevation, gap? } }` — wall-mounted (TV, shelf, art, mirror);
    back flush to plaster (+gap); skirting ignored when `elevation ≥ skirting.height`.
  - `{ centerOn: { placement?: id, feature?: id, dx?, dz? }, facing?, elevation? }` — centre on
    another placement (rug under coffee table) or a ceiling feature (pendant at fitting L1);
    `facing` defaults to the target's facing.
  - `{ inCorner: { corner, gapA?, gapB?, facing? } }` — tuck into a corner (both adjacent walls).
- Layout ops (`apply_changes`), applied in order, atomically:
  `add {id?, asset, label?, position, mirrored?}`, `move {id, position}`,
  `nudge {id, dx?, dz?, rotate?}` (world mm, degrees clockwise), `swap {id, asset}` (keep centre +
  facing), `set {id, label?, mirrored?}`, `remove {id}`.
- Ceiling-mounted assets default `elevation = ceilingHeight − dims.h` (top touches ceiling);
  `drop` can be set via elevation.

### 3.4 Core module APIs (pure functions, all unit-tested)
```ts
// shell/
solveShell(m: ShellMeasurements): { corners: Vec2[]; residualMm: number; cornerAngles: number[]; method: string }
deriveWalls(corners: Vec2[]): Wall[]            // { id, startCorner, endCorner, start, end, length, dir, normal, inwardBearing }
validateShell(corners): Issue[]                 // simple polygon, ≥3 corners, no zero-length walls
// assets/
partLocalBounds(part): Aabb3                    // conservative AABB in item-local mm (handles part rotation)
assetLocalBounds(asset): Aabb3
validateAsset(asset): AssetValidation           // { ok, errors: [...], warnings: [...], bounds }
assetCollisionShapes(asset): LocalShape[]       // per part: { footprint: Vec2[] (local x,z), y0, y1 }
// placement/
resolvePosition(input, ctx: { room, walls, asset, placements, features }): ResolvedPlacement
worldShapes(placement, asset): WorldShape[]     // footprints in room space + [y0, y1]
describePlacement(placement, asset, room): PlacementRelation  // nearest wall, gap, along-wall offset — for agent readouts
applyOps(layout, ops, ctx): { layout, changes, errors }        // pure; backend calls this inside a mutation
// lint/
lint({ room, placements, assets }): LintReport  // { issues, counts: { error, warning, info }, ok }
// plan/
planSvg({ room, placements?, assets?, lint?, options? }): string
// math/
geometry helpers: polygon area/orientation/contains/intersect (polygon-clipping), bearings, transforms
```
Core must not import React, three.js, Convex, or Node APIs. It must run in Convex's V8 runtime, the
browser, and Node.

### 3.5 Lint (details beyond spec §7)
- Per-part collision: two items collide when any part pair has footprint intersection with
  min-extent > 5mm **and** y-ranges overlap by > 5mm. This lets chairs tuck under a table top.
- Floor coverings (`mount: "floor-covering"`) only collide with each other.
- Skirting is a thin obstacle strip (`skirting.depth` deep, `skirting.height` tall) along every wall.
- Static obstacles: radiators, obstacle features, hearths, window sills (`sillDepth`).
- Door swing (in): quarter-disc sector at the hinge, radius = leaf width, polygonised (≥16 segs).
- Walkway (W101/I202): 25mm occupancy grid of the floor polygon; blocked = item parts overlapping
  y∈[0,1000] (not floor coverings), obstacles, outside room. Distance transform → widest-path
  (max-min Dijkstra) between every pair of doors/openings; report the bottleneck width and the two
  nearest blockers. Same grid checks that each `clearance.front` zone of seating/storage is
  reachable from a door with ≥ 500mm width (W102).
- E006 wall items must have their back within 20mm of a wall; W105 floor items with elevation > 0
  must be supported by another item's top surface (lamp on a sideboard) within 10mm.
- Every issue message names items by label/id and includes numbers (mm) and a concrete `hint`.

## 4. Backend (Convex, `packages/backend/convex/`)

Tables (validators derived from core zod; every field commented):
- `rooms`: RoomSpec fields + `referencePhotos: Id<"_storage">[]`, `updatedAt`.
- `assets`: AssetSpec fields + `key` (unique, index `by_key`), `source`, `images:
  { storageId, sourceUrl?, primary }[]` (≤3), `previews: { view, storageId }[]`, `updatedAt`.
  Search index `search_name` on name (filter by category/source).
- `layouts`: `roomId`, `name`, `notes?`, `parentId?`, `status`, `finishes?`, `placements[]`,
  `revision` (increments per change), `lint` (stored LintReport, recomputed on every change to the
  layout, its room, or any asset it uses), `updatedAt`. Index `by_room`.
- `layoutEvents`: `layoutId`, `revision`, `actor: "agent"|"user"|"system"`, `summary` (human
  sentence), `ops` (as applied), `lintCounts`, `createdAt`. Index `by_layout`. Drives the activity
  feed ("Claude moved the sofa").
- `renders`: `layoutId`, `roomId`, `camera` (snapshot), `kind: "clay"|"id"|"photoreal"`, `status:
  "pending"|"done"|"failed"`, `model?`, `prompt?`, `inputs?: Id<"_storage">[]`, `output?:
  Id<"_storage">`, `layoutRevision`, `layoutSnapshot`, `error?`, `durationMs?`, `createdAt`.
  Index `by_layout`.

Functions (thin handlers calling exported `do*` helpers; helpers own the logic and are what tests
call): `rooms.ts`, `assets.ts`, `layouts.ts`, `renders.ts`, `files.ts`, `e2e.ts` (trapdoor, guarded by
`E2E_TESTING_ENABLED` + loopback URL, like masterguest), `seed.ts`.
Wrappers in `functions.ts`: `appQuery`, `appMutation`, `appAction` (no auth in v1 — single local user —
but every public function goes through them so auth is a one-place change later). Raw builders
from `_generated/server` are lint-banned for public functions.

Key mutations: `rooms.create`, `rooms.setShell`, `rooms.applyShellChanges`, `rooms.setFinishes`,
`rooms.upsertCamera`, `assets.create`/`update` (reject on validation errors; dims mismatch > 10mm is
an error), `assets.setImages`, `assets.setPreviews`, `layouts.create` (blank or fork),
`layouts.update`, `layouts.applyChanges` (actor, ops → resolve via core `applyOps` → re-lint → write
layout + event → return `{ revision, changes, lint, placements }`), `renders.*`.

## 5. Web app (`apps/web`)

- **UI pages** (server components exporting `metadata`, client logic in `_components/`):
  `/` (rooms), `/rooms/[roomId]` (workspace), `/library` (assets), `/library/[assetId]`.
- **Workspace**: left = layouts list (status, lint counts, live-activity dot); centre = viewer with
  Plan (core SVG + interactive overlay) / 3D (R3F orbit, clay look) / Camera toggles; right = tabs:
  Issues, Items (with total price), Activity, Renders. Live via Convex queries.
- **Scene** (`components/scene/`): `<RoomScene room placements assets pass camera />` shared by the
  viewer and the render page. `lib/scene/part-geometry.ts` builds three geometries from parts
  (unit-tested in node: geometry bbox ≈ core `partLocalBounds`).
- **/render page**: a bare client page exposing `window.roomer.render(scene, { pass, width, height,
  camera }) → Promise<string /* PNG data URL */>` and `window.roomer.ready`. Data is injected by the
  caller — no DB access — so snapshots render deterministically and one page serves many renders.
  Passes: `clay` (grey MeshStandardMaterial, N8AO, soft shadows), `id` (MeshBasicMaterial, fixed
  named palette, no AA, no tone mapping), `depth` (optional).
- **Server-side** (`apps/web/server/`, `import "server-only"`):
  - `convex.ts` — `ConvexHttpClient` factory.
  - `render/renderer.ts` — Playwright Chromium singleton (stored on `globalThis` to survive HMR),
    opens `/render` once, calls `window.roomer.render`. `serverExternalPackages: ["playwright",
    "@resvg/resvg-js"]`.
  - `render/plan-png.ts` — resvg plan PNG.
  - `photoreal/` — `ImageRenderer` interface (`{ id, maxInputImages, render({ prompt, images,
    size, quality }) }`), implementations: `gateway-openai` (gpt-image-2.5-sunburst/flare via AI
    Gateway), `gateway-gemini` (gemini-3-pro-image / gemini-3.1-flash-image), `gateway-flux`
    (flux-3-image), `stub` (returns the clay pass with a warm tint — free, deterministic; selected
    when `PHOTOREAL_STUB=1`). `prompt.ts` builds the prompt + image list (pure, unit-tested).
    `pipeline.ts` = clay+id render → visibility from id pass (pngjs pixel counts) → choose refs →
    renderer → store in Convex → render record.
  - `mcp/` — one file per tool group; `app/api/mcp/[transport]/route.ts` mounts them with
    `mcp-handler`. Tool results = JSON text + optional PNG image content. Server `instructions` =
    the agent guide (conventions §3.1, helpers, workflow, "lint → look at plan → iterate").
- **Env**: `@t3-oss/env-nextjs` (`env.ts`); `next.config.ts` also loads the repo-root `.env.local`
  (where `AI_GATEWAY_API_KEY` lives) via `@next/env` `loadEnvConfig`.
- **Dev tooling for agents**: `pnpm mcp <tool> '<json>'` (root script → `apps/web/scripts/mcp-call.ts`)
  calls a tool on the running server via `@modelcontextprotocol/client`, prints text, writes images
  to `.roomer-out/<timestamp>-<tool>-<n>.png` and prints their paths. `.mcp.json` at the repo root
  registers `roomer` for Claude Code (`http://localhost:3000/api/mcp/mcp`).

## 6. Testing

- **Unit (vitest)**: tests live in `tests/` folders (`packages/core/tests/**`,
  `packages/backend/tests/**`, `apps/web/lib/**/tests`, `apps/web/server/**/tests`). Core: solver
  (rectangle, quad with/without diagonals, corner triangles, walk incl. the real living room), walls,
  bearings/transforms, part bounds, asset validation, every placement helper, every lint rule
  (positive + negative case each), walkway bottleneck, plan SVG (structural assertions + a stored
  snapshot). Backend (convex-test, edge-runtime): every `do*` helper incl. re-lint propagation,
  revision/event bookkeeping, validation errors. Web: part geometry builders, photoreal prompt
  builder, id-pass visibility counting, MCP tool arg handling.
- **E2E (`apps/e2e`, Playwright)**: local Convex backend binary on **127.0.0.1:3220/3221** (not 3210 —
  that's the dev deployment), Next on **:3100** with `distDir: ".next-e2e"`, `PHOTOREAL_STUB=1` by
  default. Specs:
  - `mcp-flow.spec.ts` — drives the MCP server end-to-end with `@modelcontextprotocol/client`:
    create room (walk measurements) → features → create assets (preview PNGs returned) → layout →
    apply changes that produce lint errors → fix them → `render_plan` → `render_view` (clay + id;
    asserts PNG dimensions and that id-pass colours for placed items are present) →
    `render_photoreal` (stub) → render record visible.
  - `workspace.spec.ts` — UI: seeded room renders, switch layouts, issues panel, items/price,
    activity feed updates live when a mutation lands, plan view drag (stretch milestone).
  - `photoreal-live.spec.ts` — skipped unless `E2E_PHOTOREAL_LIVE=1`; runs one real
    gpt-image-2.5-flare render at low quality, 1024×1024.
  - Console-error auto fixture like masterguest.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must pass before every commit
  (masterguest checklist). E2E before milestone commits.

## 7. Style

Warm, quiet, Scandinavian: off-white paper background, warm greys, oak/sand accents, one muted
clay/terracotta accent for emphasis, generous whitespace, hairline borders, small caps labels,
restrained motion. Typeface pairing: a refined grotesk for UI + a soft serif for display (decide in
the UI milestone; no Inter/Roboto/Arial defaults). Lint severities use muted, accessible tones
(error = brick, warning = ochre, info = slate) — never neon. The plan SVG uses the same palette.

## 8. Work breakdown (milestones → commits)

1. **Scaffold** — monorepo, tooling, Convex local dev, Next app shell, CI-equivalent scripts.
2. **Core schema** — zod schemas + types (architect-owned).
3. **Core geometry** — shell solver, walls, transforms, part bounds, placement resolution, applyOps.
4. **Core lint + plan SVG**.
5. **Backend** — tables, validators, functions, tests, seed (living room shell + starter library).
6. **Scene + renderer** — R3F scene, /render page, Playwright renderer, plan PNG.
7. **MCP server + CLI** — all tools, instructions, `.mcp.json`, `pnpm mcp`.
8. **Photoreal pipeline** — renderers, prompt builder, pipeline, live smoke test.
9. **UI** — design system, workspace, library, renders gallery.
10. **E2E suite**.
11. **Dogfood** — build Castlery assets + candidate layouts for the living room via MCP; fix what
    hurts; export to `seed/`.
12. **Stretch** — plan-view drag/rotate with live lint.

## 9. The test room (from Patrick's floor plan, estimated)

Living/Dining room, 7.69m × 2.98m. Plan-up = the hall end. Walk measurements (start C1 = top-left
inner corner, heading right):

| Segment | Length | Then turn | Wall |
|---|---|---|---|
| C1→C2 | 2980 | +90 | W1 hall end (door D1) |
| C2→C3 | 7090 | +90 | W2 long right wall (door D2 to kitchen) |
| C3→C4 | 810 | −90 | W3 step |
| C4→C5 | 600 | +90 | W4 recess side |
| C5→C6 | 2170 | +90 | W5 window wall (window WIN1) |
| C6→C1 | 7690 | +90 | W6 long left wall (pier OB1) |

Features (estimates; Patrick will correct after measuring):
- D1 on W1: offset 1150, width 800, swing **out** (into hall), hinge end. Height 1980.
- D2 on W2: offset 5250, width 760, swing **in**, hinge at the end nearer the window (`end`).
- WIN1 on W5: offset 120, width 1930, bottom 650, height 1450, opens out.
- OB1 on W6 ("bit of wall pointing out", not a fireplace): offset 4920, width 1000, depth 120,
  full height.
- Ceiling height 2450 (assumed). Skirting 150 × 18 (assumed).
- Assumed (clearly labelled "assumed" so they're easy to delete): RAD1 under WIN1 (width 1400,
  bottom 150, height 600, depth 110); pendant fittings L1 (living zone) and L2 (dining zone) on the
  centreline; a double socket on W6 and on W2 near each zone.
- Finishes (Castlery-inspired): warm white walls, light natural oak boards, white ceiling,
  white skirting.
