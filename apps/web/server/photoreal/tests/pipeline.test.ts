import { LIVING_ROOM_FINISHES } from "@roomer/core"
import { describe, expect, it, vi } from "vitest"

import {
  type GeneratePhotorealInput,
  type ReferenceImageSource,
  generatePhotoreal,
} from "../pipeline"
import { fakeRenderer, solidPng } from "./helpers"

const W = 100
const H = 60
const TOTAL = W * H
const CLAY = solidPng(W, H, [190, 185, 178])
const ID = solidPng(W, H, [230, 25, 75])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

function source(
  tag: string,
  options: { primary?: boolean; data?: Buffer; fail?: boolean } = {}
): ReferenceImageSource & { load: ReturnType<typeof vi.fn> } {
  return {
    ...(options.primary ? { primary: true } : {}),
    load: vi.fn(async () => {
      if (options.fail) throw new Error(`cannot load ${tag}`)
      return { data: options.data ?? solidPng(8, 8), mime: "image/png" }
    }),
  }
}

function makeInput(
  overrides: Partial<GeneratePhotorealInput> = {}
): GeneratePhotorealInput {
  return {
    renderer: fakeRenderer(),
    clay: CLAY,
    id: ID,
    legend: [
      {
        placementId: "sofa",
        assetId: "auburn",
        name: "Auburn 3 Seater Sofa",
        description: "Chalk boucle",
        colorName: "red",
      },
      {
        placementId: "coffee-table",
        assetId: "mori",
        name: "Mori Coffee Table",
        colorName: "green",
      },
      {
        placementId: "chair-1",
        assetId: "anya",
        name: "Anya Dining Chair",
        colorName: "yellow",
      },
      {
        placementId: "chair-2",
        assetId: "anya",
        name: "Anya Dining Chair",
        colorName: "blue",
      },
      {
        placementId: "tv",
        assetId: "tv",
        name: "65in TV",
        colorName: "orange",
      },
    ],
    visibility: {
      totalPixels: TOTAL,
      byPlacement: {
        sofa: TOTAL * 0.2,
        "coffee-table": TOTAL * 0.05,
        "chair-1": TOTAL * 0.08,
        "chair-2": TOTAL * 0.04,
        tv: TOTAL * 0.03,
      },
    },
    references: {
      auburn: [
        source("auburn-front"),
        source("auburn-angle", { primary: true }),
      ],
      mori: [source("mori")],
      anya: [source("anya")],
    },
    finishes: LIVING_ROOM_FINISHES,
    roomSummary: "Living room",
    cameraDescription: "From the hall door",
    quality: "low",
    ...overrides,
  }
}

describe("generatePhotoreal", () => {
  it("sends clay, id map, then one photo per asset, largest first", async () => {
    const renderer = fakeRenderer()
    const input = makeInput({ renderer })
    const result = await generatePhotoreal(input)

    const request = renderer.requests[0]!
    expect(request.images.map((i) => i.role)).toEqual([
      "clay",
      "id",
      "reference",
      "reference",
      "reference",
    ])
    expect(request.images[0]!.data).toBe(CLAY)
    expect(request.images[1]!.data).toBe(ID)
    expect(request.images.slice(2).map((i) => i.label)).toEqual([
      "product photo: Auburn 3 Seater Sofa",
      "product photo: Anya Dining Chair",
      "product photo: Mori Coffee Table",
    ])
    expect(result.references).toEqual([
      {
        assetId: "auburn",
        placementIds: ["sofa"],
        visibleFraction: 0.2,
        imageIndex: 3,
      },
      {
        assetId: "anya",
        placementIds: ["chair-1", "chair-2"],
        visibleFraction: expect.closeTo(0.12, 6),
        imageIndex: 4,
      },
      {
        assetId: "mori",
        placementIds: ["coffee-table"],
        visibleFraction: 0.05,
        imageIndex: 5,
      },
    ])
    expect(result.skipped).toEqual([
      {
        assetId: "tv",
        placementIds: ["tv"],
        visibleFraction: 0.03,
        reason: "no-image",
      },
    ])
  })

  it("loads only the chosen photo of each chosen asset", async () => {
    const input = makeInput({ maxReferences: 1 })
    await generatePhotoreal(input)
    const [front, angle] = input.references.auburn! as ReturnType<
      typeof source
    >[]
    expect(front!.load).not.toHaveBeenCalled()
    expect(angle!.load).toHaveBeenCalledOnce()
    expect(
      (input.references.mori![0] as ReturnType<typeof source>).load
    ).not.toHaveBeenCalled()
  })

  it("builds the prompt from the numbered images and legend", async () => {
    const renderer = fakeRenderer()
    const result = await generatePhotoreal(makeInput({ renderer }))
    expect(renderer.requests[0]!.prompt).toBe(result.prompt)
    expect(result.prompt).toContain("Image 2 is an ID map")
    expect(result.prompt).toContain("Images 3–5 are product photos")
    expect(result.prompt).toContain(
      "- red: Auburn 3 Seater Sofa (product photo: image 3), about 20% of the frame — Chalk boucle."
    )
    expect(result.prompt).toContain(
      "- yellow and blue: 2 × Anya Dining Chair (product photo: image 4), about 12% of the frame"
    )
    expect(result.prompt).toContain(
      "- orange: 65in TV (no product photo), about 3% of the frame"
    )
  })

  it("numbers references from image 2 when no id map is sent", async () => {
    const renderer = fakeRenderer({ maxInputImages: 3 })
    const result = await generatePhotoreal(
      makeInput({ renderer, id: undefined })
    )
    const request = renderer.requests[0]!
    expect(request.images.map((i) => i.role)).toEqual([
      "clay",
      "reference",
      "reference",
    ])
    expect(result.references.map((r) => [r.assetId, r.imageIndex])).toEqual([
      ["auburn", 2],
      ["anya", 3],
    ])
    expect(result.prompt).not.toContain("ID map")
    expect(result.prompt).toContain("Images 2–3 are product photos")
    expect(result.skipped.map((s) => [s.assetId, s.reason])).toContainEqual([
      "mori",
      "over-limit",
    ])
  })

  it("leaves room for both passes within the model's input limit", async () => {
    const renderer = fakeRenderer({ maxInputImages: 3 })
    await generatePhotoreal(makeInput({ renderer }))
    expect(renderer.requests[0]!.images).toHaveLength(3)
  })

  it("can send the clay pass alone", async () => {
    const renderer = fakeRenderer()
    const result = await generatePhotoreal(
      makeInput({ renderer, id: undefined, references: {} })
    )
    expect(renderer.requests[0]!.images.map((i) => i.role)).toEqual(["clay"])
    expect(result.prompt).toContain("The furniture in image 1, largest first:")
    expect(result.prompt).not.toContain("product photos of the actual pieces")
  })

  it("skips a photo that fails to load and keeps the numbering contiguous", async () => {
    const renderer = fakeRenderer()
    const result = await generatePhotoreal(
      makeInput({
        renderer,
        references: {
          auburn: [source("auburn", { fail: true })],
          mori: [source("mori")],
          anya: [source("anya")],
        },
      })
    )
    expect(result.references.map((r) => [r.assetId, r.imageIndex])).toEqual([
      ["anya", 3],
      ["mori", 4],
    ])
    expect(result.skipped).toContainEqual({
      assetId: "auburn",
      placementIds: ["sofa"],
      visibleFraction: 0.2,
      reason: "load-failed",
    })
    expect(result.prompt).toContain("Auburn 3 Seater Sofa (no product photo)")
  })

  it("trusts the bytes over the declared media type", async () => {
    const renderer = fakeRenderer()
    await generatePhotoreal(
      makeInput({
        renderer,
        references: { auburn: [source("auburn", { data: JPEG })] },
      })
    )
    expect(renderer.requests[0]!.images[2]!.mime).toBe("image/jpeg")
  })

  it("asks for the clay pass's size by default, or the given size", async () => {
    const renderer = fakeRenderer()
    await generatePhotoreal(makeInput({ renderer }))
    await generatePhotoreal(
      makeInput({ renderer, size: { width: 1024, height: 1024 } })
    )
    await generatePhotoreal(makeInput({ renderer, size: "auto" }))
    expect(renderer.requests.map((r) => r.size)).toEqual([
      { width: W, height: H },
      { width: 1024, height: 1024 },
      "auto",
    ])
    expect(renderer.requests.every((r) => r.quality === "low")).toBe(true)
  })

  it("reports the renderer's model, the input metadata and the duration", async () => {
    const output = solidPng(4, 4, [1, 2, 3])
    const renderer = fakeRenderer({ id: "stub" }, output)
    const clock = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1234.4)
    const result = await generatePhotoreal(makeInput({ renderer, now: clock }))
    expect(result.png).toBe(output)
    expect(result.model).toBe("stub")
    expect(result.durationMs).toBe(234)
    expect(result.raw).toEqual({ fake: true })
    expect(result.inputs[0]).toEqual({
      role: "clay",
      mime: "image/png",
      label: "clay render (the camera and layout to keep)",
      bytes: CLAY.byteLength,
    })
    expect(result.inputs).toHaveLength(5)
  })

  it("passes the abort signal through and stops if already aborted", async () => {
    const renderer = fakeRenderer()
    const controller = new AbortController()
    await generatePhotoreal(makeInput({ renderer, signal: controller.signal }))
    expect(renderer.requests[0]!.signal).toBe(controller.signal)

    controller.abort(new Error("cancelled"))
    await expect(
      generatePhotoreal(makeInput({ renderer, signal: controller.signal }))
    ).rejects.toThrow("cancelled")
    expect(renderer.requests).toHaveLength(1)
  })

  it("sends room photos after the product photos and reserves their slots", async () => {
    const renderer = fakeRenderer({ maxInputImages: 5 })
    const room = {
      load: vi.fn(async () => ({ data: JPEG, mime: "image/webp" })),
    }
    const result = await generatePhotoreal(
      makeInput({ renderer, roomPhotos: [room] })
    )
    const request = renderer.requests[0]!
    expect(request.images.map((i) => i.role)).toEqual([
      "clay",
      "id",
      "reference",
      "reference",
      "room",
    ])
    expect(request.images[4]!.mime).toBe("image/jpeg")
    expect(result.prompt).toContain("Image 5 is a photo of the real room")
    expect(result.prompt).toContain("Images 3–4 are product photos")
    expect(result.roomPhotosFailed).toBe(0)
  })

  it("drops room photos that fail to load or do not fit", async () => {
    const renderer = fakeRenderer({ maxInputImages: 3 })
    const ok = { load: vi.fn(async () => ({ data: JPEG, mime: "image/jpeg" })) }
    const broken = {
      load: vi.fn(async (): Promise<{ data: Buffer; mime: string }> => {
        throw new Error("gone")
      }),
    }
    const result = await generatePhotoreal(
      makeInput({ renderer, roomPhotos: [broken, ok, ok] })
    )
    // 3 slots: clay, id, and one room photo (the broken one) — no references.
    expect(renderer.requests[0]!.images.map((i) => i.role)).toEqual([
      "clay",
      "id",
    ])
    expect(result.roomPhotosFailed).toBe(1)
    expect(result.references).toEqual([])
    expect(result.prompt).not.toContain("real room")
  })

  it("follows the renderer's id-map preference unless told otherwise", async () => {
    const gemini = fakeRenderer({ prefersIdPass: false })
    const auto = await generatePhotoreal(makeInput({ renderer: gemini }))
    expect(gemini.requests[0]!.images.map((i) => i.role)).not.toContain("id")
    expect(auto.prompt).not.toContain("ID map")
    expect(auto.references[0]!.imageIndex).toBe(2)

    await generatePhotoreal(makeInput({ renderer: gemini, idPass: "send" }))
    expect(gemini.requests[1]!.images[1]!.role).toBe("id")

    const openai = fakeRenderer()
    await generatePhotoreal(makeInput({ renderer: openai, idPass: "omit" }))
    await generatePhotoreal(makeInput({ renderer: openai }))
    expect(openai.requests[0]!.images.map((i) => i.role)).not.toContain("id")
    expect(openai.requests[1]!.images[1]!.role).toBe("id")
  })
})
