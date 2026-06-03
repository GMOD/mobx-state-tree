import { test, expect, afterEach } from "vitest"

import { types, setTypeChecking } from "../../src"

afterEach(() => {
  setTypeChecking(undefined)
})

const Model = types.model({ width: types.number })

const throwsOnBadCreate = () => {
  try {
    Model.create({ width: "nope" } as any)
    return false
  } catch {
    return true
  }
}

// the ambient default depends on dev/prod build mode, so capture it rather
// than hardcode it; the override behavior below must hold in either mode
const defaultThrows = throwsOnBadCreate()

test("setTypeChecking(true) forces type-checking on regardless of mode", () => {
  setTypeChecking(true)
  expect(throwsOnBadCreate()).toBe(true)
})

test("setTypeChecking(false) forces type-checking off regardless of mode", () => {
  setTypeChecking(false)
  expect(throwsOnBadCreate()).toBe(false)
})

test("setTypeChecking(undefined) restores the ambient default", () => {
  setTypeChecking(false)
  setTypeChecking(undefined)
  expect(throwsOnBadCreate()).toBe(defaultThrows)
})
