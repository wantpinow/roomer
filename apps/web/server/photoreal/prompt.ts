import type { Finishes } from "@roomer/core/schema"

// The photoreal prompt (spec §8 step 3). Pure and snapshot-tested. Images are
// referred to by position, in the order the pipeline sends them:
//
//   image 1        clay render — camera + geometry, to keep exactly
//   image 2        id map (when sent) — colour → item, never to be painted
//   images 2/3..   product photos, one per visible asset, largest first
//   last           photos of the real room (when sent) — architecture and
//                  light only, never their furniture
//
// Wording was tuned in the 2026-10-11 model spike
// (docs/2026-10-11-photoreal-spike.md).

export interface PromptLegendEntry {
  /** Id-pass colour name ("red"); ignored when no id map is sent. */
  colorName: string
  /** What the item is, e.g. the product name. */
  name: string
  /** Visual description (materials, colour, silhouette). */
  description?: string
  /** 1-based position of its product photo among the input images. */
  referenceIndex?: number
  /** Share of the frame it covers, 0..100. Entries at 0 are left out. */
  visiblePct: number
}

export interface PhotorealPromptInput {
  finishes: Finishes
  /** One or two sentences: room type, size, doors and windows. */
  roomSummary: string
  legend: readonly PromptLegendEntry[]
  /** Where the camera stands and what it looks at (and where the light is). */
  cameraDescription: string
  /** Whether image 2 is the id map. Default true. */
  withIdPass?: boolean
  /** 1-based positions of photos of the real room among the input images. */
  roomPhotoIndexes?: readonly number[]
  /** Free text from the agent/user, appended last. */
  extraPrompt?: string
}

interface LegendGroup {
  colors: string[]
  name: string
  description?: string
  referenceIndex?: number
  visiblePct: number
  count: number
}

/** Placements of the same asset (same name + photo) share one line. */
function groupLegend(legend: readonly PromptLegendEntry[]): LegendGroup[] {
  const groups = new Map<string, LegendGroup>()
  for (const entry of legend) {
    if (!(entry.visiblePct > 0)) continue
    const key = JSON.stringify([
      entry.name,
      entry.referenceIndex ?? null,
      entry.description ?? null,
    ])
    const group = groups.get(key)
    if (group) {
      group.colors.push(entry.colorName)
      group.visiblePct += entry.visiblePct
      group.count++
    } else {
      groups.set(key, {
        colors: [entry.colorName],
        name: entry.name,
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.referenceIndex !== undefined
          ? { referenceIndex: entry.referenceIndex }
          : {}),
        visiblePct: entry.visiblePct,
        count: 1,
      })
    }
  }
  return [...groups.values()].sort((a, b) => b.visiblePct - a.visiblePct)
}

/** ["a"] → "a"; ["a", "b", "c"] → "a, b and c". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("")
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
}

function formatPct(pct: number): string {
  if (pct < 1) return "under 1% of the frame"
  return `about ${Math.round(pct)}% of the frame`
}

function trimSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean === "" || /[.!?]$/.test(clean) ? clean : `${clean}.`
}

function describeGroup(group: LegendGroup, withColors: boolean): string {
  const count = group.count > 1 ? `${group.count} × ` : ""
  const photo =
    group.referenceIndex !== undefined
      ? ` (product photo: image ${group.referenceIndex})`
      : " (no product photo)"
  const description = group.description
    ? ` — ${trimSentence(group.description)}`
    : ""
  const label = withColors ? `${joinWords(group.colors)}: ` : ""
  return `- ${label}${count}${group.name}${photo}, ${formatPct(group.visiblePct)}${description}`
}

/** [3] → "Image 3 is"; [3, 4, 5] → "Images 3–5 are"; [3, 6] → "Images 3 and 6 are". */
function imagesAre(indexes: readonly number[]): string | undefined {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b)
  if (sorted.length === 0) return undefined
  if (sorted.length === 1) return `Image ${sorted[0]} is`
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1)
  return contiguous
    ? `Images ${sorted[0]}–${sorted.at(-1)} are`
    : `Images ${joinWords(sorted.map(String))} are`
}

function referenceRange(groups: readonly LegendGroup[]): string | undefined {
  const indexes = groups.flatMap((g) =>
    g.referenceIndex === undefined ? [] : [g.referenceIndex]
  )
  const subject = imagesAre(indexes)
  if (!subject) return undefined
  return new Set(indexes).size > 1
    ? `${subject} product photos`
    : `${subject} a product photo`
}

function finishesLine(finishes: Finishes): string | undefined {
  const parts = [
    finishes.walls && `walls ${finishes.walls}`,
    finishes.floor && `floor ${finishes.floor}`,
    finishes.ceiling && `ceiling ${finishes.ceiling}`,
    finishes.skirting && `skirting boards ${finishes.skirting}`,
  ].filter((part): part is string => Boolean(part))
  return parts.length ? `Finishes: ${parts.join("; ")}.` : undefined
}

export function buildPhotorealPrompt({
  finishes,
  roomSummary,
  legend,
  cameraDescription,
  withIdPass = true,
  roomPhotoIndexes = [],
  extraPrompt,
}: PhotorealPromptInput): string {
  const groups = groupLegend(legend)
  const sections: string[] = []

  sections.push(
    [
      "Paint over image 1 to turn it into a realistic photograph of this room, as if shot by a professional interior photographer.",
      "",
      'Image 1 is a plain grey 3D "clay" render of the room. Treat it as the underpainting: the photo must line up with it exactly.',
      "- Same camera: identical position, height, tilt, lens and field of view. Do not zoom, crop, pan, re-centre or re-level the view; keep the same amount of ceiling, floor and wall in frame.",
      "- Every edge in image 1 stays where it is: wall corners, the ceiling line, beams, door and window frames, and the outline of every piece of furniture. Each item keeps its exact position, size, proportions and orientation. Do not move, resize, rotate, add or remove anything.",
      "- Walls that are plain in image 1 stay plain: do not add windows, doors, openings or light fittings that are not there.",
      "- Change only surfaces and light: materials, colours, textures, reflections and shadows.",
    ].join("\n")
  )

  if (withIdPass && groups.length > 0) {
    sections.push(
      [
        "Image 2 is an ID map of the same view. Each piece of furniture is painted one flat colour so you can tell which item is which. The colours are labels, not paint: none of them may appear in the photo. Grey and white areas are the room itself.",
        ...groups.map((group) => describeGroup(group, true)),
      ].join("\n")
    )
  } else if (groups.length > 0) {
    sections.push(
      [
        "The furniture in image 1, largest first:",
        ...groups.map((group) => describeGroup(group, false)),
      ].join("\n")
    )
  }

  const references = referenceRange(groups)
  if (references) {
    sections.push(
      `${references} of the actual pieces. Make each item look like its product: the same materials, colours, textures and details (legs, arms, edges, handles, weave). Keep its position, size and angle from image 1, and ignore the photo's own background, camera angle and lighting.`
    )
  }

  const roomPhotos = imagesAre(roomPhotoIndexes)
  if (roomPhotos) {
    const several = new Set(roomPhotoIndexes).size > 1
    const them = several ? "them" : "it"
    sections.push(
      `${roomPhotos} ${several ? "photos" : "a photo"} of the real room, taken earlier with someone else's furniture. Use ${them} only for the room itself: floor, walls, ceiling, skirting, doors, window frames, light fittings and how the daylight falls. Ignore all furniture, rugs, art, plants, decor and any watermark in ${them}, and keep the camera and layout of image 1.`
    )
  }

  const room = [
    roomSummary && `Room: ${trimSentence(roomSummary)}`,
    finishesLine(finishes),
    finishes.notes && `Styling: ${trimSentence(finishes.notes)}`,
    cameraDescription && `Camera: ${trimSentence(cameraDescription)}`,
  ].filter((line): line is string => Boolean(line))
  if (room.length) sections.push(room.join("\n"))

  sections.push(
    [
      "Light: soft natural daylight through the window, gentle soft-edged shadows, a warm true-to-life white balance. Ceiling lights off.",
      "Photo: interior photograph with the perspective of image 1, realistic materials, sharp focus, no people. No text, labels, watermarks or borders. Do not add furniture, rugs, plants, artwork, cushions, throws or decor that is not in image 1.",
    ].join("\n")
  )

  const extra = extraPrompt?.trim()
  if (extra) sections.push(`Also: ${trimSentence(extra)}`)

  return sections.join("\n\n")
}
