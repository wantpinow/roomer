import { RuleTester } from "eslint"
import tsParser from "@typescript-eslint/parser"
import { describe, it } from "vitest"

// RuleTester looks for mocha-style globals; vitest keeps them as imports.
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

/** A tester that parses TypeScript + JSX, which is what every app file is. */
export function createRuleTester() {
  return new RuleTester({
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  })
}
