/**
 * The Convex validators in convex/validators.ts are derived from core's zod
 * schemas. These tests pin the derived types to zod's (modulo Convex ids,
 * which are branded strings in the backend and plain strings in core), so a
 * schema change can't silently desynchronise the database from the domain.
 */
import type { Change } from "@roomer/core/placement"
import type {
  AssetSpec,
  Camera,
  Finishes,
  LayoutOp,
  LintCounts,
  LintReport,
  NewRoom,
  Placement,
  RoomSpec,
  ShellMeasurements,
  ShellOp,
} from "@roomer/core/schema"
import type { Infer } from "convex/values"
import { describe, expect, expectTypeOf, it } from "vitest"

import type { Doc, Id } from "../convex/_generated/dataModel"
import {
  vAssetImage,
  vAssetSpec,
  vCamera,
  vChange,
  vFinishes,
  vLayoutOp,
  vLintCounts,
  vLintReport,
  vNewRoom,
  vRoomSpec,
  vShellMeasurements,
  vShellOp,
  vStoredPlacement,
  type AssetImage,
  type StoredPlacement,
} from "../convex/validators"

describe("derived validators", () => {
  it("infer exactly the zod types for domain shapes", () => {
    expectTypeOf<Infer<typeof vRoomSpec>>().toEqualTypeOf<RoomSpec>()
    expectTypeOf<Infer<typeof vNewRoom>>().toEqualTypeOf<NewRoom>()
    expectTypeOf<
      Infer<typeof vShellMeasurements>
    >().toEqualTypeOf<ShellMeasurements>()
    expectTypeOf<Infer<typeof vShellOp>>().toEqualTypeOf<ShellOp>()
    expectTypeOf<Infer<typeof vCamera>>().toEqualTypeOf<Camera>()
    expectTypeOf<Infer<typeof vFinishes>>().toEqualTypeOf<Finishes>()
    expectTypeOf<Infer<typeof vAssetSpec>>().toEqualTypeOf<AssetSpec>()
    expectTypeOf<Infer<typeof vLayoutOp>>().toEqualTypeOf<LayoutOp>()
    expectTypeOf<Infer<typeof vLintReport>>().toEqualTypeOf<LintReport>()
    expectTypeOf<Infer<typeof vLintCounts>>().toEqualTypeOf<LintCounts>()
    expectTypeOf<Infer<typeof vChange>>().toEqualTypeOf<Change>()
  })

  it("infer the backend's zod types, with Convex ids for references", () => {
    expectTypeOf<
      Infer<typeof vStoredPlacement>
    >().toEqualTypeOf<StoredPlacement>()
    expectTypeOf<Infer<typeof vAssetImage>>().toEqualTypeOf<AssetImage>()
    expectTypeOf<Infer<typeof vStoredPlacement>["assetId"]>().toEqualTypeOf<
      Id<"assets">
    >()
    expectTypeOf<Omit<StoredPlacement, "assetId">>().toEqualTypeOf<
      Omit<Placement, "assetId">
    >()
  })

  it("store documents whose domain fields are the core types", () => {
    expectTypeOf<Pick<Doc<"rooms">, keyof RoomSpec>>().toEqualTypeOf<RoomSpec>()
    expectTypeOf<
      Pick<Doc<"assets">, keyof AssetSpec>
    >().toEqualTypeOf<AssetSpec>()
    expectTypeOf<Doc<"layouts">["placements"]>().toEqualTypeOf<
      StoredPlacement[]
    >()
    expectTypeOf<Doc<"layouts">["lint"]>().toEqualTypeOf<LintReport>()
    expectTypeOf<Doc<"layoutEvents">["changes"]>().toEqualTypeOf<Change[]>()
  })

  it("map Convex ids to v.id validators at runtime", () => {
    expect(vStoredPlacement.fields.assetId).toMatchObject({
      kind: "id",
      tableName: "assets",
    })
    expect(vAssetImage.fields.storageId).toMatchObject({
      kind: "id",
      tableName: "_storage",
    })
  })
})
