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
   `search_assets` first — search the product URL, the retailer or the name (it matches keys,
   tags, retailer, variant and URL too; an exact key or URL comes first).
   - Build a parts model (see **Building assets** below) and try it with
     `create_asset { dryRun: true }`: it validates and renders without saving anything — also
     the cheap way to settle a convention you're unsure of. Then `create_asset` for real, with
     `imageUrls` (the first is the primary photo, sent to the image model).
   - Look at the **comparison sheet** it returns (product photo(s) | clay front | clay iso) and
     the previews; fix proportions with `update_asset` (which also takes `dryRun`). Two or three
     rounds is plenty — a blockout, not a sculpture.
   - `delete_asset` removes your own test or duplicate assets (never library ones, and not
     while a layout places them — it lists those layouts).
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

## Building assets

- **Frame:** item-local mm; origin = centre of the footprint on the floor; **+z = front**, **+x =
  the item's right** as you face its front, +y = up. The parts' bounding box must equal `dims`
  (±10mm) and be centred on the origin; floor items touch y = 0 (a dip of up to 3mm below is
  only a warning). Positions are whole mm: centre odd sizes on the nearest mm.
- **Wall items** (`mount: "wall"`): the back face at z = −d/2 goes against the wall, the front
  (+z) faces the room. **Ceiling items:** y = 0 is the bottom and y = h touches the ceiling.
- **Rotation** `[rx, ry, rz]` degrees is three.js Euler "XYZ": the part turns about z, then y,
  then x (the item's fixed axes). Right-hand rule — a positive angle turns counter-clockwise
  when you look from the axis's positive end: `[0, 90, 0]` turns the part's front (+z) to face
  +x; `[90, 0, 0]` tips its top (+y) towards the front (a cylinder lying front-to-back);
  `[0, 0, 90]` tips its top towards −x (a cylinder lying across).
- **Angles round the vertical** (lathe and torus arcs): 0° = +z (front), increasing towards +x.
- **Shapes** (every part: `name`, `position` = its centre, `rotation?`, `tone?`):
  - `box`: `size [w, h, d]`.
  - `roundedBox`: `size`, `radius`; `edges: "vertical"` rounds only the 4 upright edges — a flat
    rounded-rectangle slab (radius = d/2 makes a stadium tabletop or a sled leg).
  - `cylinder`: `radiusTop`, `radiusBottom`, `height` along local y (a 0 radius makes a cone).
  - `sphere`: `radius`.
  - `capsule`: `radius`, `length` = the straight middle along local y; total height =
    length + 2 × radius (bolsters, rolled arms, rails).
  - `torus`: `radius` (to the tube's middle), `tube`, `arc?` — flat in the x–z plane; the arc
    starts at +z and sweeps towards +x, ends capped. A rim open at the front: `arc: 270` with
    `rotation [0, 45, 0]`.
  - `extrude`: `profile [[u, v], …]` (a closed outline relative to `position`, any winding, first
    point not repeated) pushed along `axis` by `depth`, centred on `position`. Axis y: u = +x,
    v = +z (a plan outline); axis x: u = +z, v = +y (a side profile); axis z: u = +x, v = +y (a
    front profile). `bevel?` rounds the edges round both end faces (soft cushions and arms)
    without changing the outer size.
  - `lathe`: `profile [[radius ≥ 0, y], …]` relative to `position` — an open line revolved round
    local y (start and end at radius 0 to close it; repeat the first point to revolve a closed
    outline into a ring). `arc? [start, length]` for part of a turn: `[45, 270]` is a C open at
    the front (a barrel chair's wall); the cut ends are capped.
  - `repeat` on any part: `{ count, step: [dx, dy, dz] }` makes `count` copies, copy i at
    position + i × step, named "<name> #i+1" (tambour slats, spindles, rails). At most 400 parts
    after repeats.
- `tone` (light/mid/dark) separates materials in the clay; use `dark` for wood or metal that
  must stand out from light upholstery.
- **Previews:** front, side (from the item's right), top (front faces down the image) and iso
  (3/4 from front-right); top and iso carry a marker showing x, front (+z) and y. With photos you
  also get the comparison sheet; `get_asset { includePhotos: true }` returns the photos.
- **Clearance** is free floor the item needs, checked by lint (W102): nothing else may stand in
  it. `clearance` puts strips along the bounding box's sides — seats: front 350–450 (the gap you
  want to the coffee table), storage: front 500–600, dining chairs: back 350; tables need none
  (their chairs carry it). For an L-shaped item use `clearanceZones`
  (`[{ name, rect: [minX, minZ, maxX, maxZ] }]`, item-local, beside the item): they replace
  `clearance`, e.g. legroom in front of a chaise sofa's seats only.
- **Elevation** when placing: the item's bottom above the floor. Floor items default to 0,
  ceiling items to ceiling height − h; wall items need `onWall` with an elevation. Anything
  standing on furniture (a table lamp on a sideboard) takes `elevation` = the host's height in
  `at`, `against` or `centerOn`.

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
