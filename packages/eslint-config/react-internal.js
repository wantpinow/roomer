import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

import { config as baseConfig } from "./base.js"
import requireCachedConvexQuery from "./rules/require-cached-convex-query.js"

/**
 * A custom ESLint configuration for libraries that use React.
 *
 * @type {import("eslint").Linter.Config[]} */
export const config = [
  ...baseConfig,
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  {
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      // React scope no longer necessary with new JSX transform.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "@roomer": {
        rules: {
          "require-cached-convex-query": requireCachedConvexQuery,
        },
      },
    },
    rules: {
      // Every Convex query hook comes from convex-helpers/react/cache — see
      // rules/require-cached-convex-query.js. packages/ui reads no Convex, so
      // the rule is inert there today.
      "@roomer/require-cached-convex-query": "error",
    },
  },
]
