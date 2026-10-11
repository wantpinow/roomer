import { LIVING_ROOM_FINISHES } from "@roomer/core"
import { describe, expect, it } from "vitest"

import {
  type PhotorealPromptInput,
  buildPhotorealPrompt,
  joinWords,
} from "../prompt"

const BASE: PhotorealPromptInput = {
  finishes: LIVING_ROOM_FINISHES,
  roomSummary:
    "Living room, about 2.98 m × 7.69 m (roughly rectangular, with a step in the outline), ceiling 2.45 m",
  cameraDescription:
    "Eye-level view (1.6 m) from just inside the kitchen door (D1), looking towards the front window (WIN1). Daylight comes from the front window (WIN1), straight ahead.",
  legend: [
    {
      colorName: "red",
      name: "Auburn 3 Seater Sofa",
      description: "Curvy, low-slung 3-seater in chalk-white boucle",
      referenceIndex: 3,
      visiblePct: 14.2,
    },
    {
      colorName: "green",
      name: "Jana Jute Rug",
      referenceIndex: 4,
      visiblePct: 9.6,
    },
    {
      colorName: "orange",
      name: "Anya Dining Chair",
      description: "Chestnut-stained solid ash chair.",
      referenceIndex: 5,
      visiblePct: 0.4,
    },
    {
      colorName: "purple",
      name: "Anya Dining Chair",
      description: "Chestnut-stained solid ash chair.",
      referenceIndex: 5,
      visiblePct: 0.7,
    },
    {
      colorName: "blue",
      name: "65in TV",
      description: "Black flat-screen TV",
      visiblePct: 2,
    },
    { colorName: "yellow", name: "Pendant lamp", visiblePct: 0 },
  ],
}

describe("joinWords", () => {
  it("joins with commas and a final 'and'", () => {
    expect(joinWords([])).toBe("")
    expect(joinWords(["red"])).toBe("red")
    expect(joinWords(["red", "blue"])).toBe("red and blue")
    expect(joinWords(["red", "blue", "lime"])).toBe("red, blue and lime")
  })
})

describe("buildPhotorealPrompt", () => {
  it("matches the stored prompt for the full clay + id + references input", () => {
    expect(buildPhotorealPrompt(BASE)).toMatchSnapshot()
  })

  it("matches the stored prompt without an id map", () => {
    expect(
      buildPhotorealPrompt({ ...BASE, withIdPass: false })
    ).toMatchSnapshot()
  })

  it("explains image 1 as the layout to keep and image 2 as colour labels", () => {
    const prompt = buildPhotorealPrompt(BASE)
    expect(prompt).toMatch(/^Turn image 1 into a realistic photograph/)
    expect(prompt).toContain("Image 2 is an ID map")
    expect(prompt).toContain("none of them may appear in the photo")
    expect(prompt).toContain("Images 3–5 are product photos")
  })

  it("groups placements of one product into a single legend line", () => {
    const prompt = buildPhotorealPrompt(BASE)
    expect(prompt).toContain(
      "- orange and purple: 2 × Anya Dining Chair (product photo: image 5), about 1% of the frame — Chestnut-stained solid ash chair."
    )
  })

  it("lists items largest first and drops items that are not in frame", () => {
    const prompt = buildPhotorealPrompt(BASE)
    const order = ["Auburn", "Jana", "65in TV", "Anya"].map((name) =>
      prompt.indexOf(name)
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(prompt).not.toContain("Pendant lamp")
  })

  it("marks items without a product photo", () => {
    expect(buildPhotorealPrompt(BASE)).toContain(
      "- blue: 65in TV (no product photo), about 2% of the frame — Black flat-screen TV."
    )
  })

  it("never mentions colours when there is no id map", () => {
    const prompt = buildPhotorealPrompt({ ...BASE, withIdPass: false })
    expect(prompt).not.toContain("ID map")
    expect(prompt).not.toMatch(/\b(red|green|orange|purple|blue):/)
    expect(prompt).toContain("The furniture in image 1, largest first:")
  })

  it("names a single reference image and non-contiguous ones", () => {
    const one = buildPhotorealPrompt({
      ...BASE,
      legend: [{ ...BASE.legend[0]!, referenceIndex: 2 }],
      withIdPass: false,
    })
    expect(one).toContain("Image 2 is a product photo of the actual pieces.")
    const gaps = buildPhotorealPrompt({
      ...BASE,
      legend: [
        { ...BASE.legend[0]!, referenceIndex: 3 },
        { ...BASE.legend[1]!, referenceIndex: 6 },
      ],
    })
    expect(gaps).toContain("Images 3 and 6 are product photos")
  })

  it("leaves out the reference paragraph when no photos are sent", () => {
    const prompt = buildPhotorealPrompt({
      ...BASE,
      legend: BASE.legend.map((entry) => ({
        ...entry,
        referenceIndex: undefined,
      })),
    })
    expect(prompt).not.toContain("product photos of the actual pieces")
    expect(prompt).toContain("(no product photo)")
  })

  it("includes finishes, styling and the camera, and skips empty ones", () => {
    const prompt = buildPhotorealPrompt(BASE)
    expect(prompt).toContain(
      "Finishes: walls soft warm white, matt; floor light natural oak boards, matt finish; ceiling white; skirting boards warm white, satin."
    )
    expect(prompt).toContain("Styling: Calm, warm, Scandinavian-leaning")
    expect(prompt).toContain("Camera: Eye-level view (1.6 m)")

    const bare = buildPhotorealPrompt({
      ...BASE,
      finishes: {},
      roomSummary: "",
      cameraDescription: "",
    })
    expect(bare).not.toMatch(/^(Finishes|Styling|Room|Camera):/m)
  })

  it("appends the extra prompt last", () => {
    const prompt = buildPhotorealPrompt({
      ...BASE,
      extraPrompt: "  evening light, lamps on  ",
    })
    expect(prompt.endsWith("Also: evening light, lamps on.")).toBe(true)
    expect(buildPhotorealPrompt({ ...BASE, extraPrompt: "   " })).not.toContain(
      "Also:"
    )
  })

  it("still describes the camera and finishes for an empty room", () => {
    const prompt = buildPhotorealPrompt({ ...BASE, legend: [] })
    expect(prompt).not.toContain("ID map")
    expect(prompt).not.toContain("The furniture in image 1")
    expect(prompt).toContain("Finishes:")
  })
})
