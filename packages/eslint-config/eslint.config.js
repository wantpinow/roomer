import globals from "globals"

import { config } from "./base.js"

/** The configs lint themselves with the base config, in a Node context. */
export default [
  ...config,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
