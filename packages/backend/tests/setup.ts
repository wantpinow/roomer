// Declare Vite's import.meta.glob for tsc (only available at Vitest runtime)
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>
  }
}

import {
  LIVING_ROOM_CEILING_HEIGHT,
  LIVING_ROOM_FEATURES,
  LIVING_ROOM_FINISHES,
  LIVING_ROOM_MEASUREMENTS,
  LIVING_ROOM_NAME,
  LIVING_ROOM_SKIRTING,
  TEST_ASSETS,
} from "@roomer/core/fixtures"
import { convexTest } from "convex-test"
import { ConvexError } from "convex/values"
import { expect, vi } from "vitest"

import type { Id } from "../convex/_generated/dataModel"
import { doCreateAsset } from "../convex/assets"
import type { AppErrorCode, AppErrorData } from "../convex/errors"
import { doCreateLayout } from "../convex/layouts"
import { doCreateRoom } from "../convex/rooms"
import schema from "../convex/schema"

// Every Convex module, discovered by Vite. The glob is relative to THIS file
// (tests/setup.ts), so ../convex/ reaches the function files. Tests live
// outside convex/ so the Convex bundler never tries to deploy them.
const modules = import.meta.glob("../convex/**/*.*s")

/** A fresh in-memory Convex deployment for one test. */
export function createTestConvex() {
  return convexTest(schema, modules)
}

/** Concrete type for the test harness — use this for all helper parameter types. */
export type TestConvex = ReturnType<typeof createTestConvex>

/** A stored file, for fields that need a real `_storage` id. */
export async function fakeStorageId(
  t: TestConvex,
  contents = "test"
): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([contents])))
}

/** Run every scheduled function (re-lints) to completion. Needs fake timers. */
export async function finishScheduled(t: TestConvex): Promise<void> {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
}

/** Patrick's living room from the core fixtures. */
export async function createLivingRoom(t: TestConvex): Promise<Id<"rooms">> {
  const { roomId } = await t.run(async (ctx) =>
    doCreateRoom(ctx, {
      name: LIVING_ROOM_NAME,
      ceilingHeight: LIVING_ROOM_CEILING_HEIGHT,
      measurements: LIVING_ROOM_MEASUREMENTS,
      skirting: LIVING_ROOM_SKIRTING,
      features: LIVING_ROOM_FEATURES,
      finishes: LIVING_ROOM_FINISHES,
    })
  )
  return roomId
}

export type TestAssetName = keyof typeof TEST_ASSETS

/** One of the core test assets, stored under key `test-<name>`. */
export async function createTestAsset(
  t: TestConvex,
  name: TestAssetName,
  overrides: { key?: string; price?: number } = {}
): Promise<Id<"assets">> {
  const spec = TEST_ASSETS[name]
  const { assetId } = await t.run(async (ctx) =>
    doCreateAsset(ctx, {
      ...spec,
      key:
        overrides.key ??
        `test-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
      source: "library",
      ...(overrides.price !== undefined
        ? {
            product: {
              url: "https://example.com/item",
              price: overrides.price,
              currency: "GBP",
              dimsSource: "listing" as const,
            },
          }
        : {}),
    })
  )
  return assetId
}

/** An empty layout in a room. */
export async function createLayout(
  t: TestConvex,
  roomId: Id<"rooms">,
  name = "Test layout"
): Promise<Id<"layouts">> {
  const { layoutId } = await t.run(async (ctx) =>
    doCreateLayout(ctx, { roomId, name, actor: "agent" })
  )
  return layoutId
}

/**
 * Await a rejection and check it is an app error with the given code (and,
 * when given, a message containing `message`). Returns the error data for
 * further assertions.
 */
export async function expectAppError(
  promise: Promise<unknown>,
  code: AppErrorCode,
  message?: string
): Promise<AppErrorData> {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e
  )
  if (!(error instanceof ConvexError)) {
    throw new Error(`expected a ConvexError, got: ${String(error)}`)
  }
  const data: AppErrorData = error.data
  expect(data.code).toBe(code)
  if (message !== undefined) expect(data.message).toContain(message)
  return data
}
