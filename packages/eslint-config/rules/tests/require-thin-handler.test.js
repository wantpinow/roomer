import rule from "../require-thin-handler.js"
import { createRuleTester } from "./rule-tester.js"

const convexFile = "/repo/packages/backend/convex/rooms.ts"

createRuleTester().run("require-thin-handler", rule, {
  valid: [
    {
      // The canonical shape: the handler only forwards ctx to a helper.
      code: `export const get = appQuery({
        args: {},
        handler: async (ctx, args) => {
          return await doGetRoom(ctx, args)
        },
      })`,
      filename: convexFile,
    },
    {
      // Helpers own the logic, so they may touch ctx.db freely.
      code: `export async function doGetRoom(ctx) {
        return await ctx.db.query("rooms").first()
      }`,
      filename: convexFile,
    },
    {
      // Infrastructure files are exempt.
      code: `export const x = appQuery({ args: {}, handler: async (ctx) => ctx.db.query("a").first() })`,
      filename: "/repo/packages/backend/convex/functions.ts",
    },
    {
      // Files outside convex/ are not Convex functions.
      code: `export const x = appQuery({ args: {}, handler: async (ctx) => ctx.db.query("a").first() })`,
      filename: "/repo/packages/backend/tests/rooms.test.ts",
    },
  ],
  invalid: [
    {
      code: `export const get = appQuery({
        args: {},
        handler: async (ctx) => {
          return await ctx.db.query("rooms").first()
        },
      })`,
      filename: convexFile,
      errors: [{ messageId: "directCtxAccess", data: { property: "db" } }],
    },
    {
      code: `export const run = appAction({
        args: {},
        handler: async (ctx) => {
          await ctx.runMutation(internal.rooms.touch, {})
          await ctx.scheduler.runAfter(0, internal.rooms.touch, {})
        },
      })`,
      filename: convexFile,
      errors: [
        { messageId: "directCtxAccess", data: { property: "runMutation" } },
        { messageId: "directCtxAccess", data: { property: "scheduler" } },
      ],
    },
    {
      // A renamed ctx parameter is still tracked.
      code: `export const get = appQuery({
        args: {},
        handler: async (c) => c.storage.getUrl("x"),
      })`,
      filename: convexFile,
      errors: [{ messageId: "directCtxAccess", data: { property: "storage" } }],
    },
  ],
})
