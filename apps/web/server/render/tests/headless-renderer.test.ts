import { afterEach, describe, expect, it, vi } from "vitest"

import {
  chromiumArgs,
  renderBaseUrl,
  renderGlBackend,
} from "../headless-renderer"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("renderGlBackend", () => {
  it("honours ROOMER_RENDER_GL", () => {
    vi.stubEnv("ROOMER_RENDER_GL", "swiftshader")
    expect(renderGlBackend()).toBe("swiftshader")
    vi.stubEnv("ROOMER_RENDER_GL", "default")
    expect(renderGlBackend()).toBe("default")
  })

  it("picks the GPU on macOS and SwiftShader elsewhere", () => {
    vi.stubEnv("ROOMER_RENDER_GL", "")
    expect(renderGlBackend()).toBe(
      process.platform === "darwin" ? "metal" : "swiftshader"
    )
  })
})

describe("chromiumArgs", () => {
  it("routes WebGL through the chosen ANGLE backend", () => {
    expect(chromiumArgs("metal")).toContain("--use-angle=metal")
    expect(chromiumArgs("swiftshader")).toEqual([
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ])
    expect(chromiumArgs("default")).toEqual([])
  })
})

describe("renderBaseUrl", () => {
  it("prefers RENDER_BASE_URL, then PORT, then 3000", () => {
    vi.stubEnv("RENDER_BASE_URL", "http://127.0.0.1:3100")
    expect(renderBaseUrl()).toBe("http://127.0.0.1:3100")
    vi.stubEnv("RENDER_BASE_URL", "")
    vi.stubEnv("PORT", "4000")
    expect(renderBaseUrl()).toBe("http://localhost:4000")
    vi.stubEnv("PORT", "")
    expect(renderBaseUrl()).toBe("http://localhost:3000")
  })
})
