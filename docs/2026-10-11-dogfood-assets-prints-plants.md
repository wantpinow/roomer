# Dogfood: Bauhaus-style prints and plants via MCP (2026-10-11)

The user asked for "assets for various prints (I like Bauhaus and similar) and also for plants of
various shapes and sizes". An agent built 22 assets (11 framed prints, 11 potted plants) using only
`pnpm mcp` against the running dev server. No layouts were touched and no existing assets were
changed. Source data: `seed/prints-plants/products.json`.

The "tools v2" features were live by build time: `dryRun`, comparison sheets, `capsule`, `torus`,
`repeat`, `extrude.bevel`, `lathe.arc`, `roundedBox.edges` and `delete_asset`. Nothing had to be
deleted, because every experiment was a `dryRun` (14 create dry runs and 5 update dry runs).

**Method.** A scratchpad Python generator built every parts list. It had its own three.js-XYZ
rotation and bounding-box code, so dims could be checked before each `dryRun`. Plant spreads and pot
sizes come from silhouette masks of the studio photos, scaled to the listed height. The final review
was each asset's comparison sheet (photo | clay front | clay iso), plus front and iso contact sheets.

## Sources

- **Prints.** Retail prints come from **Postery** (JSON-LD with per-size prices). Each is paired
  with Postery's own oak, black or white frame (profile 12 × 22mm, so the outer size is the poster
  size + 24mm).
  - The public-domain Bauhaus-era works come from **Wikimedia Commons**, as `upload.wikimedia.org`
    images of 1280px or less. Their price is the Postery frame only.
  - Posterlounge UK had the best Bauhaus range (Schmidt, Kandinsky, Moholy-Nagy, Schlemmer). After
    about 6 requests it returned 429, and then TLS resets on every host, including its image CDN.
    The Roomer server can't download from a host that blocks us, so Posterlounge wasn't used.
  - These retailers were unusable for curl: Desenio, Poster Store, King & McGaw, Juniqe and Etsy
    (403 or 429).
- **Plants.** All plants come from **Patch Plants** (JSON-LD variants, "Plant height (including
  pot)" and nursery pot size).
  - Each plant is paired with a warm Patch pot (terracotta, clay-washed, cream ribbed ceramic or a
    rope basket), and the price includes the pot.
  - The ZZ plant is Patch's real "ZZ plant & basket" bundle.
  - The cactus trio is a composite of three Patch products.
  - Beards & Daisies, Leaf Envy and Bloombox were blocked (429 or 403).

## Assets

"Parts" is the number of parts in the payload; the count after `repeat` is in brackets. "Rounds"
counts the `update_asset` calls after `create_asset`. Every bounding box matched `dims`. Plant dims
are the built model's dims: the height matches the listing range and the spread is measured from the
photos. `products.json` keeps both.

### Prints (mount `wall`, d = 22, tags include `print`, `bauhaus`)

| Key | Source | Dims W×D×H | Parts | Rounds |
|---|---|---|---|---|
| `print-bauhaus-ausstellung-1923-joost-schmidt` | Commons (PD) + Postery black 50×70 | 524×22×724 | 25 | 0 |
| `print-kandinsky-composition-viii-1923` | Commons (PD) + Postery oak 70×100, landscape | 1024×22×724 | 27 | 0 |
| `print-mondrian-composition-ii-red-blue-yellow-1930` | Commons (PD) + Postery white 50×50 | 524×22×524 | 17 | 0 |
| `print-klee-castle-and-sun-1928` | Commons (PD) + Postery oak 30×40, landscape | 424×22×324 | 27 (75) | 0 |
| `print-schlemmer-bauhaus-stairway-1932` | Commons (PD) + Postery black 70×100 | 724×22×1024 | 27 | 1 |
| `print-moholy-nagy-construction-a-ii-1924` | Commons (PD) + Postery white 40×50, landscape | 524×22×424 | 16 | 0 |
| `print-kandinsky-several-circles-1926` | Commons (PD) + Postery black 50×50 | 524×22×524 | 24 | 1 |
| `print-kandinsky-bauhaus-ausstellung-postcard-1923` | Commons (PD) + Postery oak 30×40 | 324×22×424 | 28 | 0 |
| `print-papiers-decoupes-orange-70x100` | Postery, £87.98 with white frame | 724×22×1024 | 18 | 1 |
| `print-golden-dusk-30x40` | Postery, £32.98 with black frame | 324×22×424 | 7 | 1 |
| `print-neutral-canvas-50x70` | Postery, £66.98 with oak frame | 524×22×724 | 12 | 0 |

Each print has 4 frame bars, a backing board, a passe-partout (4 strips round the window) or a poster
sheet, the artwork panel and 2–20 flat "motif" parts. The motifs are discs, bars, polygons and arcs
in light, mid or dark, roughing out the composition so that the clay views read as that artwork and
the right way up. All 4 update rounds fixed motifs:

- Schlemmer: the stairs read as a ray fan.
- Several Circles: the halo read as a bare ring.
- Papiers Découpés: a 7-point star became a seaweed cut-out.
- Golden Dusk: a "dark" band read as black.

### Plants (category `decor`, tags include `plant`, `patch`)

| Key | Patch product + pot | Dims W×D×H | Parts | Rounds |
|---|---|---|---|---|
| `plant-olive-tree-standard-160` | Olive 150–160cm + terracotta pot & saucer 30cm (£137) | 451×389×1594 | 85 | 1 |
| `plant-fiddle-leaf-fig-tree-160` | Fiddle-leaf fig tree 150–160cm + clay pot 38cm (£370) | 698×650×1580 | 47 | 0 |
| `plant-strelitzia-nicolai-170` | Strelitzia nicolai 160–170cm + terracotta egg pot 35cm (£210) | 956×742×1702 | 23 | 0 |
| `plant-kentia-palm-175` | Kentia 160–180cm + rope basket 29cm (£173) | 829×754×1806 | 46 | 0 |
| `plant-monstera-deliciosa-80` | Monstera 70–80cm + cream ribbed pot 24cm (£80) | 756×806×819 | 38 | 1 |
| `plant-rubber-plant-95` | Rubber plant 90–100cm + terracotta pot & saucer 30cm (£92) | 595×522×995 | 30 | 0 |
| `plant-snake-plant-laurentii-75` | Snake plant 70–80cm + terracotta pot & saucer 25cm (£82) | 483×429×798 | 20 | 0 |
| `plant-zz-plant-rope-basket` | "ZZ plant & basket" bundle, 40–50cm (£15) | 281×246×480 | 92 | 0 |
| `plant-satin-pothos-trailing` | Satin pothos 30–40cm + clay pot 16cm (£38) | 386×423×363 | 64 | 1 |
| `plant-cactus-succulent-trio` | Barrel cactus + Mammillaria + Haworthia in light clay pots (£23) | 320×90×136 | 20 | 0 |
| `plant-string-of-hearts-hanging` | String of hearts + clay hanging pot 16cm (£40), mount `ceiling` | 216×210×846 | 35 (129) | 0 |

**Mounts.**

- Tabletop plants (ZZ, pothos, cactus trio) are `floor` and need an `elevation` when placed.
- The hanging plant is `ceiling` with h = 846. With a 2450mm ceiling, its strands end about 1.6m
  above the floor, the pot sits at about 1.95–2.1m, and three straps run to a ring and a cord.
- No plant has a clearance.

**How each silhouette was built.**

- Olive: an airy crown of 75 small spheres on a bare trunk.
- Fig: about 40 violin-shaped `extrude` leaves along 4 branches.
- Strelitzia: a fan of paddle blades, some torn, on capsule petioles.
- Kentia: bare canes, then 3-segment arching fronds whose outline is a comb with gaps.
- Monstera: a mound of heart leaves with slits; the inner leaves rise and the outer ones droop.
- Snake plant: sword blades.
- ZZ: stems with paired leaflets.
- Pothos: a domed mound, with vines that drape down the pot.
- String of hearts: each strand is one `repeat`ed heart-leaf part (11 strands make about 95
  leaves).

**Searches.** `search_assets "bauhaus"` returns exactly the 11 prints, and `"plant"` the 11 plants.
`"kandinsky"`, `"palm"`, `"Postery"` and `"terracotta"` are also precise. An exact Patch URL ranks
its asset first.

## Friction log (ordered by impact)

### 1. Organic shapes: every leaf is a hand-made `extrude` plus a computed Euler rotation (about half of the build time)

- No shape fits a leaf. Each leaf was a closed outline (ellipse, fiddle, paddle, heart with slits,
  sword, pinnate comb) extruded 3–7mm deep. To aim it, the generator built an "along / facing" frame
  and converted it to three.js XYZ Euler angles.
- That needs vector maths that an agent without a code sandbox can't do for 40–90 leaves.
- Two bugs were the agent's own, and only the previews revealed them:
  - The "facing" hint became parallel to the leaf, so leaves turned edge-on (Monstera "parasol",
    pothos "saucer").
  - The heart lobes collapsed onto the midline, which made the outline self-intersecting.
- **Suggestions:**
  - Accept `orient: { along: [x,y,z], facing: [x,y,z] }` (or `lookAt`) on any part as an
    alternative to `rotation`.
  - Add a `leaf` shape: `outline: ellipse|heart|lance|paddle|fiddle|sword|frond`, length, width,
    `slits?`, `droop?`, plus along/facing vectors.
  - A `stem` given by two endpoints (`from`, `to`, radius) would remove the other half of the maths.

### 2. `repeat` is linear only

- Linear `repeat` was excellent where it fits: the hanging strands, and the Klee mosaic (27 parts
  became 75).
- Most plant and pot details are radial instead: leaves round a stem, Haworthia and ZZ rosettes,
  basket stitches, the ribs of the ribbed pot (left out), frond leaflets.
- **Suggestion:** a polar repeat, `repeat: { count, rotate: [0, θ, 0], about?: [x,y,z] }`, optionally
  with a scale or tilt step and a seeded jitter.

### 3. Prints: the photo can't be put on the canvas, so the agent hand-draws the composition in three tones

- The artwork panel is a grey box. To make the clay recognisable, and to catch upside-down or
  mirrored mistakes, the agent drew 2–20 motif parts per print. All 4 update rounds for prints were
  spent on these motifs.
- Three tones can't separate red from ochre (both mid), or a white mount from a cream poster (both
  light), so the passe-partout is invisible in the clay.
- **Suggestion:** a part flag such as `texture: "photo"` (primary photo mapped onto the front face,
  with a crop) for wall art and rugs. A framed print would then be about 7 parts and exact, and the
  id and photoreal passes would get the real image in the right place.

### 4. One primary photo can't describe "plant A in pot B"

- Patch sells the plant and the decorative pot separately. The studio photo of the right size often
  shows a different pot. For example, the olive's photo has a charcoal pot, but the asset has the
  terracotta pot the user prefers.
- The pot photo can only be photo 2, and only the primary photo reaches the image model, so the
  description and the photo disagree.
- **Suggestions:**
  - Photo roles (`imageUrls: [{url, role: "item"|"component"|"lifestyle", part?: "pot"}]`).
  - `product.components[]` for bundles and composites (pot, plant, frame, print). The cactus trio is
    3 products and the prints are poster + frame; prices were summed by hand into one `price`.

### 5. Plant dims are an output of the model, not an input

- For estimated items, `dims` had to be recomputed from the parts every time a leaf moved. The
  generator did this, and `update_asset` needed `{dims, geometry}` together.
- **Suggestion:** `dims: "fromGeometry"` when `dimsSource` is `estimated`, so the server sets dims
  from the bounding box and reports them.

### 6. Undocumented string limits

- `spec.description` is capped at 600 characters and `product.variant` at 200. Both were found only
  by rejection (the Schmidt description was 673; the cactus composite variant was over 200).
- The errors are clear, but the JSON Schema has no `maxLength`.
- **Suggestion:** add `maxLength` to the schema and say "≤ 600 chars" in the field descriptions.

### 7. No support surface and no overhang for tabletop and trailing plants

- Tabletop plants have to be `floor`, and nothing may go below y = 0.
- A trailing pothos on a shelf really hangs 30–60cm over the edge. The asset can only drape its vines
  down the pot and pool them on the surface.
- **Suggestions:**
  - `mount: "surface"` with an optional `overhang` budget, allowing parts below y = 0 in front of the
    footprint.
  - Lint that understands "sits on X" (dining report, item 9).
- The ceiling plant has the Blair pendant's problem (dining report, item 10): the cord length is baked
  into h.

### 8. Retailer bot protection shapes what can be used

This isn't Roomer's fault, but it decides which products are possible:

- Posterlounge had the ideal range. It served about 6 pages, then rate-limited, then reset TLS for
  the whole domain, including the image CDN that the Roomer server would download from.
- Wikimedia thumbnails exist only at standard widths. 960 and 1280 work; 640, 800 and 1024 return
  400.
- **Suggestion:** a line in the guide: "pace retailer requests (≥1.5s), prefer JSON-LD product
  pages, and use sites whose image CDN answers a plain `curl` with 200".

### 9. Minor issues

- `search_assets` with a full product URL ranks the asset first, but reports "30 assets": it falls
  back to any-word matching on tokens such as "products" and "plants". Return only the exact hit when
  one exists.
- `"hanging plant"` returns every plant, because every plant matches "plant".
- The previews have no "light" contrast against the light backdrop, so a white frame on a cream
  poster disappears in the front view (Papiers Découpés).

## What worked well (keep it)

- **`dryRun` changed the workflow.** Everything was tried before saving: 19 dry runs, no junk assets,
  and `delete_asset` was never needed. The lounge and dining runs both asked for this as their #2
  item.
- **The comparison sheet** (photo | clay front | clay iso) replaced every photo download and `sips`
  conversion from the earlier runs. Postery's lifestyle photos even showed the frame on a wall.
- **Precise rotation docs.** The agent's Euler conversion matched the documented examples on the
  first try.
- **Excellent validation.** The self-intersecting-outline message names the part and the fix.
  Bounding boxes come back to 0.1mm.
- **New shapes.** `capsule` (stems, canes, petioles, straps) and `torus` (the hanger ring) were used
  heavily. Linear `repeat` made the string-of-hearts strands cheap.
- **Preview files are named `<time>-<tool>-<key>-<view>.png`.** With `--out`, parallel work stayed
  unambiguous.
- **Fast.** Each create or update takes 2–3s, including renders and photo downloads, even for a 35KB
  ZZ payload with 92 parts.
