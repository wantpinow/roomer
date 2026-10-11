import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Writable } from "node:stream"

import { describe, expect, it } from "vitest"

import {
  fileTimestamp,
  imageFileName,
  imageNames,
  parseCliArgs,
  readToolArgs,
  toolSummary,
  writeAll,
} from "../cli"

describe("parseCliArgs", () => {
  it("parses list, instructions and help", () => {
    expect(parseCliArgs(["--list"])).toEqual({ kind: "list", json: false })
    expect(parseCliArgs(["--list", "--json"])).toEqual({
      kind: "list",
      json: true,
    })
    expect(parseCliArgs(["--instructions"])).toEqual({ kind: "instructions" })
    expect(parseCliArgs([])).toEqual({ kind: "help" })
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" })
  })

  it("parses a tool call with JSON, --json and --out", () => {
    expect(
      parseCliArgs([
        "render_plan",
        '{"roomId":"r"}',
        "--json",
        "--out",
        "/tmp/x",
      ])
    ).toEqual({
      kind: "call",
      tool: "render_plan",
      args: '{"roomId":"r"}',
      json: true,
      outDir: "/tmp/x",
    })
    expect(parseCliArgs(["get_overview"])).toMatchObject({
      kind: "call",
      tool: "get_overview",
      args: undefined,
    })
  })

  it("rejects unknown options, a bare --out and unquoted JSON", () => {
    expect(() => parseCliArgs(["get_overview", "--verbose"])).toThrow(
      "Unknown option --verbose"
    )
    expect(() => parseCliArgs(["get_room", "--out"])).toThrow("--out needs")
    expect(() => parseCliArgs(["get_room", "{", "}"])).toThrow(
      "as one JSON string"
    )
  })
})

describe("readToolArgs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "roomer-cli-"))
  writeFileSync(path.join(dir, "args.json"), '{"asset":"generic-sofa"}')
  writeFileSync(path.join(dir, "list.json"), "[1]")

  it("reads inline JSON and treats nothing as {}", () => {
    expect(readToolArgs('{"a":1}', [])).toEqual({ a: 1 })
    expect(readToolArgs(undefined, [])).toEqual({})
    expect(readToolArgs("  ", [])).toEqual({})
  })

  it("reads @file from the first base it exists under", () => {
    expect(readToolArgs("@args.json", ["/nope", dir])).toEqual({
      asset: "generic-sofa",
    })
    expect(readToolArgs(`@${path.join(dir, "args.json")}`, [])).toEqual({
      asset: "generic-sofa",
    })
    expect(() => readToolArgs("@missing.json", [dir])).toThrow(
      "Can't find missing.json"
    )
  })

  it("refuses invalid JSON and non-objects", () => {
    expect(() => readToolArgs("{nope", [])).toThrow("aren't valid JSON")
    expect(() => readToolArgs("@list.json", [dir])).toThrow(
      "must be a JSON object"
    )
  })
})

describe("image file names", () => {
  it("stamps local time, tool and index", () => {
    const date = new Date(2026, 9, 11, 9, 5, 7)
    expect(fileTimestamp(date)).toBe("20261011-090507")
    expect(imageFileName(date, "render_view", 2, "image/png")).toBe(
      "20261011-090507-render_view-2.png"
    )
    expect(imageFileName(date, "x", 1, "image/jpeg")).toMatch(/\.jpg$/)
  })

  it("uses the tool's name for the image when it gives one", () => {
    const date = new Date(2026, 9, 11, 9, 5, 7)
    expect(
      imageFileName(
        date,
        "create_asset",
        5,
        "image/png",
        "castlery-avery-chair-comparison"
      )
    ).toBe("20261011-090507-create_asset-castlery-avery-chair-comparison.png")
    expect(imageFileName(date, "x", 2, "image/png", "../../etc passwd")).toBe(
      "20261011-090507-x-etc-passwd.png"
    )
    expect(imageFileName(date, "x", 3, "image/png", "///")).toBe(
      "20261011-090507-x-3.png"
    )
  })
})

describe("imageNames", () => {
  it("reads one name per image from structuredContent", () => {
    expect(imageNames({ imageNames: ["a-front", "a-iso"] }, 2)).toEqual([
      "a-front",
      "a-iso",
    ])
  })

  it("ignores missing or mismatched names", () => {
    expect(imageNames(undefined, 2)).toEqual([undefined, undefined])
    expect(imageNames({ imageNames: ["only-one"] }, 2)).toEqual([
      undefined,
      undefined,
    ])
    expect(imageNames({ imageNames: [1, 2] }, 2)).toEqual([
      undefined,
      undefined,
    ])
  })
})

describe("writeAll", () => {
  /** A pipe-like stream that takes 1KB per tick, like a slow reader. */
  function slowPipe() {
    const chunks: Buffer[] = []
    const stream = new Writable({
      highWaterMark: 1024,
      write(chunk: Buffer, _encoding, callback) {
        setTimeout(() => {
          chunks.push(chunk)
          callback()
        }, 1)
      },
    })
    return { stream, received: () => Buffer.concat(chunks).length }
  }

  it("resolves only once the stream has taken every byte", async () => {
    const pipe = slowPipe()
    const big = "x".repeat(300 * 1024)
    const done = writeAll(pipe.stream, big)
    // Most of it is still buffered right after the write…
    expect(pipe.received()).toBeLessThan(big.length)
    await done
    // …and all of it has gone through when the promise settles.
    expect(pipe.received()).toBe(big.length)
  })

  it("rejects when the stream fails", async () => {
    const broken = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error("EPIPE"))
      },
    })
    broken.on("error", () => undefined)
    await expect(writeAll(broken, "hello")).rejects.toThrow("EPIPE")
  })
})

describe("toolSummary", () => {
  it("shows the name, title and first sentence", () => {
    expect(
      toolSummary({
        name: "get_overview",
        title: "Overview",
        description: "Start here. Lists rooms.",
      })
    ).toBe("get_overview — Overview: Start here.")
    expect(toolSummary({ name: "x" })).toBe("x")
  })
})
