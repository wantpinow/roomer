import { config as baseConfig } from "@roomer/eslint-config/base"
import requireThinHandler from "@roomer/eslint-config/rules/require-thin-handler.js"
import globals from "globals"

/**
 * Files allowed to import the raw `query` / `mutation` / `action` builders
 * from `./_generated/server`. Every other public function must use the
 * wrappers in convex/functions.ts, so that auth (later) is a one-place change.
 *
 * To add a file, add an entry here WITH the reason — the reason is required
 * so a reviewer can see why the file is allowed to bypass the wrappers.
 *
 * @type {Record<string, string>}
 */
const RAW_BUILDER_EXEMPTIONS = {
  "convex/functions.ts": "Defines the wrapped builders.",
  "convex/e2e.ts":
    "The e2e trapdoor is deliberately raw: its guard is E2E_TESTING_ENABLED plus a loopback check, not a wrapper.",
}

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ["convex/**/*.ts"],
    plugins: {
      "@roomer": {
        rules: {
          "require-thin-handler": requireThinHandler,
        },
      },
    },
    rules: {
      "@roomer/require-thin-handler": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./_generated/server"],
              importNames: ["query", "mutation", "action"],
              message:
                'Use appQuery/appMutation/appAction from "./functions" for public functions. To bypass them, add the file to RAW_BUILDER_EXEMPTIONS in packages/backend/eslint.config.js with a reason.',
            },
          ],
        },
      ],
    },
  },
  {
    files: Object.keys(RAW_BUILDER_EXEMPTIONS),
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Scripts run under Node (tsx).
    files: ["scripts/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    ignores: ["convex/_generated/**"],
  },
]
