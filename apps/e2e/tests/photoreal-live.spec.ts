import type { Id } from "@roomer/backend/convex/_generated/dataModel"

import { api, convex, expect, test } from "../fixtures"
import { connectMcp } from "../fixtures/mcp"
import { pngSize } from "../fixtures/png"

/**
 * One real photoreal render through AI Gateway — the only spec that costs
 * money, so it never runs by default. Opt in with
 *
 *   E2E_PHOTOREAL_LIVE=1 pnpm e2e tests/photoreal-live.spec.ts
 *
 * which starts the e2e Next server without the photoreal stub (an already
 * running stubbed server on :3100 is detected below) and needs
 * AI_GATEWAY_API_KEY in the repo-root .env.local. Kept cheap: the fast
 * model, low quality, and the smallest image gpt-image-2.5 makes.
 */

const LIVE = process.env.E2E_PHOTOREAL_LIVE === "1"
const MODEL = "openai/gpt-image-2.5-flare"
/** gpt-image-2.5's minimum pixel budget (655,360 px) at 16:10. */
const SIZE = { width: 1024, height: 640 }

test.skip(!LIVE, "Live photoreal renders cost money; set E2E_PHOTOREAL_LIVE=1")

test("one real low-quality render comes back from the image model", async ({
  livingRoom,
}) => {
  test.setTimeout(300_000)
  const mcp = await connectMcp()
  try {
    const result = await mcp.call("render_photoreal", {
      layoutId: livingRoom.layoutId,
      camera: "from-d2",
      model: MODEL,
      quality: "low",
      size: SIZE,
    })
    expect(result.isError, result.text).toBe(false)
    expect(
      result.structured.model,
      "The server on :3100 stubs photoreal renders (PHOTOREAL_STUB=1). Stop it so Playwright starts one without the stub, then rerun with E2E_PHOTOREAL_LIVE=1."
    ).toBe(MODEL)

    expect(result.images).toHaveLength(1)
    const size = pngSize(result.images[0]!.data)
    expect(size.width * size.height).toBeGreaterThanOrEqual(
      SIZE.width * SIZE.height
    )
    expect(size.width).toBeGreaterThan(size.height)

    const record = await convex.query(api.renders.get, {
      renderId: result.structured.renderId as Id<"renders">,
    })
    expect(record).toMatchObject({
      kind: "photoreal",
      status: "done",
      model: MODEL,
      quality: "low",
    })
    expect(record?.outputUrl).toBeTruthy()
  } finally {
    await mcp.close()
  }
})
