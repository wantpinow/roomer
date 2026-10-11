# Dogfood: remodelling the upholstered assets so they stop rendering as bubbles (2026-10-11)

The complaint: the Castlery couch models were so "bubble-y" that photoreal renders came out as
marshmallows rather than the real sofas. An agent remodelled them using only `pnpm -s mcp …`
(`get_asset`, `update_asset` with `dryRun`) against the running dev server. No layouts were
touched and nothing was created or deleted. The only repo files changed are this report and a new
"Modelling upholstery" block in `docs/agent-guide.md`.

**Result:** 7 assets remodelled and 2 audited and left as they were. Every bounding box is within
±10mm of the listing and centred. Each changed asset kept its product, images, tags and
clearance, and got a rewritten `description` that names its silhouette in plain shape words
(flat-topped, rolled arm, recessed plinth) and avoids "puffy", "plump" and "cloud".

Method: the parts came from small Python generators in the scratchpad. They handle the profile
fillet maths, the cushion placement and the rotations. Before each server round-trip, a local
check ran core's own `bevelProblem` and `assetLocalBounds` (through `tsx`). The agent then looked
at the comparison sheet from each dry run and at the final one.

Image paths below are in the session scratchpad
`/private/tmp/claude-501/-Users-wantpinow-Documents-repos-roomer/ee6eb7e6-9beb-41e6-bceb-10c71f8ca47f/scratchpad/dogfood/sofas/`
(written `…/` below):

- `final/<key>-comparison.png`: the final sheet returned by the real `update_asset`.
- `final/<key>-before-after.png`: product photo, old clay iso and new clay iso, side by side.
- `before/<key>-{front,iso,side}.png`: the old previews.

## What made them bubbles

The diagnosis was the same for all the Auburn pieces:

- Every part was a `roundedBox` with a 120–140mm radius on every edge. A 255mm arm with a 127mm
  radius is a full half-round tube, and a 395mm seat with 120mm corners is a pillow.
- The back was a row of separate rounded cushions, but the real Auburn has one continuous low
  back.
- The pieces floated on visible glides instead of sitting on a dark recessed plinth.
- There were no scatter cushions, although the product ships with two and they read clearly in
  renders.

## Auburn family

The real Auburn is structured and chunky with softened edges, not puffy. Its seat blocks are flat
on top with upright sides and a modest bullnose. One continuous low back (250 thick, top at 765)
wraps with one big curve into a rolled arm. The arm is about 255 wide and its front sits back
130mm from the seat front. It rises from 565 at the front to meet the back, and its foot (at
170) overhangs a base set 25mm in. Under everything is a 30mm dark plinth. The family shares one
generator: plan-extrude seat blocks, x-extrude back sections and arms, a z-extrude "back wrap",
the plinth, and 500mm scatter cushions.

### `castlery-auburn-3-seater-sofa-chalk-boucle` (2310 × 915 × 765)

- **What was wrong:** 12 parts. Seat blocks and back cushions were rounded boxes with radius 120.
  The arms were two rounded boxes each (radius 127, a full tube). There were 4 visible glides.
  Front-on it read as 6 pillows.
- **What changed (12 → 11 parts):**
  - plinth: a dark 30mm box, inset 70 at the ends and 60 front and back.
  - 2 seat blocks: `extrude` axis y. Plan corners are 175 at the outer front, 95 at the centre
    seam and 110 at the outer back. `bevel` 80 gives a flat top with a bullnose.
  - 2 back sections: `extrude` axis x with `bevel` 35, so the centre seam is shallow. The side
    profile is 250 thick at the top, with fillets of 125 at the front and 115 at the rear. The
    front face leans back 72mm.
  - 2 back wraps: `extrude` axis z through the back's depth. The front profile has one 220mm
    fillet at the outer top, and `bevel` is 110. This is the big curve where the back rolls into
    the arm.
  - 2 arms: `extrude` axis x, 256 wide, `bevel` 110 (under half the width). The nose has fillets
    of 175 and 150. The top runs from 565 at the front to 640 under the wrap, the front is set
    back 130mm and the arm overhangs the recessed base.
  - 2 scatter cushions: 500 × 500 × 140 with radius 50. They lean back 30°, are turned ±18° and
    rolled ±10°, and their bottoms are sunk into the seat crevice.
- **Rounds:**
  - Dry run 1 was too boxy: flat slab arms with a stepped ramp.
  - Dry run 2 gave the seat blocks rounded plan corners and a smooth arm incline.
  - Dry run 3 added the back wraps, which made the photo's silhouette appear.
  - Then the real update.
  - Two earlier `dryRun` calls were rejected by validation (bevel vs fillet, see friction 1)
    before the local check existed.
- **Final sheet:** `…/final/castlery-auburn-3-seater-sofa-chalk-boucle-comparison.png`.
  Before/after: `…/final/castlery-auburn-3-seater-sofa-chalk-boucle-before-after.png`.

### `castlery-auburn-chaise-sofa-left-facing-chalk-boucle` (3095 × 1660 × 765)

- **What was wrong:** 18 parts. These were rounded boxes with radius 85–140: a puffy chaise slab
  (radius 140), three pillow back cushions, two-box arms and returns, and 8 glides.
- **What changed (18 → 13 parts):**
  - 2 plinths: an L in two boxes.
  - 1 long flat-topped chaise block. Plan corners are 180 and 160 at the front, `bevel` 80.
  - 2 seat blocks, as on the 3-seater. The right-hand block runs under the arm.
  - 3 back sections with 2mm seams at the module joints.
  - A back wrap at the chaise's rear corner: the same 220mm roll. It has no arm, and its foot is
    hidden inside the chaise.
  - A back wrap into the right arm.
  - 1 rolled arm, 250 wide, set back 130mm.
  - 2 scatter cushions.
  - `clearanceZones` legroom: `[-497, 85, 1547, 535]`, covering the 2-seat section only, from
    the chaise's inner face to the arm end and 450 out from the seat front. It was
    `[-497, 85, 1548, 535]`. The 2 layouts using the sofa re-linted with the same warnings as
    before.
- **Rounds:**
  - Dry run 1: the back section behind the chaise poked out past the end wrap, so the corner
    looked square from the front.
  - Dry run 2 shortened it.
  - Then the real update.
- **Final sheet:** `…/final/castlery-auburn-chaise-sofa-left-facing-chalk-boucle-comparison.png`

### `castlery-auburn-chaise-sofa-right-facing-chalk-boucle` (3095 × 1660 × 765)

- **What was wrong:** the same as the left-facing one, mirrored.
- **What changed (18 → 13 parts):** the left-facing parts mirrored in local x. That means
  negating x positions, negating u in the y and z extrude profiles, and negating ry and rz on the
  cushions. Part names swap left and right. Legroom is `[-1547, 85, 497, 535]`.
- **Rounds:** dry run 1 confirmed the chaise is on the right and the arm on the left. Then the
  real update.
- **Final sheet:** `…/final/castlery-auburn-chaise-sofa-right-facing-chalk-boucle-comparison.png`

### `castlery-auburn-footstool-chalk-boucle` (910 × 665 × 415)

- **What was wrong:** one rounded box with radius 100 on every edge, floating 30mm up on 4 glides.
  It read as a soap bar.
- **What changed (5 → 2 parts):** a dark plinth, plus one `extrude` axis y block with plan
  corners of 170 (as in the photo) and `bevel` 85. The result is a flat top and upright sides.
- **Rounds:** dry run 1, then the real update (with smoother corner segments).
- **Final sheet:** `…/final/castlery-auburn-footstool-chalk-boucle-comparison.png`

## Audit of the other upholstered assets

| Key | Verdict | Why |
|---|---|---|
| `castlery-madison-2-seater-sofa-bisque` | Unchanged | It already reads like the photo: square track arms (radius 25), a bench seat (radius 40), loose back cushions (radius 70 on 200, which matches the photo's loose cushions), cylinder bolsters and tapered legs. Not bubbly. |
| `castlery-wayne-armchair-opal-beige` | Unchanged | It is a timber frame with spindles, and its loose cushions have radius 45 on 200 and 60 on 180, which is defined. It matches the photo. |
| `castlery-owen-ii-3-seater-sofa-cream-blonde-oak` | Fixed | Its loose cushions were marshmallows (radius 65 on a 170 seat, 70 on a 200 back), and the lumbar pillows were 180-wide rounded cubes. |
| `castlery-arlo-armchair-sand` | Fixed | The seat was a rounded box with radius 110 on 295 (a pillow box), the back pad had radius 85 on 190, and the frame bends were ball joints. |
| `castlery-avery-swivel-armchair-ginger-boucle` | Rebuilt | It had 55 parts: stepped wall slices plus a chain of 41 spheres, which read as a beaded, terraced rim. |

### `castlery-owen-ii-3-seater-sofa-cream-blonde-oak` (2050 × 995 × 790)

- **What changed (19 → 19 parts):**
  - The oak base, arms and back frame are unchanged.
  - Seat cushions: radius 65 → 45.
  - Back cushions: radius 70 → 42, 200 → 190 thick, leaning back 6°.
  - Lumbar pillows: now 520 × 300 × 170 with radius 50, turned 60° into the arm corners and
    leaning back 14°, as in the photo. The rotation is composed as "lean, then turn" (friction 3).
- **Rounds:** dry run 1, then the real update.
- **Final sheet:** `…/final/castlery-owen-ii-3-seater-sofa-cream-blonde-oak-comparison.png`

### `castlery-arlo-armchair-sand` (760 × 920 × 775)

- **What changed (13 → 15 parts):**
  - Seat: an `extrude` axis x with a flat top at 420 and a rounded front (fillets of 90 at the
    top and 110 at the bottom), `bevel` 60.
  - Back pad: an `extrude` axis z, a rounded rectangle 600 × 430 with 100mm corners, `bevel` 55,
    leaning back 12°.
  - Frame: the sphere joints became `torus` quarter bends (radius 90, tube 40) from the front leg
    into the armrest and from the armrest up into the back post, as the photo's bent timber does.
- **Rounds:** dry run 1, then the real update.
- **Final sheet:** `…/final/castlery-arlo-armchair-sand-comparison.png`

### `castlery-avery-swivel-armchair-ginger-boucle` (805 × 805 × 750)

- **What changed (55 → 17 parts):**
  - A recessed round base.
  - A `lathe` seat drum: radius 327, top edge 75, bottom edge 40, front flush with the chair.
  - 11 `lathe` wall slices with `arc`, all on one radius (345 ± 48). Their flat tops tuck inside
    the rim.
  - One `torus` rim: radius 350, tube 55, `arc` 220 (open at the front), tilted 14°. It is 750
    at the back and slopes to about 636 at the arm fronts, which is the photo's sloping top.
  - 2 upright `capsule` arm fronts (radius 50).
  - A lumbar pillow with radius 40.
- **Rounds:**
  - Dry run 1: the slices' varying radii showed as vertical flutes and a staircase under the rim.
  - Dry run 2 gave all the slices one radius, slightly thinner than the rim's tube.
  - Then the real update.
- **Final sheet:** `…/final/castlery-avery-swivel-armchair-ginger-boucle-comparison.png`
  Before/after: `…/final/castlery-avery-swivel-armchair-ginger-boucle-before-after.png`.

## Friction log

1. **The bevel error doesn't point at the cause.** The error says "its profile is too narrow
   somewhere for a bevel of 112mm", but the outline was 400 × 780. The real causes were a convex
   fillet with a radius about equal to the bevel, and a fillet clipped by a short edge. Insetting
   by the bevel turns those arcs' tiny edges round. This cost two rejected server calls, until
   core's `bevelProblem` was run locally. Suggestions:
   - Name the corner or edge that folds.
   - Better, let profile points carry a corner `radius`, so agents don't hand-roll fillet maths.
2. **Rounded profiles must be hand-generated.** The fixes needed rounded outlines in plan, side
   and front, each with its own radius per corner. A per-point radius in `profile` (see 1) would
   replace the generator's fillet helper.
3. **Leaning cushions need composed rotations.** Euler "XYZ" applies the x tilt last, about the
   item's x axis. A pillow turned 60° and then tilted about x lifts at one end instead of
   leaning back. To get "lean back, then turn", the agent composed Ry·Rx itself and converted it
   back to XYZ angles. A `rotationOrder` option, or a documented recipe in the guide, would help.
4. **A lathe can't ramp its height round the arc.** A barrel chair's sloping top still needs
   stepped slices; the trick is to hide their tops in a tilted torus. A height ramp on lathe
   arcs, or a sweep shape, would let one part do it.
5. **There is no "before" comparison sheet.** `get_asset` returns previews but no sheet, so the
   before/after images were composed in the scratchpad with sharp.
6. **Guide edits need a server restart.** The MCP instructions are read once per server process,
   so other agents only see the new "Modelling upholstery" block after the dev server restarts.
   It was left running, as asked.
