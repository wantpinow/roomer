import { type Browser, chromium, type Page } from "playwright"

import {
  ASSET_PREVIEW_VIEWS,
  type AssetPreviewView,
  type RenderAssetScene,
  type RenderScene,
} from "@/lib/scene/types"

import { pngFromDataUrl, pngSize } from "./png"

// Headless Chromium driving the /render page. One browser and one page live
// on `globalThis` (so Next's hot reload doesn't leak browsers); renders run
// one at a time through a promise queue; a crashed or hung browser is
// thrown away and relaunched on the next call.
//
// This module has no Next-specific imports so scripts can use it from plain
// Node (`tsx`); app code imports it through ./renderer.ts, which adds the
// `server-only` guard.

export const RENDER_TIMEOUT_MS = 60_000
/** First load can include Next compiling /render in dev. */
export const STARTUP_TIMEOUT_MS = 180_000
export const DEFAULT_PREVIEW_SIZE = { width: 768, height: 768 } as const

/**
 * How Chromium gets WebGL. `metal` uses the Mac's GPU through ANGLE (fast);
 * `swiftshader` is the portable software rasteriser (CI, Linux); `default`
 * leaves it to Chromium (headless picks SwiftShader). Override with
 * ROOMER_RENDER_GL.
 */
export type RenderGlBackend = "metal" | "swiftshader" | "default"

export function renderGlBackend(): RenderGlBackend {
  const requested = process.env.ROOMER_RENDER_GL
  if (
    requested === "metal" ||
    requested === "swiftshader" ||
    requested === "default"
  ) {
    return requested
  }
  return process.platform === "darwin" ? "metal" : "swiftshader"
}

export function chromiumArgs(backend: RenderGlBackend): string[] {
  switch (backend) {
    case "metal":
      return ["--use-angle=metal", "--ignore-gpu-blocklist"]
    case "swiftshader":
      return ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    case "default":
      return []
  }
}

export function renderBaseUrl(): string {
  return (
    process.env.RENDER_BASE_URL ||
    `http://localhost:${process.env.PORT || 3000}`
  )
}

interface RendererState {
  browser: Browser | null
  page: Page | null
  starting: Promise<Page> | null
  queue: Promise<unknown>
}

declare global {
  var __roomerRenderer: RendererState | undefined
}

function state(): RendererState {
  globalThis.__roomerRenderer ??= {
    browser: null,
    page: null,
    starting: null,
    queue: Promise.resolve(),
  }
  return globalThis.__roomerRenderer
}

class RenderTimeoutError extends Error {}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  what: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RenderTimeoutError(`${what} timed out after ${ms} ms`)),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function launch(): Promise<Page> {
  const s = state()
  const backend = renderGlBackend()
  const browser = await chromium.launch({
    headless: true,
    args: chromiumArgs(backend),
  })
  browser.on("disconnected", () => {
    if (s.browser === browser) {
      s.browser = null
      s.page = null
    }
  })
  s.browser = browser
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1,
  })
  page.on("pageerror", (error) =>
    console.error("[renderer] page error:", error.message)
  )
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("[renderer] console:", message.text())
  })
  const url = `${renderBaseUrl()}/render`
  await page.goto(url, { waitUntil: "load", timeout: STARTUP_TIMEOUT_MS })
  await page.waitForFunction(() => window.roomer?.ready === true, null, {
    timeout: STARTUP_TIMEOUT_MS,
  })
  s.page = page
  console.info(`[renderer] ready (${backend}) at ${url}`)
  return page
}

async function getPage(): Promise<Page> {
  const s = state()
  if (s.page && !s.page.isClosed() && s.browser?.isConnected()) return s.page
  s.starting ??= launch().finally(() => {
    s.starting = null
  })
  try {
    return await s.starting
  } catch (error) {
    await closeRenderer()
    throw error
  }
}

function isCrash(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Target (page, context or browser )?(has been )?closed|Browser has been closed|crash/i.test(
    message
  )
}

/**
 * Runs `task` against the render page, one task at a time. A timeout tears
 * the browser down (it may be wedged); a crash relaunches and retries once.
 */
function enqueue<T>(
  what: string,
  task: (page: Page) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const s = state()
  const attempt = async (): Promise<T> => {
    const page = await getPage()
    return withTimeout(task(page), timeoutMs, what)
  }
  const run = async (): Promise<T> => {
    try {
      return await attempt()
    } catch (error) {
      if (error instanceof RenderTimeoutError) {
        await closeRenderer()
        throw error
      }
      if (isCrash(error)) {
        console.warn(`[renderer] browser went away during ${what}; relaunching`)
        await closeRenderer()
        return attempt()
      }
      throw error
    }
  }
  const result = s.queue.then(run, run)
  s.queue = result.catch(() => undefined)
  return result
}

function checkedPng(dataUrl: string, width: number, height: number): Buffer {
  const png = pngFromDataUrl(dataUrl)
  const size = pngSize(png)
  if (size.width !== width || size.height !== height) {
    throw new Error(
      `Render came back ${size.width}×${size.height}, expected ${width}×${height}`
    )
  }
  return png
}

/** Renders a room scene to PNG bytes at exactly `scene.width × scene.height`. */
export function renderScene(
  scene: RenderScene,
  { timeoutMs = RENDER_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<Buffer> {
  return enqueue(
    `${scene.pass} render`,
    async (page) => {
      const dataUrl = await page.evaluate(
        (input) => window.roomer!.render(input),
        scene
      )
      return checkedPng(dataUrl, scene.width, scene.height)
    },
    timeoutMs
  )
}

/** Renders asset previews (clay, studio backdrop), one PNG per view. */
export async function renderAssetPreviews(
  asset: RenderAssetScene["asset"],
  views: readonly AssetPreviewView[] = ASSET_PREVIEW_VIEWS,
  size: { width: number; height: number } = DEFAULT_PREVIEW_SIZE,
  { timeoutMs = RENDER_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<{ view: AssetPreviewView; png: Buffer }[]> {
  const out: { view: AssetPreviewView; png: Buffer }[] = []
  for (const view of views) {
    const scene: RenderAssetScene = { asset, view, ...size }
    const png = await enqueue(
      `asset preview (${view})`,
      async (page) => {
        const dataUrl = await page.evaluate(
          (input) => window.roomer!.renderAsset(input),
          scene
        )
        return checkedPng(dataUrl, size.width, size.height)
      },
      timeoutMs
    )
    out.push({ view, png })
  }
  return out
}

/** Closes the browser (tests, scripts, shutdown). Safe to call repeatedly. */
export async function closeRenderer(): Promise<void> {
  const s = state()
  const browser = s.browser
  s.browser = null
  s.page = null
  if (browser) await browser.close().catch(() => undefined)
}
