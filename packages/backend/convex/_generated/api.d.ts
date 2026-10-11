/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assets from "../assets.js";
import type * as compare from "../compare.js";
import type * as e2e from "../e2e.js";
import type * as errors from "../errors.js";
import type * as files from "../files.js";
import type * as functions from "../functions.js";
import type * as health from "../health.js";
import type * as layouts from "../layouts.js";
import type * as renders from "../renders.js";
import type * as rooms from "../rooms.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as seedFile from "../seedFile.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assets: typeof assets;
  compare: typeof compare;
  e2e: typeof e2e;
  errors: typeof errors;
  files: typeof files;
  functions: typeof functions;
  health: typeof health;
  layouts: typeof layouts;
  renders: typeof renders;
  rooms: typeof rooms;
  seed: typeof seed;
  seedData: typeof seedData;
  seedFile: typeof seedFile;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
