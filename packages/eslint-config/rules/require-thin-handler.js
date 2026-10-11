/**
 * ESLint rule: require-thin-handler
 *
 * Enforces that Convex function handler bodies do not access ctx.db,
 * ctx.scheduler, ctx.storage, ctx.runQuery, ctx.runMutation, ctx.runAction or
 * ctx.auth directly. Business logic must be extracted into exported `do*`
 * helper functions, which take `ctx` and are what the backend tests call.
 *
 * Allowed in handlers: passing ctx (and anything a wrapper injected into it)
 * through to helpers.
 *
 * This rule applies to the `handler:` property inside calls to Convex
 * builders (appQuery, appMutation, internalMutation, …) in
 * packages/backend/convex/*.ts. Ported from masterguest.
 */

const FORBIDDEN_CTX_PROPERTIES = new Set([
  "db",
  "scheduler",
  "storage",
  "runQuery",
  "runMutation",
  "runAction",
  "auth",
])

/** Infrastructure files that define wrappers or non-standard handlers. */
const EXCLUDED_FILES = new Set([
  "functions.ts", // defines the wrapper builders
  "seed.ts", // seeding scripts
])

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Convex handler functions must delegate to extracted helpers — no direct ctx.db/ctx.scheduler/ctx.storage access",
    },
    messages: {
      directCtxAccess:
        "Do not access `ctx.{{ property }}` directly inside a handler. Extract business logic into an exported `do*` helper function and call it from the handler. See CLAUDE.md 'Convex rules'.",
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename || context.getFilename()

    // Only apply to convex/*.ts files (not tests, not _generated)
    if (!/\/convex\/[^/]+\.ts$/.test(filename)) return {}
    if (filename.includes("_generated")) return {}

    const basename = filename.split("/").pop() ?? ""
    if (EXCLUDED_FILES.has(basename)) return {}

    // Track which scopes are "handler" functions. A stack, because handlers
    // could theoretically be nested.
    const handlerParamNames = []

    return {
      // Detect: { handler: async (ctx, args) => { ... } }
      "Property[key.name='handler']"(node) {
        const fn = node.value
        if (
          fn.type !== "ArrowFunctionExpression" &&
          fn.type !== "FunctionExpression"
        ) {
          return
        }

        // The name of the first parameter (usually "ctx"). A destructured
        // pattern can't be tracked easily; in this codebase it's always `ctx`.
        const firstParam = fn.params[0]
        if (!firstParam || firstParam.type !== "Identifier") return

        handlerParamNames.push({ paramName: firstParam.name, fnNode: fn })
      },

      "Property[key.name='handler']:exit"(node) {
        const top = handlerParamNames[handlerParamNames.length - 1]
        if (top && top.fnNode === node.value) handlerParamNames.pop()
      },

      // Check for ctx.db, ctx.scheduler, etc.
      MemberExpression(node) {
        if (handlerParamNames.length === 0) return

        const { paramName, fnNode } =
          handlerParamNames[handlerParamNames.length - 1]

        // Is this MemberExpression inside the handler function?
        let current = node
        let insideHandler = false
        while (current) {
          if (current === fnNode) {
            insideHandler = true
            break
          }
          current = current.parent
        }
        if (!insideHandler) return

        if (
          node.object.type === "Identifier" &&
          node.object.name === paramName &&
          node.property.type === "Identifier" &&
          FORBIDDEN_CTX_PROPERTIES.has(node.property.name)
        ) {
          context.report({
            node,
            messageId: "directCtxAccess",
            data: { property: node.property.name },
          })
        }
      },
    }
  },
}
