import "server-only"

import { api } from "@roomer/backend/convex/_generated/api"
import type { Id } from "@roomer/backend/convex/_generated/dataModel"
import { ConvexHttpClient } from "convex/browser"
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server"

import { env } from "@/env"

import { downloadImage, uploadToStorage } from "./pipelines/files"
import type { DownloadedImage } from "./pipelines/files"

// The web server's door into Convex. `RoomerApi` is a thin, typed facade —
// one method per backend function the MCP tools and pipelines use — so every
// handler depends on an interface that tests can fake, never on the HTTP
// client itself. Types are derived from the generated `api`, never restated.

/** `(args) => Promise<result>` for one Convex function. */
type Call<Fn extends FunctionReference<"query" | "mutation" | "action">> = (
  args: FunctionArgs<Fn>
) => Promise<FunctionReturnType<Fn>>

export interface RoomerApi {
  rooms: {
    list: Call<typeof api.rooms.list>
    get: Call<typeof api.rooms.get>
    create: Call<typeof api.rooms.create>
    setShell: Call<typeof api.rooms.setShell>
    applyShellChanges: Call<typeof api.rooms.applyShellChanges>
    upsertCamera: Call<typeof api.rooms.upsertCamera>
    addReferencePhotos: Call<typeof api.rooms.addReferencePhotos>
  }
  assets: {
    list: Call<typeof api.assets.list>
    search: Call<typeof api.assets.search>
    get: Call<typeof api.assets.get>
    getByKey: Call<typeof api.assets.getByKey>
    create: Call<typeof api.assets.create>
    update: Call<typeof api.assets.update>
    setPreviews: Call<typeof api.assets.setPreviews>
    addImagesFromUrls: Call<typeof api.assets.addImagesFromUrls>
  }
  layouts: {
    listByRoom: Call<typeof api.layouts.listByRoom>
    get: Call<typeof api.layouts.get>
    create: Call<typeof api.layouts.create>
    update: Call<typeof api.layouts.update>
    applyChanges: Call<typeof api.layouts.applyChanges>
  }
  renders: {
    create: Call<typeof api.renders.create>
    complete: Call<typeof api.renders.complete>
    fail: Call<typeof api.renders.fail>
    listByLayout: Call<typeof api.renders.listByLayout>
    get: Call<typeof api.renders.get>
  }
  files: {
    /** Stores bytes in Convex file storage. */
    upload(data: Uint8Array, contentType: string): Promise<Id<"_storage">>
    /** Fetches an image over http(s) (product photos, stored files). */
    download(url: string): Promise<DownloadedImage>
  }
}

// Shapes the tools format, derived from what the backend returns.
export type RoomSummary = FunctionReturnType<typeof api.rooms.list>[number]
export type RoomDetail = NonNullable<FunctionReturnType<typeof api.rooms.get>>
export type AssetSummary = FunctionReturnType<typeof api.assets.list>[number]
export type AssetDetail = NonNullable<FunctionReturnType<typeof api.assets.get>>
export type LayoutSummary = FunctionReturnType<
  typeof api.layouts.listByRoom
>[number]
export type LayoutDetail = NonNullable<
  FunctionReturnType<typeof api.layouts.get>
>
export type LayoutAssetEntry = LayoutDetail["assets"][string]
export type ApplyChangesResult = FunctionReturnType<
  typeof api.layouts.applyChanges
>
export type RenderRecord = FunctionReturnType<
  typeof api.renders.listByLayout
>[number]
export type AddImagesResult = FunctionReturnType<
  typeof api.assets.addImagesFromUrls
>

export function convexUrl(): string {
  return env.CONVEX_URL ?? env.NEXT_PUBLIC_CONVEX_URL
}

export function createConvexClient(
  url: string = convexUrl()
): ConvexHttpClient {
  return new ConvexHttpClient(url, { logger: false })
}

export function createRoomerApi(
  client: ConvexHttpClient,
  fetchImpl: typeof fetch = fetch
): RoomerApi {
  return {
    rooms: {
      list: (args) => client.query(api.rooms.list, args),
      get: (args) => client.query(api.rooms.get, args),
      create: (args) => client.mutation(api.rooms.create, args),
      setShell: (args) => client.mutation(api.rooms.setShell, args),
      applyShellChanges: (args) =>
        client.mutation(api.rooms.applyShellChanges, args),
      upsertCamera: (args) => client.mutation(api.rooms.upsertCamera, args),
      addReferencePhotos: (args) =>
        client.mutation(api.rooms.addReferencePhotos, args),
    },
    assets: {
      list: (args) => client.query(api.assets.list, args),
      search: (args) => client.query(api.assets.search, args),
      get: (args) => client.query(api.assets.get, args),
      getByKey: (args) => client.query(api.assets.getByKey, args),
      create: (args) => client.mutation(api.assets.create, args),
      update: (args) => client.mutation(api.assets.update, args),
      setPreviews: (args) => client.mutation(api.assets.setPreviews, args),
      addImagesFromUrls: (args) =>
        client.action(api.assets.addImagesFromUrls, args),
    },
    layouts: {
      listByRoom: (args) => client.query(api.layouts.listByRoom, args),
      get: (args) => client.query(api.layouts.get, args),
      create: (args) => client.mutation(api.layouts.create, args),
      update: (args) => client.mutation(api.layouts.update, args),
      applyChanges: (args) => client.mutation(api.layouts.applyChanges, args),
    },
    renders: {
      create: (args) => client.mutation(api.renders.create, args),
      complete: (args) => client.mutation(api.renders.complete, args),
      fail: (args) => client.mutation(api.renders.fail, args),
      listByLayout: (args) => client.query(api.renders.listByLayout, args),
      get: (args) => client.query(api.renders.get, args),
    },
    files: {
      upload: async (data, contentType) => {
        const uploadUrl = await client.mutation(api.files.generateUploadUrl, {})
        const storageId = await uploadToStorage(
          uploadUrl,
          data,
          contentType,
          fetchImpl
        )
        // The upload endpoint answers with the id as a plain string.
        return storageId as Id<"_storage">
      },
      download: (url) => downloadImage(url, fetchImpl),
    },
  }
}

let shared: RoomerApi | undefined

/**
 * The server's facade. Module-scoped, not on globalThis: a ConvexHttpClient
 * holds no connection, and a hot reload of this module should pick up its
 * new code rather than keep serving the old one.
 */
export function getRoomerApi(): RoomerApi {
  shared ??= createRoomerApi(createConvexClient())
  return shared
}
