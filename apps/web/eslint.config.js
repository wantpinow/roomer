import { nextJsConfig } from "@roomer/eslint-config/next-js"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    ignores: ["next-env.d.ts"],
  },
]
