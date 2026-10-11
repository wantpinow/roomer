# Roomer — v1 spec

Status: draft · 2026-10-11

## 1. What Roomer is

Roomer stores room layouts and checks them for mistakes, and the main user is an AI agent. You describe a room's fixed parts once (walls, doors, windows, radiators, sockets, light fittings). Furniture is then placed into named **layouts**, which are alternative arrangements of the same room. Every change is checked by a **linter**: things overlapping, a blocked door, a sofa in front of a radiator. When a layout looks right, Roomer renders a plain grey ("clay") image from a saved camera position. It sends that image, plus product photos, to an image model, which paints a realistic version.

The agent (Claude Code for v1) does most of the work over MCP: it reads product pages, builds furniture models, proposes layouts and fixes lint issues. The web UI is mainly for looking and checking.

### Principles

1. **The room is stored as a JSON document.** The 3D view, the floor plan, the linter and the renders are all generated from it, and nothing is stored only in the 3D view.
2. **Everything is in whole millimetres, and angles are in degrees.** Items only rotate around the vertical axis.
3. **The format is designed for the agent.** It uses wall-relative placement ("against W2, 1200mm along") and plain-English lint messages that include numbers. Every change returns the lint report.
4. **Checks are simple geometry, not physics.** Each item has a floor outline (footprint) and a height range. This is predictable and easy to explain.
5. **Models are grey shapes with no textures.** Visual realism comes from the image model at render time.

### Scope of v1

- One user, everything runs locally, one room: the living room, which is roughly rectangular.
- The agent works through Claude Code over MCP on localhost.
- Dragging furniture in the UI is a stretch goal. Viewing the room and watching it update live is required.

## 2. Architecture

```
Claude Code ──MCP (Streamable HTTP)──► Next.js  /api/mcp ─────► Convex (local deployment)
                                          │                         ▲
                                          │                         │ live queries
                                          ├─► src/core              Browser: R3F viewer + plan
                                          │   (schema, solver,
                                          │    linter, plan SVG,
                                          │    part geometry)
                                          ├─► Playwright (headless) ─► /render/* pages ─► PNG
                                          └─► Vercel AI Gateway ─► image model ─► realistic PNG
```

| Concern | Choice | Notes |
|---|---|---|
| App | Next.js (App Router), React, TypeScript | Single app, not a monorepo |
| 3D | `three` + `@react-three/fiber` + `@react-three/drei` | Client-only (`dynamic(..., { ssr: false })`) |
| Clay look | `@react-three/postprocessing` (N8AO) + soft shadows | Grey `MeshStandardMaterial`, Blender-style |
| Data | Convex, local deployment | Live queries mean the browser updates as the agent edits. Convex file storage holds images and renders |
| Schema | `zod` in `src/core/schema.ts` | Shared by Convex, the MCP server, the UI and the render pages |
| UI state | `zustand` | Only selection, hover and view mode. The room data itself comes from Convex |
| MCP | `mcp-handler` / `@modelcontextprotocol/sdk` route at `/api/mcp` | `claude mcp add --transport http roomer http://localhost:3000/api/mcp` |
| Headless render | Playwright Chromium, kept running, screenshots of `/render/*` routes | The UI, previews and clay renders all use the same drawing code |
| Plan raster | `@resvg/resvg-js` | Converts the floor-plan SVG to PNG for MCP image responses |
| Image models | Vercel AI Gateway (`AI_GATEWAY_API_KEY`) | See §8 |

`src/core` is plain TypeScript with no React and no Convex dependency. That lets the linter and the plan renderer run anywhere: in Convex functions, in the MCP handler, or in the browser for live lint while dragging.

## 3. Coordinates and conventions

- **Room space:** the origin is at corner C1. On the plan, **x** points right, **z** points down the page and **y** points up out of the floor. The floor-plan SVG uses (x, z) directly as its (x, y).
- **Corners** C1…Cn are listed clockwise around the room as seen on the plan. **Wall Wi** runs from Ci to Ci+1. Each wall's *inward normal* points into the room.
- **Measurements go to the plaster, not the skirting.** Skirting is modelled separately (§4).
- **Wall features** (doors, sockets, radiators and so on) are positioned by `wallId` + `offset`. The offset is measured along the wall from its start corner to the feature's nearest edge, which matches how you'd measure with a tape.
- **Facing** is a compass-style bearing on the plan. 0 = the item's front faces up the page (−z), 90 = right (+x), 180 = down, 270 = left. Code converts this to a three.js rotation. The agent never sees radians or quaternions.
- **Item local space:** the origin is the centre of the footprint at floor level. The item's **front** is +z in local space, **width** runs along x, **height** along y and **depth** along z.

## 4. The room

```ts
type Room = {
  id: string;
  name: string;                       // "Living room"
  ceilingHeight: number;              // mm (single value in v1)
  measurements: ShellMeasurements;    // raw input, kept so we can re-solve
  corners: [number, number][];        // solved polygon, (x, z) mm
  solve: { residualMm: number; cornerAngles: number[] };  // report back to user
  skirting: { height: number; depth: number };
  features: Feature[];
  finishes: Finishes;                 // text, fed into the render prompt
  referencePhotos: FileId[];          // photos of the real room (for render realism)
  cameras: Camera[];
};

type Finishes = { walls?: string; floor?: string; ceiling?: string; skirting?: string; notes?: string };
```

### Features

```ts
type WallFeature = { id: string; wallId: string; offset: number; width: number; bottom: number; height: number; label?: string } & (
  | { type: "door"; hinge: "start" | "end"; swing: "in" | "out" | "none"; leaves?: 1 | 2 }
  | { type: "window"; opens: "in" | "out" | "sash" | "fixed"; revealDepth?: number; sillDepth?: number }
  | { type: "opening" }                                  // doorless archway
  | { type: "radiator"; depth: number }                  // protrudes `depth` into room
  | { type: "socket" | "switch" | "data" | "aerial" | "wall-light"; gang?: 1 | 2 }  // point-ish; width/height small
  | { type: "obstacle"; depth: number; kind: "chimney-breast" | "pillar" | "boxing" | "other" }
);

type FloorFeature = { id: string; x: number; z: number; width: number; depth: number; height: number; facing?: number; label?: string } & (
  | { type: "hearth" }                                   // low obstacle in front of a fireplace
  | { type: "floor-socket" }
  | { type: "obstacle" }
);

type CeilingFeature = { id: string; x: number; z: number; label?: string } & (
  | { type: "pendant"; drop?: number }
  | { type: "ceiling-light" | "spotlight" | "smoke-alarm" }
);

type Feature = WallFeature | FloorFeature | CeilingFeature;
```

Chimney breasts and boxing are modelled as solid **obstacles** attached to a wall, not as kinks in the floor outline. That keeps the room outline a simple 4-sided shape for most rooms. The linter treats obstacles exactly like furniture, and the alcoves on either side are just the space next to the obstacle.

### Measuring a room that isn't square (no protractor needed)

Corner angles can be worked out from distances alone. The room is treated as triangles, and the solver fills in the angles.

**Option A — laser measure (recommended, about £40):**
1. Measure each wall plaster-to-plaster at one fixed height, above the furniture (~1.2m). Old walls aren't perfectly vertical, so using the same height every time keeps it consistent.
2. Measure **both diagonals** (C1→C3 and C2→C4).
3. Four sides plus one diagonal fix the shape completely. The second diagonal is a check. The solver does a least-squares fit and reports each corner's angle (e.g. "C2 is 91.3°") and the leftover error. If that error is over 15mm, re-measure.

**Option B — tape only (corner triangles):**
Diagonals across a furnished room are hard to do with a tape, so measure each corner's angle with a triangle instead. Mark 600mm along one wall and 800mm along the other, starting from the corner, then measure between the two marks. In a square corner that distance is exactly 1000mm. The solver turns it into an angle (cosine rule) and fits the room from the four sides plus four corner triangles.

**Option C — just a rectangle:** give two lengths. This is fine for the first test.

**Features:** measure from the wall's start corner to the feature's nearest edge, plus its width, bottom height and height. For a door, also note which side the hinge is on and whether it opens into the room. For a radiator, note how far it sticks out from the wall.

`measurements` accepts any of the three forms. The agent will usually get these numbers by dictation and call `set_room_shell`. You then check the result against the floor-plan image.

```ts
type ShellMeasurements =
  | { kind: "rectangle"; width: number; depth: number }
  | { kind: "quad"; sides: [number, number, number, number]; diagonals?: { c1c3?: number; c2c4?: number };
      cornerTriangles?: { corner: 1 | 2 | 3 | 4; a: number; b: number; c: number }[] }
  | { kind: "polygon"; corners: [number, number][] };   // escape hatch
```

Future option: an iPhone LiDAR scan (Apple RoomPlan) could be imported to get the shape, with laser measurements to refine it. Not in v1.

## 5. Assets (furniture)

```ts
type Asset = {
  id: string;
  name: string;                                         // "Söderhamn 3-seat sofa"
  source: "library" | "custom";
  category: "sofa" | "chair" | "table" | "storage" | "bed" | "lighting" | "rug" | "decor" | "media" | "other";
  mount: "floor" | "floor-covering" | "wall" | "ceiling";
  dims: { w: number; d: number; h: number };            // overall size, mm — the truth
  geometry: { kind: "parts"; parts: Part[] } | { kind: "glb"; fileId: FileId };  // glb = stretch
  clearance?: { front?: number; back?: number; left?: number; right?: number };  // must stay free
  description?: string;                                 // visual description for render prompt
  product?: { url: string; retailer?: string; price?: number; currency?: string;
              dimsSource: "listing" | "measured" | "estimated" };
  images: { fileId: FileId; sourceUrl?: string; primary?: boolean }[];           // ≤ 3
};
```

### Building models from simple shapes ("parts")

The agent builds models by combining simple shapes, all in item-local mm:

```ts
type Part = {
  name: string;                                         // "seat cushion L"
  position: [number, number, number];                   // centre of the part
  rotation?: [number, number, number];                  // degrees, applied X→Y→Z
} & (
  | { shape: "box"; size: [number, number, number] }                         // w, h, d
  | { shape: "roundedBox"; size: [number, number, number]; radius: number }
  | { shape: "cylinder"; radiusTop: number; radiusBottom: number; height: number }
  | { shape: "sphere"; radius: number }
  | { shape: "extrude"; profile: [number, number][]; depth: number; axis: "x" | "y" | "z" }  // e.g. L-shaped base, curved arm
  | { shape: "lathe"; profile: [number, number][] }                         // (radius, y) — lamps, vases, round tables
);
```

**`create_asset` validates the model** before saving it:
- The combined bounding box of the parts must match `dims` to within 10mm. If it doesn't, the call returns the mismatch so the agent can fix it.
- No part may go below the floor (y < 0). A floor-standing item must touch the floor.
- Every successful create or update returns preview images (front, side, top and an angled view) so the agent can compare against product photos.

**Collision shape:** each part's bounding box, in item-local space, becomes a footprint and a height range. An `extrude` along y uses its actual outline, so an L-shaped sofa gets an L-shaped footprint. This is accurate enough for furniture.

### Agent workflow for a product link (written into the MCP server instructions)

1. Fetch the product page and pull out the W×D×H measurements, a short visual description and 1–3 clean product photos (white background preferred).
2. Call `create_asset` with the parts and look at the preview images that come back.
3. Compare the previews with the product photos and fix proportions with `update_asset`. Stop after about 3 rounds; rough is fine.
4. Call `add_asset_images` with the photo URLs. The server downloads them; if a site blocks that, the agent sends base64 instead.

### Starter library

Around 10 common IKEA pieces with well-known sizes, built from parts: Billy, Kallax 2×4, Lack side table, Lack coffee table, Poäng, a generic 3-seat sofa, a generic armchair, a floor lamp, a TV bench and a rug. They have no photos, so renders show them as generic furniture.

## 6. Layouts

```ts
type Layout = {
  id: string;
  roomId: string;
  name: string;                                         // "Sofa facing fireplace"
  notes?: string;                                       // agent's rationale
  parentId?: string;                                    // forked from
  status: "draft" | "candidate" | "favourite" | "archived";
  finishes?: Partial<Finishes>;                         // e.g. try a darker wall colour
  placements: Placement[];
};

type Placement = {
  id: string;
  assetId: string;
  label?: string;
  x: number; z: number;                                 // footprint centre, room space
  facing: number;                                       // bearing, degrees
  elevation: number;                                    // bottom of item above floor (0 for floor items)
};
```

**"Against a wall" shortcut** (accepted wherever a placement position is accepted):

```ts
{ against: { wall: "W2", at: 1200, anchor: "center" | "start-edge", gap?: 0 } }
```

This sets `facing` to point away from the wall, into the room. It positions the item so its back is `skirting.depth + gap` from the plaster, and puts its centre (or the edge nearest the wall's start corner) `at` mm along the wall. The resolved x/z/facing values are stored, not the shortcut.

## 7. Linter

`lint(room, layout, assets) → Issue[]` is a pure function in `src/core/lint`. It runs on every change and is returned with every change made through MCP.

```ts
type Issue = {
  code: string;                 // "E001"
  severity: "error" | "warning" | "info";
  message: string;              // "Sofa overlaps Coffee table by 120mm (x) × 340mm (z)."
  placementIds: string[];
  featureIds: string[];
  hint?: string;                // "Move Coffee table 130mm towards +z."
};
```

**How collisions are checked:** each item has a footprint (one or more rectangles or polygons in room space) and a height range [bottom, top]. Two items **collide** only if their footprints overlap **and** their height ranges overlap. Overlaps of up to 5mm are allowed. Rugs (`floor-covering`) only collide with other rugs. The skirting is a thin obstacle along every wall, which "against" placements already avoid.

| Code | Severity | Rule |
|---|---|---|
| E001 | error | Two items overlap |
| E002 | error | Item overlaps a fixed obstacle (chimney breast, radiator, hearth, window sill) |
| E003 | error | Item is outside the room or goes through a wall |
| E004 | error | Item is inside a door's swing arc (for doors that swing in) |
| E005 | error | Item blocks a doorway or opening (800mm-deep zone in front of it) |
| E006 | error | Item is taller than the ceiling, or a wall item hangs in mid-air |
| W101 | warning | No walking route of at least 700mm wide between every pair of doors |
| W102 | warning | An item's `clearance` zone isn't free or can't be reached (drawers, wardrobe doors, legroom in front of seats) |
| W103 | warning | A tall item sits within 300mm of the front of a radiator |
| W104 | warning | An item taller than the window sill sits within 300mm in front of a window |
| I201 | info | A socket is hidden behind an item. Lists which sockets, since you may still need to reach them |
| I202 | info | A walking route is 700–900mm wide (usable but tight) |
| I203 | info | A gap of 50–300mm between items or walls, which tends to collect dust and look accidental |

**How the walking-route checks (W101/I202) work:** the floor is turned into a 25mm grid. Squares are marked blocked if they're covered by items at walking height (0–1000mm), obstacles or the outside of the room. The free space is then shrunk by half the route width, so only space wide enough for a person is left. A search checks that every door can reach every other door, and that every clearance zone can be reached. The narrowest point is reported.

## 8. Views and rendering

### Floor plan (SVG)
A pure function `planSvg(room, layout?, issues?)` draws:
- Walls with thickness, door swings, windows, radiators, and socket and light symbols.
- Item footprints with labels.
- Overall measurements, plus corner angles that aren't 90°.
- Lint issues highlighted.

It's returned to the agent as both SVG text and PNG. It's the main way the agent checks what it has done.

### 3D viewer (browser)
R3F scene with the clay look. Walls facing the camera are hidden or see-through so you can look inside. There's a top-down view and a free-orbit view, a lint panel, and switching between layouts. Item labels show on hover. It updates live as the agent makes changes, through Convex live queries.

### Walk mode (first person)
Added 2026-10-11 at Patrick's request: walk around the room in first person as a 6-ft (1,830mm) person, eyes at about 1,710mm. You bump into walls and furniture, and you can jump (about 500mm) to stand on low furniture. Collision uses the same per-part shapes as the linter, so what you bump into is exactly what lint considers solid. Controls are WASD and mouse-look, Space to jump, Shift to run and Esc to exit. It is a fourth stage mode next to Plan / 3D / Camera.

### Clay renders (headless)
`/render/view?layout=…&camera=…&pass=clay|id|depth` loads the same scene, then sets `window.__ROOMER_READY__`. Playwright takes a screenshot of the canvas.

- **clay:** grey, ambient-occlusion shading, soft daylight coming from the windows.
- **id:** flat, unlit colours, one distinct colour per item, plus a colour legend. Pixel counts show which items are visible and how much space each takes up.
- **depth:** optional, if the image model benefits from it.

**Cameras:** `{ id, name, position, target, fov }`. Defaults are created automatically from each door and each corner at 1600mm eye height, with a ~65° horizontal field of view (like a phone camera). The agent can add more.

### Realistic renders
1. Render the **clay** and **id** passes from the chosen camera at 1536×1024.
2. Choose product photos: one primary photo per visible item, largest on screen first. Stop at the model's input limit (gpt-image allows 16 images including the 2 passes; FLUX 3 allows 10).
3. Build the prompt from:
   - the room and layout finishes;
   - a list matching ID colours to items ("magenta = Söderhamn sofa, see reference 3; olive = walnut side table, see reference 4");
   - fixed instructions: keep the camera, geometry and positions exactly the same, don't add or remove furniture, make it photorealistic with natural daylight from the windows.
4. Call the model through AI Gateway (`images.edit` with all images).
5. Save a **Render** record with the output image, the model, the prompt, the input file IDs and a **copy of the layout** at that moment, so renders can be compared and reproduced.

**Models** (all live on AI Gateway as of 2026-10-11):

| Model | Why |
|---|---|
| `openai/gpt-image-2.5-sunburst` | **Default.** OpenAI's newest model (Sept 2026), built for precise edits. Takes up to 16 input images |
| `openai/gpt-image-2.5-flare` | Faster, everyday version, good for quick previews |
| `google/gemini-3-pro-image` | Nano Banana Pro, strong at keeping reference objects consistent. Uses the chat-completions route |
| `bfl/flux-3-image` | Takes up to 10 reference images, and layouts can be given as **bounding boxes**, which we can generate from the id pass |

The model sits behind an `ImageRenderer` interface so it can be swapped per render.

## 9. MCP tools

All tools take and return whole mm. Every tool that changes something returns `{ ok, changed, lint }`, with `includePlan?: boolean` to also return the floor-plan PNG. The server's instructions to the agent cover the coordinate conventions (§3), the "against" shortcut, the asset workflow (§5) and the advice to *lint, look at the plan, then iterate*.

| Area | Tool | Purpose |
|---|---|---|
| Rooms | `list_rooms`, `get_room` | Read the room and its features |
| | `set_room_shell` | Create or replace the room's measurements (any `ShellMeasurements` form) → solved corners, angles, leftover error, plan |
| | `apply_shell_changes` | Batch add, update and remove features; set skirting, finishes, ceiling height |
| | `add_room_photos` | Attach photos of the real room |
| Assets | `search_assets` | Search the library and custom assets by text, category and size limits |
| | `create_asset`, `update_asset` | Model built from parts → validation result + 4 preview images |
| | `preview_asset` | Re-render previews (choose which views) |
| | `add_asset_images` | URLs or base64, maximum 3, choose the primary one |
| Layouts | `list_layouts`, `get_layout` | Includes resolved placements + lint |
| | `create_layout` | New layout, or copy of an existing one (`fromLayoutId`) |
| | `apply_changes` | **Atomic** batch of `add` / `move` / `remove` / `set_notes` / `set_status` / `set_finishes` → lint |
| | `lint` | Run the linter on its own |
| Views | `render_plan` | Floor-plan SVG text + PNG |
| | `list_cameras`, `set_camera` | Named camera positions |
| | `render_view` | Clay (and optionally id/depth) PNG from a camera |
| | `render_photoreal` | Full pipeline in §8 → image + render id. Can take 30–90 seconds |
| | `list_renders` | Render history for a layout |

## 10. Milestones

**M0 — Test the realistic render (do first, ~1 day).** Set up the Next.js + R3F app. Hard-code a rough JSON version of the living room with 4–6 items built from parts. Add the clay and id render page and the Playwright screenshot script. Write `scripts/render-spike.ts`, which runs the clay render + product photos through the 4 models with 2–3 prompt variants (with and without the id pass, and with different numbers of reference photos). It writes a side-by-side comparison page.
*Passes if:* positions and proportions are kept, the products are recognisable, doors and windows are kept, and the lighting is believable.
*Needed from Patrick:* rough room size, where the doors and windows are, 3–5 product links, and a photo of the room.

**M1 — Room shell.** Convex schema and storage; the measurement solver with its leftover-error and angle report; feature model; `planSvg`; MCP: `set_room_shell`, `apply_shell_changes`, `get_room`, `render_plan`. Measure the real living room.
*Passes if:* the plan matches the real room to within about 20mm.

**M2 — Assets.** Part shapes → three.js geometry; validation; `preview_asset` via Playwright; reference photos; starter library.
*Passes if:* Claude turns a product link into a believable model in 3 rounds or fewer.

**M3 — Layouts + linter.** Placements, the "against" shortcut, `apply_changes`, layout copies, all lint rules in §7.
*Passes if:* Claude produces 3 different candidate layouts with zero errors, and every warning it accepts is explained.

**M4 — Viewer + cameras.** Browser 3D viewer with live updates, plan view, lint panel, layout switching; saved cameras; `render_view`.

**M5 — Realistic renders in the app.** The §8 pipeline using what M0 showed works best; a gallery of renders for each layout.

**M6 — Stretch: dragging in the UI.** Drag along the floor, rotate with snapping to 15° and to walls, live lint while dragging.

## 11. Out of scope for v1

- Building rooms from photos or LiDAR scans.
- Accounts, multiple users, deployment and a public asset library beyond the starter set.
- Kitchens and fitted furniture, sloped ceilings, walls that lean, multiple rooms or whole houses.
- Textures on models, collision checks against exact mesh shapes, and uploading 3D model files (the schema allows `glb`, but it isn't built yet).

## 12. Open questions (answered 2026-10-11)

1. Will the id-pass colours leak into the output (e.g. a magenta sofa)? → Probably fine; we test it end-to-end ourselves with cheap low-quality renders and iterate on the prompt.
2. Should realistic renders be able to start from a **real photo** of the room? → Later, not v1.
3. Where do paint colour and flooring live? → Room-level solid wall colour and solid floor for v1 (layouts may override). Per-wall finishes come later, so the schema must leave room for them.
4. Do wall-mounted items need their own placement shortcut in v1? → Yes: TVs, shelves and art get first-class wall-relative placement (`onWall`).

See [2026-10-11-v1-architecture.md](2026-10-11-v1-architecture.md) for how v1 is built.
