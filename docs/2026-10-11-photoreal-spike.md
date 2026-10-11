# Photoreal spike: which image model paints the clay render best

Status: done · 2026-10-11 · code: `apps/web/server/photoreal/`, `apps/web/scripts/photoreal-spike.ts`

## Decision

- **Default model: `openai/gpt-image-2.5-sunburst`** (unchanged, `DEFAULT_PHOTOREAL_MODEL` in
  `@roomer/core/schema/render.ts`). It is the most reliable model on the things a layout tool
  depends on. In 11 runs it never invented or dropped furniture or architecture, never painted
  id-map colours, and never resized an item. It gives the most convincing photos and the
  closest product match. It costs half as much and runs twice as fast as Gemini Pro.
- **Default strategy:** send clay + id map + one product photo per visible asset (largest
  first), plus photos of the real room when there are any. Use prompt v3 from
  `server/photoreal/prompt.ts` (stored in `tests/__snapshots__/prompt.test.ts.snap`).
- **Known cost of that choice: gpt-image does not hold the camera exactly.** It re-levels
  tilted views and frames ~1.2–1.3× tighter, and it narrows the new 70° wide-angle default
  cameras to roughly a normal lens. The layout stays right; the framing doesn't match the clay
  pixel for pixel. No prompt wording, size, quality or `input_fidelity` setting changed this.
- **`google/gemini-3-pro-image` is the "exact framing" alternative.** It lines up with the clay
  far better (alignment 3.2–4.8 against 1.6–3.6). Use it when a render must overlay the clay
  or match another render's framing. It has two failure modes:
  - With the id map it painted small chairs in the id colours. So Gemini renderers declare
    `prefersIdPass: false` and get product photos without the map.
  - From the window camera it shrank the 3-seat sofa to a loveseat in 3 out of 3 runs, and it
    invented windows on a plain wall until prompt v3 forbade it.
- **Not recommended:** `google/gemini-3.1-flash-image` (it invents chairs and doors, and
  shrinks the sofa) and `bfl/flux-3-image`, which can't be used through the gateway today
  (see below). `openai/gpt-image-2.5-flare` is as good as sunburst but follows the product
  photos slightly less. It costs the same on the gateway and is only marginally faster, so
  there's little reason to pick it.
- **Real-room photos: worth sending when we have them.** See the room-photo experiment.

## What was tested

- **Scene.** The furnished living-room fixture (`lib/scene/fixture-scene.ts`, TEST_ASSETS,
  12 placements). Each generic asset stood in for a Castlery product from
  `seed/castlery/products.json`, which supplied the name, description and one cutout photo
  (the 3/4 "angle" cutout where there was one, as a JPEG):

  | Test asset | Castlery product |
  |---|---|
  | sofa | auburn-3-seater-sofa-chalk-boucle |
  | coffee table | mori-coffee-table-natural |
  | dining table | harper-dining-table-180-chestnut-oak |
  | 4 dining chairs | anya-dining-chair-chestnut (one photo for all four) |
  | sideboard | ashen-wood-sideboard-180 |
  | rug | jana-jute-rug-229x274 |
  | TV, pendant | no product: described in words only |

  The parts geometry is the generic test geometry. For example, the dining table has four
  legs while the Harper has a pedestal. So every run also tested what wins when the clay and
  the photo disagree. In production, agent-built assets are just as rough.
- **Cameras.** These are pinned in the script so reruns stay comparable:
  - `door`: in the kitchen doorway D1, 1.6 m high, tilted 5° down, 55° vertical fov, looking
    down the room to the window.
  - `window`: by the window, looking back, 55° fov, with the table and pendant close to the
    lens.
  - `door-wide`: core's new estate-agent default for D1: level, 1.5 m high, 70° fov.

  The passes were rendered at 1536×1024 by the scene engineer's headless renderer. Midway,
  the ceiling beam BM1 started rendering, so later runs include it.
- **Inputs per variant.**
  - `full`: clay + id + 6 product photos (8 images).
  - `refs`: clay + product photos.
  - `clay`: clay only, with items described in words.
  - `room`: full + one estate-agent photo of the real room.
- **Quality and size.** Everything ran at LOW quality and about 1 MP:
  - gpt-image: 1248×832.
  - Gemini: `imageSize: "1K"`, 3:2 → 1264×848.
  - FLUX: picks its own size, 1248×832 at 3:2.
- **The matrix.** 5 models × 3 variants on `door`, then prompt iterations and the best
  configurations on `window` and `door-wide`.
- **Alignment score.** The script scores every output. It takes the mean local maximum of the
  output's luminance gradient along the id pass's outlines (a 5×5 window to allow 2 px of
  drift) and divides it by the same mean over the whole image:
  - ≈1 means the output's edges have nothing to do with the clay layout.
  - The clay itself scores ≈10 (the stub's tinted clay scores 9.8).

  The score measures "did the camera and furniture stay put", not beauty. Each run also gets
  an overlay image with the clay outlines drawn over the output, which made the camera drift
  obvious at a glance.

### Door camera, prompt v1 (the matrix)

| Model | Variant | Alignment | Time | Cost | Notes |
|---|---|---|---|---|---|
| sunburst | full | 1.87 | 20.4s | $0.068 | Superb photo; Auburn sofa, Harper pedestal table, Ashen sideboard, jute rug all recognisable. Re-levelled and ~15% tighter |
| sunburst | refs | 1.74 | 19.0s | $0.055 | Same quality |
| sunburst | clay | 1.80 | 17.3s | $0.021 | Good; products generic |
| flare | full | 1.97 | 19.6s | $0.068 | Kept the clay's 4-legged table instead of the Harper pedestal |
| flare | refs | 1.63 | 13.6s | $0.055 | Good; brought the reference's cushions |
| flare | clay | 1.60 | 10.2s | $0.021 | Good; generic |
| gemini-3-pro | full | 3.30 | 24.2s | $0.144 | Lines up with the clay; products right; flatter "listing" light |
| gemini-3-pro | refs | 3.34 | 39.8s | $0.142 | Same |
| gemini-3-pro | clay | 4.03 | 53.1s | $0.142 | Best alignment; generic products |
| gemini-3.1-flash | full | 1.64 | 21.2s | $0.072 | Two invented chairs; door became glazed double doors |
| gemini-3.1-flash | refs | 2.06 | 12.9s | $0.071 | Two invented chairs |
| gemini-3.1-flash | clay | 3.45 | 12.7s | $0.068 | Added curtains, two-seat sofa |
| flux-3 | all three | — | 2 × 60s | — | Gateway dropped the connection each time |

### Prompt iterations and the other cameras

| Run | Alignment | Time | Cost | Notes |
|---|---|---|---|---|
| door · sunburst full, `input_fidelity: high` | 1.84 | 17s | $0.068 | Ignored: identical tokens, cost and framing |
| door · sunburst full, v2 camera-lock wording | 1.60 | 17s | $0.068 | Wording can't stop gpt-image re-framing |
| door · sunburst full, v2 at 1536×1024 / medium quality | 1.88 / 1.95 | 16–19s | $0.069–0.073 | Same |
| door · gemini-pro full v2 | 3.73 | 32s | $0.143 | v2 helped Gemini (3.30 → 3.73); beam kept |
| door · gemini-pro room v2 | 3.73 | 42s | $0.148 | See the room-photo experiment |
| door-wide · gemini-pro full v2 | 4.82 | 36s | $0.146 | **Id-colour leak: chairs teal, lime and magenta** |
| door-wide · gemini-pro refs v2 | 3.80 | 32s | $0.143 | No map, no leak; best Gemini image |
| door-wide · sunburst full v2 / v3 | 2.33 / 2.29 | 16–21s | $0.068 | Lovely, but the 70° view narrowed to ~50° |
| door-wide · sunburst room v2 | 2.51 | 19s | $0.075 | See the room-photo experiment |
| window · gemini-pro full v2 | 2.50 | 45s | $0.144 | Invented two windows on plain wall W6; sofa → loveseat |
| window · gemini-pro refs v2 / v3 | 3.36 / 3.17 | 42–58s | $0.141–0.148 | v3 stopped the invented windows; sofa still a loveseat |
| window · sunburst full v2 / v3 | 2.90 / **3.64** | 16–19s | $0.069 | Layout, products and beam all right; best window image |

## Per-model verdicts

- **gpt-image-2.5-sunburst.** Best realism and product identity. Layout is preserved: the
  same items sit in the same places at the same sizes, and nothing is ever added. It follows
  the photos over the clay where they disagree (pedestal table, curvy Auburn sofa), which is
  what we want. The camera is not locked: it re-levels tilted views and frames tighter,
  especially from the wide-angle default cameras.
  - About 17–20s per call.
  - $0.068 per call with 8 inputs at low quality. Image tokens dominate: about 900 per input
    image.
- **gpt-image-2.5-flare.** Practically the same as sunburst, but it held to the clay's shapes
  a little more and to the photos a little less. The gateway prices it the same as sunburst,
  and it's only marginally faster. Keep it for quick previews only.
- **gemini-3-pro-image (Nano Banana Pro).** By far the best camera and geometry lock, and the
  products are recognisable. The light is flatter and the look closer to a listing photo.
  Failure modes:
  - It painted id colours onto small items, so it now skips the map.
  - It invented windows, fixed by prompt v3.
  - It shrank the sofa from the window camera, in 3 out of 3 runs.

  25–58s and about $0.14 per call (1K).
- **gemini-3.1-flash-image (Nano Banana 2).** Cheap and fast (13–21s, $0.07), but it changes
  the layout: invented chairs, curtains and doors, and a two-seat sofa. Not usable for a
  layout tool.
- **flux-3-image.** It can't currently be used through the gateway. FLUX 3 takes 35–60s even
  for trivial prompts, and the gateway closes synchronous connections at ~60s. Every call
  with a real prompt (≥ 350 characters), a real clay pass, or reference photos died at
  60.6–61.7s with `UND_ERR_SOCKET`, on both the AI SDK route and the OpenAI-compatible route.
  The `x-vercel-gateway-extended-time` header didn't help. The one call that finished used a
  240-character prompt and a 768px clay, and took 53s. It produced boxy, CG-looking geometry,
  reframed the camera, and scored 1.45. The renderer is kept, and its error now says the
  connection was dropped. Revisit if the gateway gains async image jobs.

## Room-photo experiment (architect's question)

One of the estate-agent photos of the real room was added as the last input. It was
`images/4.webp`, taken from the kitchen end, which matches the door cameras. It went in with
a paragraph saying to use it only for the floor, walls, ceiling, skirting, doors, windows,
light fittings and daylight, and to ignore all furniture, rugs, art, plants, decor and any
watermark. It ran on Gemini Pro (door) and sunburst (door-wide).

- **No leakage in either run.** None of the previous owner's furniture appeared: no daybed,
  dining set, art, plants or chrome spider lights. The "parkers" watermark didn't appear
  either.
- **Small but real realism gain.** The herringbone came out paler and closer to the real
  floor. The light was brighter, like the listing. With sunburst, the window view became
  suburban houses like the real one.
- **No change to alignment** (3.73 vs 3.73; 2.51 vs 2.33).

**Verdict:** send real-room photos when the room has them (spec `referencePhotos`), ideally
one taken from roughly the render's viewpoint. They cost one input slot, about $0.007 at low
quality. `generatePhotoreal({ roomPhotos })` reserves their slots before product photos.
The photos are the user's private data: the spike copies them only into the gitignored
`.roomer-out/`.

## Gateway facts verified for the code

- **Two routes, both via the AI SDK.** The renderers use `ai@7` `generateImage` /
  `generateText` with `@ai-sdk/gateway`, the same stack as masterguest. The gateway's
  image-model API takes multiple input images, so a raw `fetch` wasn't needed.
  - gpt-image and FLUX go through `generateImage({ prompt: { text, images } })`.
  - Gemini is served as a **language** model. On the image route it fails with
    `ModelTypeMismatchError`, so it goes through `generateText` with image files, and
    `providerOptions.google = { responseModalities: ["TEXT","IMAGE"], imageConfig: { aspectRatio, imageSize } }`.
  - Before the code was written, all five models were also checked on the OpenAI-compatible
    `POST /v1/images/edits` (JSON `images[].image_url` and multipart `image[]`) and
    `/v1/chat/completions` routes.
- **gpt-image sizes.** Width and height must both be divisible by 16, and the image must be at
  least 655,360 pixels: 768×512 is "below the minimum pixel budget". Quality is set with
  `providerOptions.openai.quality`. The output is always PNG.
- **Input limits.** gpt-image takes up to 16 input images, Gemini 14, FLUX 10.
- **Cost.** Cost comes back in `providerMetadata.gateway.cost`, and the spike records it per
  run.

## Totals

- **Runs.** 31 successful renders are on record: 24 through the pipeline and 7 one-off
  prompt/option experiments. 3 FLUX matrix runs failed, each after a retry.
- **Probe calls.** About 30 small probe and debug calls, mostly tiny images or FLUX attempts
  that timed out.
- **Spend.** About $3.4 of gateway cost in all. The recorded runs come to $2.29, plus about
  $0.45 of unrecorded experiments and about $0.6 of probes.

## Where to look

Everything is in `.roomer-out/photoreal-spike/`, which is gitignored and not committed:

- `index.html`: contact sheet with inputs, outputs, overlays, scores and verdicts.
- `results.json`: every run's prompt, inputs, references, time and cost.
- `notes.json`: the verdicts.

Best outputs:

- `runs/window-sunburst-full-v3.png`, `runs/door-wide-sunburst-full-v3.png`,
  `runs/door-sunburst-full.png`: the default model.
- `runs/door-wide-gemini-pro-refs-v2.png`, `runs/door-gemini-pro-full-v2.png`: the
  exact-framing alternative.
- `runs/door-wide-gemini-pro-full-v2.png`: the id-colour leak.
- `runs/door-wide-sunburst-room-v2.png`, `runs/door-gemini-pro-room-v2.png`: with a
  room photo.
- `overlays/<run>.png`: clay outlines over each output.

Rerun with `pnpm dev` running:
`pnpm --filter web photoreal:spike door-wide:sunburst:full:v3 [--room-photo <file>]`. Add
`--matrix` for the full model × variant grid, and `--sheet-only` to rebuild the sheet.

## Follow-ups

- **gpt-image narrows wide-angle cameras.** If exact framing matters more than robustness,
  there are two options:
  - Make Gemini Pro the default once its sofa-shrinking is understood. Try sending the
    sofa's product photo larger, or a crop of the id map.
  - Keep sunburst and show the clay next to the photo in the UI so the difference is
    visible.
- **Quality settings.** The spike ran at low quality only; `medium` didn't change the
  framing. Check `medium`/`high` realism before shipping the app default.
- **Position hints.** The id pass's per-colour bounds (`countPalettePixels(...).bounds`) could
  add "left foreground"-style hints to the legend. This might help Gemini keep sizes, and
  would give FLUX bounding-box layouts if it becomes usable.
- **Duplicated PNG helper.** `server/photoreal/png.ts` and `server/render/png.ts` both read
  PNG headers. Merge them when the pipeline is wired into MCP.
