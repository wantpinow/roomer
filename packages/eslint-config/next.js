import js from "@eslint/js"
import pluginNext from "@next/eslint-plugin-next"
import eslintConfigPrettier from "eslint-config-prettier"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

import { config as baseConfig } from "./base.js"
import requireCachedConvexQuery from "./rules/require-cached-convex-query.js"
import requirePageMetadata from "./rules/require-page-metadata.js"

/**
 * A custom ESLint configuration for libraries that use Next.js.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const nextJsConfig = [
  ...baseConfig,
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    plugins: {
      "@next/next": pluginNext,
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
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
          "require-page-metadata": requirePageMetadata,
          "require-cached-convex-query": requireCachedConvexQuery,
        },
      },
    },
    rules: {
      // Every Convex query hook comes from convex-helpers/react/cache — see
      // rules/require-cached-convex-query.js.
      "@roomer/require-cached-convex-query": "error",
    },
  },
  {
    files: ["**/page.{ts,tsx,js,jsx}"],
    rules: {
      "@roomer/require-page-metadata": "error",
    },
  },
]
