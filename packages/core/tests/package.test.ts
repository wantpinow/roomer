import { describe, expect, it } from "vitest"

import * as core from "../src"

describe("@roomer/core", () => {
  it("loads its entry point without side effects", () => {
    expect(typeof core).toBe("object")
  })
})
