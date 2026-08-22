import { describe, expect, test } from "vitest"

import { getSnapshot, types } from "../../src/index.ts"

// The companion to __tests__/types/create-args.test-d.ts: that file asserts a zero-argument
// `create()` compiles for every type that supplies its own default snapshot, and this one
// asserts the runtime agrees, so the two cannot drift apart.
describe("create() with no snapshot, for types that default their own", () => {
  test("array defaults to empty", () => {
    expect(getSnapshot(types.array(types.string).create())).toEqual([])
  })

  test("map defaults to empty", () => {
    expect(getSnapshot(types.map(types.string).create())).toEqual({})
  })

  test("optional falls back to its default", () => {
    expect(types.optional(types.string, "x").create()).toBe("x")
    expect(
      getSnapshot(
        types.optional(types.model({ a: types.string }), { a: "x" }).create()
      )
    ).toEqual({ a: "x" })
  })

  test("maybe and maybeNull produce the empty value", () => {
    expect(types.maybe(types.string).create()).toBeUndefined()
    expect(types.maybeNull(types.string).create()).toBeNull()
  })

  test("stripDefault falls back to its default", () => {
    const T = types.stripDefault(types.model({ a: types.string }), { a: "x" })
    expect(getSnapshot(T.create())).toEqual({ a: "x" })
  })

  test("a model whose every prop defaults", () => {
    const T = types.model({
      list: types.array(types.string),
      opt: types.optional(types.string, "x")
    })
    expect(getSnapshot(T.create())).toEqual({ list: [], opt: "x" })
  })

  // dev-only: typecheckInternal is a no-op under NODE_ENV=production, where the same call
  // quietly yields an instance with `a: undefined` instead of throwing. The compile error is
  // the only thing catching it in a production build, which is the argument for keeping the
  // signature strict here rather than relaxing it everywhere.
  describe.runIf(process.env.NODE_ENV !== "production")(
    "in development",
    () => {
      test("a required prop still throws when the snapshot is omitted", () => {
        const T = types.model({ a: types.string })
        // @ts-expect-error the compile error this throw is the runtime counterpart of
        expect(() => T.create()).toThrow()
      })
    }
  )
})
