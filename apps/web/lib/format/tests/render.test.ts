import { describe, expect, it } from "vitest"

import { formatDuration, modelLabel } from "../render"

describe("modelLabel", () => {
  it("splits gateway ids into provider and name", () => {
    expect(modelLabel("openai/gpt-image-2.5-sunburst")).toEqual({
      provider: "OpenAI",
      name: "gpt-image-2.5-sunburst",
    })
    expect(modelLabel("bfl/flux-3-image").provider).toBe("Black Forest Labs")
  })

  it("keeps unknown providers as written", () => {
    expect(modelLabel("acme/painter-1")).toEqual({
      provider: "acme",
      name: "painter-1",
    })
  })

  it("names the stub", () => {
    expect(modelLabel("stub")).toEqual({
      provider: null,
      name: "stub renderer",
    })
  })
})

describe("formatDuration", () => {
  it("shows tenths under a second", () => {
    expect(formatDuration(800)).toBe("0.8 s")
    expect(formatDuration(950)).toBe("1.0 s")
  })

  it("shows whole seconds under a minute", () => {
    expect(formatDuration(42_300)).toBe("42 s")
  })

  it("shows minutes and seconds beyond", () => {
    expect(formatDuration(95_000)).toBe("1 min 35 s")
    expect(formatDuration(120_000)).toBe("2 min")
  })
})
