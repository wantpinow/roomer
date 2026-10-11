# Dogfood: building the lounge asset set through MCP (2026-10-11)

An agent built the Castlery UK lounge set (sofas, armchairs, footstool, coffee and side tables, TV
stands, rugs, floor lamp) plus a generic TV, using only `pnpm mcp` against the running dev
server. Source data: `seed/castlery/products.json`. No layouts were created or touched, and
nothing was deleted.

**Result:** 20 assets created and 1 updated (`castlery-mori-coffee-table-natural`). One requested
asset was not created: the wall-mounted 65" TV (`generic-tv-65`), because the library already
has `generic-wall-tv` at 1450×40×840. Every bounding box matched the listing within ±10mm on the
first try. Of the 21 assets, 15 were accepted from the first previews, 5 took one
`update_asset` round and 1 (Avery) took two.

Method: the parts lists came from small Python generators (in the agent's scratchpad; nothing
added to the repo). The agent compared each asset's front, side, top and iso previews with the
Castlery cutouts (front and 3/4).

## Assets

Dims are W × D × H in mm, exactly as listed. "Rounds" counts the `update_asset` calls after
`create_asset`. Clearance is the front clearance unless stated otherwise. Photos are the cutouts
attached through `imageUrls` (primary first).

| Key | Dims | Parts | Rounds | Clearance | Photos | Notes |
|---|---|---|---|---|---|---|
| `castlery-auburn-chaise-sofa-left-facing-chalk-boucle` | 3095 × 1660 × 765 | 18 | 0 | 450 | 2 | L-shape with the chaise on local −x, which is the viewer's left from the front (checked in the top preview). Puffy rounded-box seat blocks, 3 back cushions, a rolled right arm that rises into the back, a short rolled return behind the chaise and hidden glides. |
| `castlery-auburn-chaise-sofa-right-facing-chalk-boucle` | 3095 × 1660 × 765 | 18 | 0 | 450 | 2 | Exact x-mirror of the left-facing model. Part names swap left and right. |
| `castlery-auburn-3-seater-sofa-chalk-boucle` | 2310 × 915 × 765 | 12 | 1 | 450 | 2 | Round 1: the arms were first a sloped side-profile `extrude`. Its hard flat sides read as slabs, not boucle, so each arm became two rounded boxes (a front roll at 560 and a rear rise into the back at 765). |
| `castlery-auburn-footstool-chalk-boucle` | 910 × 665 × 415 | 5 | 0 | none | 2 | One rounded block (radius 100) on 4 glides. Matched the photo straight away. |
| `castlery-owen-ii-3-seater-sofa-cream-blonde-oak` | 2050 × 995 × 790 | 19 | 1 | 450 | 2 | Oak base: 4 legs, perimeter rail and a centre support. Thin track arms, back frame, 2 + 2 loose cushions and 2 lumbar pillows. Round 1: seat cushions went from 140 to 170 thick to match the photo's plumpness. |
| `castlery-madison-2-seater-sofa-bisque` | 1730 × 970 × 870 | 13 | 1 | 450 | 2 | Tapered walnut legs, square track arms, a bench seat, 2 back cushions and front-to-back bolsters against the arms. Round 1: the bench cushion went from 100 to 130 thick. Tufting not modelled. |
| `castlery-wayne-armchair-opal-beige` | 860 × 890 × 850 | 26 | 0 | 450 | 2 | Walnut tray seat frame on 4 black legs. The U-shaped arm-and-back rail is an `extrude` (axis y, plan outline) with 5 + 5 + 6 spindles and front posts. Loose seat cushion, plus a back cushion reclined 10°. |
| `castlery-arlo-armchair-sand` | 760 × 920 × 775 | 13 | 1 | 450 | 2 | Tube frame (cylinders with sphere bends) with a back post rising above the arm, a rear stretcher, a plump seat and a reclined back pad. Round 1: the frame went from radius 36 to 40 and from tone mid to dark, because chestnut was indistinguishable from the sand upholstery in clay. |
| `castlery-avery-swivel-armchair-ginger-boucle` | 805 × 805 × 750 | 55 | 2 | 450 | 2 | Barrel tub: C-shaped wall, round lathe seat drum, recessed plinth and lumbar pillow. Round 1: a two-tier wall read as terraces, so it became 11 angular slices whose height eases from 750 at the back to 610 at the arms. Round 2: a chain of 41 spheres along the top edge to give the rolled boucle rim. The rim now reads correctly from the front; ribbing is visible close up. |
| `castlery-albie-travertine-round-coffee-table-90` | 984 × 984 × 355 | 5 | 0 | none | 2 | Ø900 × 30 top on 4 Ø150 legs centred on the rim. The legs sit on the axes, because only that orientation gives the listed 984 overall width. |
| `castlery-harper-marble-rectangular-coffee-table-chestnut` | 1200 × 600 × 380 | 4 | 0 | none | 2 | Stadium marble top (`extrude`) on an oak lip, with 2 Ø330 drum pedestals at ±270. Tambour slats not modelled. |
| `castlery-mori-coffee-table-natural` (updated) | 1200 × 600 × 313 | 7 | 1 update | front/back 400 (kept) | 2 (kept) | Already existed, so it was updated, not duplicated. Changes: slab legs from ±340 to ±385 (per the photo); lap-joint marks moved from the centre of the top to the front and back edges (where the photo shows them); description, product (now with `currency: GBP`) and tags brought in line with the rest. The existing clearance was kept; see friction item 7. |
| `castlery-harper-marble-side-table-chestnut` | 400 × 400 × 550 | 3 | 0 | none | 1 | Drum on a recessed base, with a marble disc top. Only one cutout exists; the other images are lifestyle shots. |
| `castlery-mori-c-side-table-natural` | 500 × 350 × 490 | 10 | 0 | none | 2 | C-shape: top slab, base plate, 2 posts on the back edge (open side = front), lap-joint marks and glides. |
| `castlery-harper-tv-stand-150-chestnut` | 1500 × 500 × 660 | 9 | 0 | 600 | 2 | Pill-shaped plan with a front that is concave by 35mm (`extrude`, axis y) for the top, body and base. 4 brass legs and 2 bar handles in tone light. |
| `castlery-nico-tv-stand-150` | 1500 × 450 × 600 | 7 | 0 | 600 | 2 | Rounded-box body, 2 flush doors, a dark open niche over a drawer, and 2 rounded slab sled legs. |
| `castlery-cora-wool-rug-caramel-229x274` | 2290 × 2740 × 18 | 1 | 0 | none | 1 | Flat rounded slab. The listing has only one cutout (top). |
| `castlery-jana-jute-rug-229x274` | 2290 × 2740 × 5 | 1 | 0 | none | 1 | As Cora. Because positions must be integers, a 5mm slab can't sit exactly on y = 0 (friction item 12). |
| `castlery-inez-wool-rug-beige-153x244` | 1530 × 2440 × 25 | 1 | 0 | none | 1 | As Cora. |
| `castlery-faro-sculptural-floor-lamp` | 485 × 485 × 1690 | 2 | 0 | none | 2 | One `lathe` for the drum base and the stacked bead-and-bicone column, plus a cone `cylinder` shade. The best match in the set. |
| `generic-tv-65-stand` | 1450 × 250 × 900 | 4 | 0 | none | 0 | 65" panel (1450 × 840 × 30, bottom at 60mm), rear housing and pedestal foot, all tone dark. No product photo. |
| `generic-tv-65` (wall) | — | — | — | — | — | **Not created.** `search_assets` found library `generic-wall-tv` ("Generic 65in TV", 1450 × 40 × 840, wall), so it was reused, not duplicated. It is a single box with no previews. The library asset was left untouched, because changing it would make the database differ from the shipped seed. |

## Friction log

Ordered by how much each slowed the work down.

### 1. Comparing previews with product photos needs downloads outside MCP (every asset)

The core loop step is "compare the returned previews with the product photos", but MCP only ever
returns the previews as images. The photos are only reachable as URLs:

- `create_asset` prints `Photos: - stored https://res.cloudinary.com/...` (the source URL, not
  the stored copy).
- `get_asset` lists `1. [primary] http://127.0.0.1:3210/api/storage/<uuid> (from https://…)`.

To see the photo, the agent had to scrape those URLs out of the text, `curl` them, and convert the
WebP files with `sips` before the image viewer could read them. For the first assets it downloaded
straight from Castlery's CDN instead. A bash helper was needed for every asset.

**Suggestion:** `get_asset { includePhotos: true }` should return the stored product photos as
image content (PNG/JPEG), the same way `includePreviews` does. Better still, `create_asset` and
`update_asset` could return one comparison image: the primary photo next to the iso preview, or
the photo next to the front and iso previews.

### 2. No soft or curved primitives, so boucle and barrel shapes take many parts (about 40% of build time)

- `extrude` has hard edges and no bevel. The Auburn arm was first built as a nicely sloped
  side-profile `extrude` (`axis: "x"`), but in the iso preview it read as a flat slab with sharp
  edges, which is wrong for puffy boucle. It was rebuilt from two `roundedBox`es.
- A rotated `roundedBox` would give the slope, but rotation makes the bounding box hard to predict.
  For example, a 13° tilt on a 900-deep arm pushes its corners about 50mm outside `dims.d`.
- The Avery barrel chair (a C-shaped wall that tapers in height, with a rolled top) needed 11
  angular `extrude` slices and **41 spheres** along the rim: 55 parts for an armchair. The first
  attempt (2 tiers) looked like a staircase.

**Suggestions:**

- `extrude.bevel` / `radius`: round the cap edges.
- Partial `lathe` (`angle` / `startAngle`): tub chairs, curved sofas, arcs.
- A `tube` / `sweep` primitive (a circle swept along a polyline, optionally with radii): bent tube
  frames like the Arlo chair, rolled rims and rails.
- `capsule`.

### 3. Rotation order and extrude axis mapping had to be verified by experiment

The schema says rotation is *"applied in X → Y → Z order"*. That doesn't say whether the order is
intrinsic or extrinsic, or whether it matches three.js `Euler('XYZ')`, which applies Z first to
the vector. Extrude says *"y → (x, z) plan outline; x → (z, y) side profile"* but not the sign. In
three.js, `ExtrudeGeometry` plus a −90° X rotation often flips v → −z.

The agent checked both with real assets: the extrude in the Auburn 3-seater (`axis: "x"`, the arm
should be high at the back) and the Avery C-wall (`axis: "y"`, it must open to the front). Both
mappings turned out to be u/v → **+z**, so the docs are right, just under-specified. Because of
the rotation ambiguity, the agent avoided compound rotations entirely: spheres instead of rotated
cylinders for the Avery rim, and only single-axis rotations elsewhere.

**Suggestion:** spell out, for example, *"axis y: u = +x (right), v = +z (front)"* and *"rotation
= three.js Euler XYZ: the vector is rotated about Z, then Y, then X"* (or whichever is true). Give
one example rotation that makes a cylinder horizontal along x, and one that makes it horizontal
along z.

### 4. No `delete_asset`, so nothing can be tried without leaving junk behind

Experiments would have been cheap: one test asset to settle the extrude and rotation conventions
(item 3). But anything created is permanent for the agent. This pushed the agent to test
conventions on real assets and to avoid trial creates.

**Suggestion:** a `delete_asset` that refuses when a layout uses the asset (or archives it). Or a
`dryRun: true` / `preview_parts` tool that validates and renders a parts list without saving it.
The latter is the better fit for the "build → look → fix" loop.

### 5. `pnpm mcp --list --json | …` is cut off at 64 KB when piped

`pnpm -s mcp --list --json | python3 -c 'json.load(sys.stdin)'` failed with `JSONDecodeError:
Unterminated string starting at: line 1784 column 37 (char 65446)`. The full output (269 KB)
arrived only when redirected to a file. This looks like `process.exit()` running before stdout
drains to the pipe. It will hit any agent that pipes tool output, including long `get_asset
includeParts` or `get_layout` output.

**Suggestion:** let stdout drain before exiting (set `process.exitCode` instead of calling
`process.exit()`, or wait for the `write` callback).

### 6. Tones `light` and `mid` barely differ in the clay previews

On the Owen sofa, the blonde-oak base (`mid`) and the cream upholstery (`light`) are almost
indistinguishable in all four previews. The Arlo chestnut frame needed `dark` before it separated
from the seat. Because of this, it is hard to check from the previews that parts were tagged as
the right material.

**Suggestion:** widen the clay value range between light and mid, or add an optional fifth
preview that colours by tone (or by part) in flat false colours.

### 7. How clearances interact is undocumented (coffee tables especially)

The task asked for 450mm front legroom on sofas. The agent guide says *"600mm between a sofa and
coffee table edge is too much, 350–450mm is right"*. If a coffee table can't sit inside the
sofa's clearance zone, the 450 legroom rules out everything under 450. The existing Mori asset
also carries `clearance: front 400, back 400`, while nothing says what a coffee table should
declare. The agent left the new coffee and side tables without clearance and kept Mori's as it
was, so the set is now inconsistent.

**Suggestion:** document in the guide or the `clearance` field description:

- whether other items may sit inside a clearance zone (and which ones, e.g. "tables may sit in a
  seat's legroom");
- recommended clearance values per category.

### 8. `update_asset` re-lints layouts but doesn't report the outcome

Updating the Mori coffee table returned only `Re-linting the 2 layouts that use it.` It doesn't
say whether the new geometry created errors or warnings in those layouts. The agent is told not
to touch layouts, so it can't easily tell whether its edit broke someone else's design.

**Suggestion:** list a lint delta per affected layout, e.g. `"Starter": no change; "Dining +
window lounge": +1 warning W1xx (…)`.

### 9. Preview filenames don't identify the asset, and parallel agents share one folder

Images go to `.roomer-out/mcp/20261011-212150-create_asset-1.png`. The name contains no asset
key. Another agent was creating dining assets at the same time in the same folder, so files from
two agents created in the same second could collide or be confused. The agent passed
`--out <own dir>/<asset>` on every call to work around this.

**Suggestion:** include the asset key and view in the name
(`…-castlery-auburn-3-seater-sofa-chalk-boucle-iso.png`), or a unique id.

### 10. `search_assets` can't find duplicates by product URL, SKU or tag

Duplicate checks rely on name words (e.g. `query: "mori"`). The same product can be named
differently by different agents ("Harper Dining Table 180cm, Chestnut" versus "Harper Dining
Table"), and variants share names (left- and right-facing chaise). Keys follow a convention, but
nothing enforces it.

**Suggestion:** `search_assets { productUrl }` (matching on path plus variant query), and a
`tag` filter. `create_asset` could also warn when another asset already has the same
`product.url`.

### 11. Four previews for a flat rug: two are wasted

For `floor-covering` items, the front and side previews are a 5–25mm line, which costs two images
per call for nothing.

**Suggestion:** return `top` and `iso` only for rugs, or tilt the "front" view.

### 12. Integer-only positions can't centre odd-sized parts

Every `position` must be an integer. A 5mm rug or a 665mm-deep footstool can't be centred
exactly: `position: [0, 2, 0]` with `size: [2290, 5, 2740]` really spans y −0.5 to 4.5, but the
response reported `y 0…5`. It's harmless at ±10mm tolerance, but the reported bounding box isn't
what was sent.

**Suggestion:** accept half-millimetre positions (or any numbers) and round only the reported
bounding box.

### 13. Mirrored variants must be rebuilt by hand

The right-facing chaise is an exact mirror of the left-facing one, but `create_asset` needs the
full parts list again. The agent mirrored it in its own script, including swapping left and right
in part names. `apply_changes` has `mirrored` for placements, but that doesn't help when the
variant needs its own product URL, photos and price.

**Suggestion:** `create_asset { fromAsset, mirror: "x" }` (or a general `fromAsset` plus
overrides), which would also cover size variants (TV stand 150/200, rugs in 3 sizes).

### 14. Smaller items

- **`@args.json` paths** resolve against the repo root or `apps/web`, not the caller's working
  directory. The error is clear (`Can't find args/auburn-3.json (looked in …/roomer/args/…,
  …/apps/web/args/…)`), but every call needs an absolute path. Suggestion: also try `$INIT_CWD`
  (pnpm sets it).
- **No `source` field:** the task said to create assets with `source "custom"`, but
  `create_asset` has no such field. `source` is implicit (and is a filter in `search_assets`). A
  sentence in the `create_asset` description would prevent the confusion.
- **`get_asset` lists photos as text only:** to tell which stored photo is the primary one, you
  have to match the `(from …)` URLs. That's fine, but it's another reason for item 1.

### What worked well (keep it)

- **Validation errors are excellent.** One deliberately broken create returned six precise,
  actionable problems, e.g. *"Nothing touches the floor: the lowest part, 'bad radius', starts at
  y 50 … move every part down by 50mm"* and *"the radius can be at most 50mm (half the smallest
  side)"*. Nothing was saved.
- **Every create and update reports the bounding box** (`x -1,155…1,156, y 0…766, z -457…458;
  … differs in w (allowed ±10mm)`), so silent dimension drift isn't possible.
- **Calls are fast:** about 2–5 s per create, including 4 renders and photo downloads.
- **The preview captions** (*"side (from the item's right) … top (plan; the item's front faces
  down the image)"*) made orientation checks unambiguous. The left-facing chaise convention in
  the guide matches Castlery's and was easy to verify in the top view.
