# Dogfood run: Castlery "dining, storage & lighting" assets via MCP (2026-10-11)

An agent built 16 Roomer assets for Castlery UK products, using only the `pnpm mcp` CLI against the running
MCP server. The source data was `seed/castlery/products.json`. No layouts were created and nothing was deleted.

Method: the agent generated each parts blockout with a small local Python script, kept in the session
scratchpad and not in the repo. That script built stadium, superellipse and rounded-rect outlines and
tangent-oriented tambour slats, and checked the bounding box locally. The agent then called
`create_asset`, read the four previews next to the downloaded Castlery cutouts and fixed problems with
`update_asset`. All assets use `source: custom`, `product.retailer: Castlery`, `currency: GBP`,
`dimsSource: listing` and up to 3 cutout photos. The primary photo is the 3/4 "angle" cutout where one
exists; otherwise it is the front cutout.

## Assets created

"Calls" counts the create plus each update (`1` = accepted as created). Every final bounding box is
within ±10mm of the listed dims and centred.

| Key | Dims W×D×H (mm) | Parts | Calls | Notes |
|---|---|---|---|---|
| `castlery-harper-dining-table-180-chestnut-oak` | 1800×950×760 | 77 | 1 | Stadium top (30mm slab + 18mm inset bevel). Single stadium pedestal ~1000×420 with a dark core, 72 tangent slats, plinth and cap. |
| `castlery-harper-dining-table-220-chestnut-oak` | 2200×1050×760 | 96 | 1 | Stadium top on two Ø480 tambour drums at x=±490 (500mm gap). Biggest payload (16KB). |
| `castlery-harper-round-dining-table-120-chestnut` | 1200×1200×760 | 54 | 2 | Lathe top with an underside bevel and a Ø550 tambour drum. Round 2 made the slats denser (pitch 46→34mm) because the gaps read as an open cage. |
| `castlery-vincent-dining-table-180-oak` | 1800×900×760 | 6 | 2 | Superellipse (n=5) top with soft, slightly convex sides plus a bevel layer. 4 tapered round legs splayed ~4°/3° (tops ±668/±262, feet ±718/±300). Round 2 made the legs thicker. |
| `castlery-anya-dining-chair-chestnut` | 510×540×820 | 10 | 2 | Square legs, rails, flat seat panel. The backrest is an extruded front profile with rounded top corners and an arched lower edge. Round 2: the backrest is now full-width and caps the rear posts, as in the photo. |
| `castlery-austen-dining-chair-walnut` | 560×570×765 | 8 | 2 | Tapered round legs, a trapezoid paper-cord seat (light) and a bentwood back rail extruded as an arc band. Round 2 fixed the side stretchers, which were angled outward (my sign error). |
| `castlery-vincent-dining-chair-oak-creamy-white` | 487×595×820 | 11 | 1 (+1 rejected) | Raked rear legs and posts, an upholstered pad (light) and a curved plank back (arc band). The first create was rejected because tilted legs went 1mm below the floor. |
| `castlery-nico-dining-bench-150` | 1500×400×450 | 5 | 2 | Pebble top (extruded rounded rect, r90) on 4 slab legs, a front and a back leg at each end. Round 2: the legs changed from `roundedBox` (pill-shaped) to rounded-plan extrusions with flat ends. |
| `castlery-harper-curved-sideboard-chestnut` | 1800×500×800 | 92 | 1 | Superellipse plan (px≈6, pz=2), so the ends are fully round and the front gently curved. It has a dark carcass, 80+ tangent slats (none on the flat back), a top and base panel, 2 brass bar handles and 5 brass legs (4 corners plus a centre-back leg, per photo). The body is shifted 5mm back so the handles fit in d=500. |
| `castlery-ashen-wood-sideboard-180` | 1800×480×780 | 22 | 2 | Top, carcass, 4 full-height round corner posts, a bottom rail, a centre leg, and 4 doors, each with a vertical batten and a horizontal rail. Round 2: battens all sit ~64% across each door as photographed (I had mirrored them), and light side panels were added because the open sides read as a hollow frame. |
| `castlery-harper-small-sideboard-with-shelving-unit-chestnut` | 1400×500×1970 | 89 | 1 | The same tambour cabinet at 1400 wide on 4 brass legs. The hutch sits flush to the back (z −40): 4 posts at x=±455, base rails, a bottom tray and 3 stadium shelves 1330×380 that cantilever past the frames. |
| `castlery-posey-shelving-unit-natural` | 1600×400×1800 | 15 | 2 | 5 stadium shelves 26mm thick at ~444mm pitch. The levels follow the photo, not geometryNotes: levels 1 and 3 have outer supports at ±560 plus a centre back panel, and levels 2 and 4 have outer supports at ±475. Round 2: the supports changed from pillow-like `roundedBox` to rounded-plan extrusions. |
| `castlery-nico-console-table` | 1200×380×820 | 4 | 2 | Pebble top with 3 slab legs: the end legs (x=±450) sit forward and the wider centre leg is set back, per the lifestyle photo. Round 2 made the same legs fix as the bench. Clearance front 300 is my addition. |
| `castlery-blair-large-pendant` | 610×610×**940** | 7 | 3 | Mount `ceiling`. h=940 instead of the listed 2293mm max drop: ~450mm shade + ~490mm cord and canopy, so from a 2450mm ceiling the shade bottom is ~1510mm, ~750mm above a 760mm table. The description says so. Round 2 reversed both flared bands (they flare outward, away from the middle drum). Round 3 made the 4 shade tiers thin-walled lathe rings, because solid cylinders read as a lidded cone. |
| `castlery-faro-table-lamp` | 350×350×530 | 3 | 2 | Mount `floor`, not "surface", which Roomer doesn't have; it needs an elevation when placed. The base is a lathe: dome foot, bicone, ball, bicone. The shade is a coolie frustum (r175→65, 196mm tall). Round 2 turned the middle bicone into a ball. |
| `castlery-faro-round-wall-mirror` | 750×50×750 | 32 | 1 | Mount `wall`, d=50 off the wall. Backing disc, dark glass disc (r285) and 30 domed "bobble" beads (lathe rotated 90° about x). |

Clearances: chairs back 350, bench back 300, all three sideboards front 500. The tables have none, since
chairs carry the pull-out space. Posey has front 400 and the console front 300; both are my additions.
The lighting and the mirror have none.

## Friction log (ordered by impact)

1. **Product photos never come back next to the previews** (`create_asset`, `update_asset`,
   `preview_asset`).
   - The tool text and the guide both say "compare the returned previews with the product photos". The
     response returns only the 4 clay PNGs; the photos are stored as `http://127.0.0.1:3210/api/storage/…`
     URLs and are not returned as images.
   - To compare, I curled all 48 Cloudinary images and converted and downscaled them with `sips`. Several
     `f_auto` ".jpg" files were really PNGs. I then `Read` them separately, costing 1–3 extra tool calls per
     asset.
   - **Suggest:** return the primary photo as an extra image, or a contact sheet (photo | front | iso),
     e.g. `includePhotos: true`, on by default for create.

2. **No dry run and no delete, so conventions get probed on real, shared assets.**
   - `preview_asset` only takes a saved key, and no `delete_asset` exists. I couldn't build a throwaway
     shape to learn the rotation sign or extrude orientation without permanently polluting a library that
     another agent was writing to at the same time.
   - My first tambour table and the Austen chair became the probes. Austen was saved with its stretchers
     angled the wrong way until round 2.
   - **Suggest:** `create_asset {dryRun: true}` or `preview_asset {spec}` (validate and render, no save),
     plus `delete_asset` for custom assets no layout uses.

3. **Geometry frame conventions are undocumented; I inferred them from previews and library parts.**
   - Rotation handedness: the description gives only "X→Y→Z". I learned from the tambour front view that
     `[0,θ,0]` maps local +z to (sin θ, 0, cos θ) (right-handed, three.js), and that +z rotation sends +y
     toward −x (splayed legs).
   - Extrude: for `axis: y`, v maps to +z (front). I confirmed this only from the Austen top preview.
     Undocumented: whether the profile must be closed or CCW, and that `depth` is centred on `position`.
     The old schema said "relative to position / centred"; the new prose dropped it (see item 13).
   - Lathe: undocumented whether the profile must start and end at radius 0 to be capped. A closed quad
     produced a hollow ring, which was what I wanted for the pendant.
   - Mount frames: for `ceiling` items, y=0 is the bottom and y=h touches the ceiling. I learned that only
     by reading `generic-pendant-lamp` parts. For `wall` items, z is centred (back face at −d/2); I learned
     that from `generic-wall-tv`.
   - **Suggest:** 4 short lines in the `create_asset` description, plus a small axis triad and a
     "FRONT" marker on the previews.

4. **Repetitive features need a script: no pattern/array part and no rounded-plan shorthands.**
   - Tambour cost 54–96 individually placed and rotated boxes per asset: Harper 220 has 96 parts and a
     16KB payload; the Harper sideboards have ~90 parts and ~19KB.
   - Stadium tops, superellipse sideboard plans and rounded-rect slab legs are all hand-generated
     polygons. An agent without a code sandbox could not produce these.
   - A tambour unit with slats on all four sides would approach the 200-part cap.
   - **Suggest:**
     - A `pattern` part, e.g. `{part, along: "circle"|"outline"|"line", pitch|count, orient: "tangent"}`.
     - Plan shorthands for `extrude`, e.g. `{plan: "stadium"|"roundedRect"|"ellipse"|"superellipse", w, d, r}`.
     - Or a `surface: "tambour"|"fluted"` part flag that the clay pass renders as grooves.

5. **`roundedBox` rounds all 12 edges.**
   - Slab legs (Nico console, Nico bench) and the Posey supports came out as pills or pillows with rounded
     feet.
   - I had to rebuild them as `extrude` of a rounded-rect polygon: a second round for 3 assets.
   - **Suggest:** `roundedBox.edges: "all" | "vertical" | "horizontal"`.

6. **`search_assets` only matches name words, OR-style, so de-duplication is guesswork.**
   - `{"query":"Castlery"}` and `{"query":"castlery"}` returned "No assets match" while 30+ assets had
     retailer Castlery and `castlery-…` keys. `{"query":"tambour"}` also returned no match, though several
     assets are tagged `tambour`.
   - `{"query":"castlery-nico-console-table"}` returned 15 results (every table), presumably because any
     word matched.
   - A differently named twin (e.g. "Harper Sideboard" vs "Harper Curved Sideboard") would slip through.
   - **Suggest:** also search key, tags, retailer and `product.url` (an exact URL hit is a definitive
     duplicate), rank all-words matches first, and add a `productUrl` filter.

7. **The CLI truncates piped output.**
   - `pnpm -s mcp --list --json | python3 -c 'json.load(sys.stdin)'` failed with
     `JSONDecodeError: Unterminated string … (char 65446)`. Redirecting the same command to a file gave the
     full 269,320 bytes.
   - Cause: `apps/web/scripts/mcp-call.ts:112` calls `(code) => process.exit(code)`, which exits before
     stdout drains to a pipe.
   - It's latent since 2e9a79e (the listing is now 41KB), but `get_asset {includeParts:true} --json` for
     the Harper 220 is already 58KB.
   - **Suggest:** `process.exitCode = code` instead of `process.exit`.

8. **Floor contact has zero tolerance below y=0 but accepts gaps above it.**
   - `create_asset` (Vincent chair) was rejected with: `Part 'rear left leg' goes 1mm below the floor (its
     bottom is at y -1). Nothing may go below y 0 — raise it by 1mm.` (×2).
   - The lowest rim of a tilted, tapered cylinder is fiddly to compute by hand, yet the Vincent table at
     y 1…760 was accepted.
   - The message itself is excellent.
   - **Suggest:** auto-snap ≤3mm and report it ("raised 1mm to the floor"), or add `autoFloor: true`.

9. **No mount for items that stand on furniture.**
   - The research file says Faro is "surface"; Roomer only has floor, floor-covering, wall and ceiling, so
     it became `floor`.
   - At placement it needs `elevation`. That field exists on `at`, `against` and `centerOn` in the
     `apply_changes` schema, but the tool description mentions it only for `onWall`.
   - There's no "on top of placement X" helper, so the agent must look up the host's height itself.
   - **Suggest:** `mount: "surface"` plus a position mode `{mode: "onTopOf", placement, dx?, dz?}`, and
     lint that accepts a lamp overlapping its host in plan.

10. **Ceiling items with an adjustable drop don't fit the asset model.**
    - Blair's listing h (2293) is the maximum cord drop. The asset bakes in a 940mm drop tuned for one
      ceiling height, yet `dimsSource` is a single enum, so `get_asset` still prints "(dims from listing)".
    - The hang-height rationale had to go in `description`, which is the photoreal prompt, so the image
      model now reads about cords and ceilings.
    - **Suggest:**
      - per-axis provenance or a `listedDims` field;
      - a `notes` field that isn't sent to the renderer;
      - a per-placement `drop`/`cordLength` for ceiling mounts, with the cord drawn up to the ceiling.

11. **Tone has 3 levels and there's no material hint.**
    - Brass legs and handles, chestnut wood, the cream shade and the jute weave all render as similar
      beige-brown clay; "light" brass looks the same as "light" upholstery.
    - The mirror glass had to be `dark` to read.
    - **Suggest:** an optional per-part
      `material: wood|metal|fabric|glass|stone|woven|ceramic`, passed to the id/photoreal pass. Keep
      `tone` for shading.

12. **Preview files aren't named by asset or view.**
    - Files look like `.roomer-out/mcp/20261011-212846-create_asset-1.png`.
    - When creating 2–4 assets in one shell loop, I had to map timestamps back to assets and rely on the
      "1 front, 2 side, 3 top, 4 iso" order.
    - **Suggest:** `<key>-<view>.png`, or print `[front] …` next to each path.

13. **Tool schemas changed mid-run.**
    - Commit `2e9a79e perf(web): cut MCP tool listings…` landed during the session. `create_asset`'s
      inputSchema went from a full per-shape `oneOf` (12KB) to `{shape: enum, additionalProperties}` with
      the fields described in prose. Payloads I had already built still validated.
    - The new prose drops two facts: extrude/lathe `profile` is *relative to `position`*, and extrude
      `depth` is *centred on `position`*. Both are needed to place a part.
    - **Suggest:** restore them as one line each.

14. **The top preview is low-value for tables and cabinets.**
    - It shows only the top surface; pedestal footprint, leg splay, stretcher angles and backrest curve
      are invisible (the Austen stretcher bug was visible only in iso).
    - **Suggest:** an optional `below` (underside) view or an x-ray/section top view.

15. **Minor issues.**
    - `product` has a single `price`; Blair's £209 sale vs £299 list can't be expressed.
    - There is no bench or seating category, so the bench is filed as `chair`.
    - Lathe bounding boxes come back a few mm under nominal because of tessellation (mirror: "746W …
      differs in w (allowed ±10mm)").
    - No guidance on whether a dining table should carry clearance itself or leave it to the chairs.

What worked well:
- `create_asset` and `update_asset` are fast, ~2s including 4 renders and the photo download.
- The bounding-box line (`x -600…600, y 0…760, z -600…600; matches the listed dims` / `differs in d
  (allowed ±10mm)`) is exactly what you need.
- Validation errors name the part, the amount and the fix.
- `update_asset` with only `geometry` keeps everything else intact.
