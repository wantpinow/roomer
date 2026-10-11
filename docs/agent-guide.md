# Roomer — guide for AI agents

Roomer stores rooms, furniture and candidate layouts, and checks layouts for physical mistakes.
You (the agent) do the designing through these tools; the human watches the result live in the
web UI. Treat Roomer as the source of truth and as a linter: make a change, read the lint report,
look at the plan, fix, repeat.

## Conventions (read once, they never change)

- **Units:** whole millimetres for every length; degrees for angles.
- **Plan frame:** looking down at the floor plan, **x points right**, **z points down the page**,
  y is height. Corner **C1 is at (0, 0)**. Corners C1…Cn go **clockwise** around the room.
  **Wall Wi runs from Ci to Ci+1** (the last wall returns to C1). Positions along a wall are
  measured from its start corner.
- **Facing** is a bearing: **0 = up the page, 90 = right, 180 = down, 270 = left.** An item's
  facing is the direction its front points (a sofa faces where you look when sitting on it).
- **Item size** `dims = { w, d, h }`: w = width across the front, d = depth front-to-back,
  h = height. An item's **left/right are as seen standing in front of it, facing it** (Castlery's
  "left-facing chaise" = chaise on the left as you look at the sofa).
- **Ids:** walls `W1…`, corners `C1…`, features `D1` (door), `WIN1` (window), `RAD1`
  (radiator), `OB1` (obstacle/pier), `S1` (socket), `L1` (pendant fitting)…; placements are
  lowercase slugs you choose (`sofa`, `dining-table`, `chair-1`).

## Workflow

1. `get_overview` → rooms and layouts. `get_room` → walls (with lengths and the direction they
   face), features, cameras, finishes. Use `render_plan` to see the room.
2. **Furniture from a product link:** read the page, extract W × D × H (convert cm → mm), a short
   visual description, and 1–3 clean product photos (white background, front or 3/4). Check
   `search_assets` first — it may already exist.
   - `create_asset` with a parts model: build it from boxes, rounded boxes, cylinders,
     extrusions and lathes in item-local mm (origin = centre of the footprint on the floor,
     +z = front, y up). The parts' bounding box must equal `dims` (±10mm) and be centred on the
     origin; floor items must touch the floor. Name parts, use `tone` (light/mid/dark) to
     separate e.g. cushions from legs.
   - Compare the returned previews (front/side/top/iso) with the product photos; fix with
     `update_asset`. Two or three rounds is plenty — a blockout, not a sculpture.
   - `add_asset_images` with the photo URLs (the first is the primary reference).
3. **Layouts:** `create_layout` (or fork an existing one with `fromLayoutId` to try a variation).
   `apply_changes` takes a batch of ops, applied in order and atomically:
   - `add` / `move` with a **position helper**:
     - `{ mode: "against", wall, at, anchor?, side?, gap? }` — stand it against a wall, clear of
       the skirting, facing into the room. `side: "left"|"right"` puts that side to the wall.
     - `{ mode: "onWall", wall, at, elevation }` — TVs, shelves, art, mirrors.
     - `{ mode: "centerOn", placement | feature, dx?, dz? }` — rug under the coffee table,
       pendant lamp at fitting L1.
     - `{ mode: "inCorner", corner, against? }` — tuck into a corner.
     - `{ mode: "at", x, z, facing? }` — absolute, when nothing else fits.
   - `nudge` (dx/dz/rotate), `swap` (replace the asset, keep position), `set`, `remove`.
   - Every response includes the **lint report**. Fix every **error** (E…). Address or
     consciously accept **warnings** (W…) and say why in the layout notes. Infos are hints.
4. Look at the result: `render_plan` (fast, precise) and `render_view` (clay 3D from a camera).
5. When a layout is good: `update_layout` with `status: "candidate"` and notes explaining the
   idea. Make 2–4 distinct candidates rather than one; the human compares them.
6. `render_photoreal` for the candidates the human wants to see (default model is precise but
   takes ~30–90s; use `quality: "low"` for quick looks).

## Design rules of thumb (UK homes)

- Walkways ≥ 700mm (900mm comfortable); 600mm between a sofa and coffee table edge is too much,
  350–450mm is right.
- Dining: ≥ 600mm table width per person; leave ≥ 900mm behind chairs to pull them out where
  people walk, ≥ 750mm against a wall.
- TV: viewing distance ≈ 1.2–2× the screen diagonal; centre at seated eye height (~1000–1100mm
  to the screen centre). Avoid TVs opposite the window (glare).
- Don't block radiators with sofas (heat) or doors' swing arcs; keep sockets reachable behind
  media units.
- Rugs: front legs of the sofa on the rug; ≥ 200mm of floor visible to the walls.
- Long narrow through-rooms work best as two zones (living + dining) with a clear path between
  the doors.
