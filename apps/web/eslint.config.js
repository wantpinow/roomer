import { nextJsConfig } from "@roomer/eslint-config/next-js"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    ignores: ["next-env.d.ts"],
  },
  {
    // React Three Fiber JSX (<mesh geometry={…} castShadow />) takes three.js
    // props that the DOM-only rule doesn't know.
    files: ["components/scene/**/*.tsx", "app/render/**/*.tsx"],
    rules: { "react/no-unknown-property": "off" },
  },
]
