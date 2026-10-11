import rule from "../require-cached-convex-query.js"
import { createRuleTester } from "./rule-tester.js"

createRuleTester().run("require-cached-convex-query", rule, {
  valid: [
    `import { useQuery } from "convex-helpers/react/cache"`,
    `import { useMutation, useAction } from "convex/react"`,
  ],
  invalid: [
    {
      code: `import { useQuery } from "convex/react"`,
      errors: [{ messageId: "uncachedQueryHook" }],
      output: `import { useQuery } from "convex-helpers/react/cache"`,
    },
    {
      // Non-query hooks stay on convex/react.
      code: `import { useMutation, useQuery } from "convex/react"`,
      errors: [{ messageId: "uncachedQueryHook" }],
      output: `import { useMutation } from "convex/react"\nimport { useQuery } from "convex-helpers/react/cache"`,
    },
    {
      // Merged into an existing cache import.
      code: `import { useQueries } from "convex-helpers/react/cache"\nimport { useQuery } from "convex/react"`,
      errors: [{ messageId: "uncachedQueryHook" }],
      output: `import { useQueries, useQuery } from "convex-helpers/react/cache"\n`,
    },
  ],
})
