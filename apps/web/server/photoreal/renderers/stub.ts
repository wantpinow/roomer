import { PNG } from "pngjs"

import { PhotorealError } from "../errors"
import { isPng } from "../png"
import type { ImageRenderer } from "../types"

// The free, deterministic test double (PHOTOREAL_STUB=1, the e2e default):
// returns the clay pass with a warm tint and a small "STUB" mark in the top
// left corner, at the clay pass's size. Same input → same bytes, no network.

export const STUB_MODEL = "stub"

/** Effectively unlimited; the stub only looks at the clay pass. */
export const STUB_MAX_INPUT_IMAGES = 16

/** Warm paper colour the clay is mixed towards, and how far. */
const WARM: readonly [number, number, number] = [244, 212, 166]
const WARM_MIX = 0.22

// 3×5 bitmaps, one string per row, for the letters of "STUB".
const GLYPHS: Record<string, readonly string[]> = {
  S: ["111", "100", "111", "001", "111"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  B: ["110", "101", "110", "101", "110"],
}
const MARK_TEXT = "STUB"
const MARK_SCALE = 3
const MARK_MARGIN = 6
const MARK_PADDING = 4
const MARK_INK: readonly [number, number, number] = [255, 255, 255]
const MARK_BACKGROUND: readonly [number, number, number] = [90, 62, 46]

function setPixel(
  png: PNG,
  x: number,
  y: number,
  [r, g, b]: readonly [number, number, number]
): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
  const i = (y * png.width + x) * 4
  png.data[i] = r
  png.data[i + 1] = g
  png.data[i + 2] = b
  png.data[i + 3] = 255
}

function tintWarm(png: PNG): void {
  for (let i = 0; i < png.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      png.data[i + c] = Math.round(
        png.data[i + c]! * (1 - WARM_MIX) + WARM[c]! * WARM_MIX
      )
    }
    png.data[i + 3] = 255
  }
}

function drawMark(png: PNG): void {
  const glyphWidth = 3 * MARK_SCALE
  const advance = glyphWidth + MARK_SCALE
  const textWidth = MARK_TEXT.length * advance - MARK_SCALE
  const textHeight = 5 * MARK_SCALE
  const x0 = MARK_MARGIN
  const y0 = MARK_MARGIN
  for (let y = 0; y < textHeight + 2 * MARK_PADDING; y++) {
    for (let x = 0; x < textWidth + 2 * MARK_PADDING; x++) {
      setPixel(png, x0 + x, y0 + y, MARK_BACKGROUND)
    }
  }
  ;[...MARK_TEXT].forEach((letter, index) => {
    const rows = GLYPHS[letter]!
    rows.forEach((row, gy) => {
      ;[...row].forEach((bit, gx) => {
        if (bit !== "1") return
        for (let sy = 0; sy < MARK_SCALE; sy++) {
          for (let sx = 0; sx < MARK_SCALE; sx++) {
            setPixel(
              png,
              x0 + MARK_PADDING + index * advance + gx * MARK_SCALE + sx,
              y0 + MARK_PADDING + gy * MARK_SCALE + sy,
              MARK_INK
            )
          }
        }
      })
    })
  })
}

/** The stub's picture: the clay pass, warmed, with a STUB mark. */
export function stubPhotoreal(clay: Buffer): Buffer {
  const png = PNG.sync.read(clay)
  tintWarm(png)
  drawMark(png)
  return PNG.sync.write(png)
}

export function createStubRenderer(): ImageRenderer {
  return {
    id: STUB_MODEL,
    maxInputImages: STUB_MAX_INPUT_IMAGES,
    prefersIdPass: true,
    async render({ images, signal }) {
      signal?.throwIfAborted()
      const clay = images.find((image) => image.role === "clay")
      if (!clay || !isPng(clay.data)) {
        throw new PhotorealError(
          "BAD_REQUEST",
          "The stub renderer needs the clay pass as a PNG input image.",
          { model: STUB_MODEL }
        )
      }
      return { png: stubPhotoreal(clay.data), raw: { stub: true } }
    },
  }
}
