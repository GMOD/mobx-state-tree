import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  getSnapshot,
  getType,
  isStateTreeNode,
  setTypeChecking,
  types
} from "../../src/index.ts"

// With type checking off, as in production, a union picks the member for a
// snapshot object by its raw shape instead of validating each one. It must
// still pick the member the full check would; these cases each took a later
// member and dropped the data meant for the earlier one.
describe("a union matched without type checking", () => {
  beforeEach(() => setTypeChecking(false))
  afterEach(() => setTypeChecking(undefined))

  const Other = types.model("Other", { o: 0 })

  test("hands a legacy snapshot to the member whose processor migrates it", () => {
    const X = types.model("X", { x: types.string })
    const legacy = (sn: any) => (sn.legacyX ? { x: sn.legacyX } : sn)
    const ByProcessor = types.model({
      u: types.union(
        types.snapshotProcessor(X, { preProcessor: legacy }),
        Other
      )
    })
    const ByModel = types.model({
      u: types.union(X.preProcessSnapshot(legacy), Other)
    })

    expect(
      getSnapshot(ByProcessor.create({ u: { legacyX: "hello" } as any }))
    ).toEqual({ u: { x: "hello" } })
    expect(
      getSnapshot(ByModel.create({ u: { legacyX: "hello" } as any }))
    ).toEqual({ u: { x: "hello" } })
  })

  test("does not require a frozen prop that accepts undefined", () => {
    const X = types.model("X", { raw: types.frozen(), tag: "" })
    const M = types.model({ u: types.union(X, Other) })

    const m = M.create({ u: { tag: "keep" } })

    expect(getType(m.u).name).toBe("X")
    expect(getSnapshot(m)).toEqual({ u: { tag: "keep" } })
  })

  test("asks a member it cannot read a model from", () => {
    const A = types.model("A", { a: types.number })
    const B = types.model("B", { b: 0 })

    const viaMaybe = types.model({ u: types.union(types.maybe(A), B) })
    expect(getSnapshot(viaMaybe.create({ u: { a: 7 } }))).toEqual({
      u: { a: 7 }
    })

    const viaFrozen = types.model({ u: types.union(types.frozen(), A) })
    const frozenValue = viaFrozen.create({ u: { a: 1 } }).u
    expect(isStateTreeNode(frozenValue)).toBe(false)
  })

  test("never runs a prop type's own code to read a snapshot's shape", () => {
    const Child = types
      .model("Child", { x: 0 })
      .preProcessSnapshot((sn: any) => ({ x: sn.x }))
    const A = types.model("A", { child: Child })
    const B = types.model("B", { b: 0 })
    const M = types.model({ u: types.union(A, B) })

    expect(getSnapshot(M.create({ u: { b: 1 } }))).toEqual({ u: { b: 1 } })
  })

  test("skips a member whose preprocessor throws on the value", () => {
    const Strict = types.model("Strict", { s: "" }).preProcessSnapshot(sn => {
      if (sn === undefined) {
        throw new Error("Strict needs a snapshot")
      }
      return sn
    })
    const M = types.model({ u: types.union(Strict, types.undefined) })

    expect(M.create({}).u).toBeUndefined()
  })

  test("still requires a frozen prop whose subtype refuses undefined", () => {
    const A = types.model("A", {
      s: types.union(types.frozen(types.string), types.number),
      b: 0
    })
    const B = types.model("B", { b: 0 })
    const M = types.model({ u: types.union(A, B) })

    expect(getType(M.create({ u: { b: 1 } }).u).name).toBe("B")
  })

  test("passes over a late member that is not defined yet", () => {
    const B = types.model("B", { b: 0 })
    const M = types.model({
      u: types.union(types.late(() => undefined as any), B)
    })

    expect(getSnapshot(M.create({ u: { b: 1 } }))).toEqual({ u: { b: 1 } })
  })

  test("names a member's own error when no member takes the value", () => {
    const A = types
      .model("A", { a: types.number })
      .preProcessSnapshot((sn: any) => {
        if (!sn.ok) {
          throw new Error("A needs ok")
        }
        return sn
      })
    const B = types.model("B", { b: types.number })
    const M = types.model({ u: types.union(A, B) })

    expect(() => M.create({ u: {} as any })).toThrow("A needs ok")
  })

  test("still skips members whose discriminator differs", () => {
    const A = types.model("A", { type: types.literal("a"), a: 0 })
    const B = types.model("B", { type: types.literal("b"), b: 0 })
    const M = types.model({ u: types.union(A, B) })

    expect(getType(M.create({ u: { type: "b" } }).u).name).toBe("B")
  })
})
