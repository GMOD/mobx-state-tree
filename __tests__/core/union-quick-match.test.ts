import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  getSnapshot,
  getType,
  isStateTreeNode,
  setTypeChecking,
  types
} from "../../src/index.ts"

// With type checking off, as in production, a union picks its member by flags
// and raw snapshot shape instead of validating each one. It must still pick
// the member the full check would; these cases each took a later member.
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

  test("asks a member whose flags do not show the primitives it takes", () => {
    const Item = types.model("Item", { id: types.identifier })
    const Decimal = types.custom<string, { value: number }>({
      name: "Decimal",
      fromSnapshot: s => ({ value: Number(s) }),
      toSnapshot: d => String(d.value),
      isTargetType: v => typeof v === "object",
      getValidationMessage: s => (Number.isNaN(Number(s)) ? "not a number" : "")
    })
    const M = types.model({
      items: types.array(Item),
      date: types.union(types.Date, types.number),
      ref: types.union(types.reference(Item), types.string),
      decimal: types.union(Decimal, types.string),
      maybeDefaulted: types.maybe(types.optional(types.string, "x"))
    })

    const m = M.create({
      items: [{ id: "a" }],
      date: 5,
      ref: "a",
      decimal: "1.5"
    })

    expect(m.date).toBeInstanceOf(Date)
    expect(m.ref).toBe(m.items[0])
    expect(m.decimal).toEqual({ value: 1.5 })
    expect(m.maybeDefaulted).toBe("x")
  })

  test("still skips members whose discriminator differs", () => {
    const A = types.model("A", { type: types.literal("a"), a: 0 })
    const B = types.model("B", { type: types.literal("b"), b: 0 })
    const M = types.model({ u: types.union(A, B) })

    expect(getType(M.create({ u: { type: "b" } }).u).name).toBe("B")
  })
})
