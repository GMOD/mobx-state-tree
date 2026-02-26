import { test, expect, describe } from "vitest"
import {
  types,
  getSnapshot,
  applySnapshot,
  unprotect,
  getType
} from "../../src"

const ErrorPlaceholder = types.model("ErrorPlaceholder", {
  type: types.optional(types.literal("ErrorPlaceholder"), "ErrorPlaceholder"),
  originalSnapshot: types.frozen(),
  errorMessage: types.string
})

const ModelA = types.model("ModelA", {
  type: types.literal("A"),
  value: types.string
})

const ModelB = types.model("ModelB", {
  type: types.literal("B"),
  count: types.number
})

const MyUnion = types.union(
  { dispatcher: (sn: any) => {
    switch (sn?.type) {
      case "A": return ModelA
      case "B": return ModelB
      default: throw new Error(`Unknown type: ${sn?.type}`)
    }
  }},
  ModelA,
  ModelB
)

const ResilientUnion = types.resilient(
  MyUnion,
  ErrorPlaceholder,
  (error, snapshot) => ({
    type: "ErrorPlaceholder" as const,
    originalSnapshot: snapshot,
    errorMessage: String(error)
  })
)

describe("types.resilient", () => {
  test("passes through valid snapshots to the wrapped type", () => {
    const Store = types.model({ items: types.array(ResilientUnion) })
    const store = Store.create({
      items: [
        { type: "A", value: "hello" },
        { type: "B", count: 42 }
      ]
    })
    expect(store.items.length).toBe(2)
    expect(getSnapshot(store.items[0])).toEqual({ type: "A", value: "hello" })
    expect(getSnapshot(store.items[1])).toEqual({ type: "B", count: 42 })
  })

  test("catches instantiation errors and uses fallback type", () => {
    const Store = types.model({ items: types.array(ResilientUnion) })
    const store = Store.create({
      items: [
        { type: "A", value: "hello" },
        { type: "UNKNOWN", data: "stuff" },
        { type: "B", count: 42 }
      ]
    })
    expect(store.items.length).toBe(3)
    expect(getSnapshot(store.items[0])).toEqual({ type: "A", value: "hello" })
    const fallback = getSnapshot(store.items[1]) as any
    expect(fallback.type).toBe("ErrorPlaceholder")
    expect(fallback.originalSnapshot).toEqual({ type: "UNKNOWN", data: "stuff" })
    expect(fallback.errorMessage).toContain("Unknown type: UNKNOWN")
    expect(getSnapshot(store.items[2])).toEqual({ type: "B", count: 42 })
  })

  test("preserves the original snapshot in the fallback", () => {
    const Store = types.model({ items: types.array(ResilientUnion) })
    const originalSnapshot = { type: "MISSING_PLUGIN", config: { a: 1, b: [2, 3] } }
    const store = Store.create({ items: [originalSnapshot] })
    const fallback = getSnapshot(store.items[0]) as any
    expect(fallback.originalSnapshot).toEqual(originalSnapshot)
  })

  test("works with applySnapshot for runtime reconciliation", () => {
    const Store = types.model({ items: types.array(ResilientUnion) })
    const store = Store.create({
      items: [{ type: "A", value: "hello" }]
    })
    unprotect(store)
    applySnapshot(store, {
      items: [
        { type: "B", count: 10 },
        { type: "BROKEN", x: 1 }
      ]
    })
    expect(store.items.length).toBe(2)
    expect(getSnapshot(store.items[0])).toEqual({ type: "B", count: 10 })
    const fallback = getSnapshot(store.items[1]) as any
    expect(fallback.type).toBe("ErrorPlaceholder")
    expect(fallback.originalSnapshot).toEqual({ type: "BROKEN", x: 1 })
  })

  test("works as a standalone type (not in array)", () => {
    const Store = types.model({ item: ResilientUnion })
    const store = Store.create({
      item: { type: "NOPE" }
    })
    const fallback = getSnapshot(store.item) as any
    expect(fallback.type).toBe("ErrorPlaceholder")
    expect(fallback.originalSnapshot).toEqual({ type: "NOPE" })
  })

  test("is() accepts both wrapped and fallback type values", () => {
    expect(ResilientUnion.is({ type: "A", value: "hi" })).toBe(true)
    expect(ResilientUnion.is({ type: "B", count: 5 })).toBe(true)
    expect(ResilientUnion.is({
      type: "ErrorPlaceholder",
      originalSnapshot: {},
      errorMessage: "err"
    })).toBe(true)
  })

  test("works with types.map", () => {
    const Store = types.model({ items: types.map(ResilientUnion) })
    const store = Store.create({
      items: {
        good: { type: "A", value: "yes" },
        bad: { type: "NOPE" }
      }
    })
    expect(getSnapshot(store.items.get("good")!)).toEqual({ type: "A", value: "yes" })
    const fallback = getSnapshot(store.items.get("bad")!) as any
    expect(fallback.type).toBe("ErrorPlaceholder")
    expect(fallback.originalSnapshot).toEqual({ type: "NOPE" })
  })

  test("calls createFallbackSnapshot with the error and original snapshot", () => {
    const calls: Array<{ error: unknown; snapshot: any }> = []
    const TrackedResilient = types.resilient(
      MyUnion,
      ErrorPlaceholder,
      (error, snapshot) => {
        calls.push({ error, snapshot })
        return {
          type: "ErrorPlaceholder" as const,
          originalSnapshot: snapshot,
          errorMessage: String(error)
        }
      }
    )
    const Store = types.model({ items: types.array(TrackedResilient) })
    Store.create({ items: [{ type: "BAD" }] })
    expect(calls.length).toBe(1)
    expect(calls[0].snapshot).toEqual({ type: "BAD" })
    expect(String(calls[0].error)).toContain("Unknown type: BAD")
  })

  test("does not catch errors for state tree node values", () => {
    const store1 = ModelA.create({ type: "A", value: "hello" })
    const Store = types.model({ item: ResilientUnion })
    const store2 = Store.create({ item: store1 })
    expect(getSnapshot(store2.item)).toEqual({ type: "A", value: "hello" })
  })

  test("handles union without dispatcher (type matching failure)", () => {
    const UnionNoDispatch = types.union(ModelA, ModelB)
    const ResilientNoDispatch = types.resilient(
      UnionNoDispatch,
      ErrorPlaceholder,
      (error, snapshot) => ({
        type: "ErrorPlaceholder" as const,
        originalSnapshot: snapshot,
        errorMessage: String(error)
      })
    )
    const Store = types.model({ items: types.array(ResilientNoDispatch) })
    const store = Store.create({
      items: [
        { type: "A", value: "ok" },
        { type: "C", something: true }
      ]
    })
    expect(store.items.length).toBe(2)
    expect(getSnapshot(store.items[0])).toEqual({ type: "A", value: "ok" })
    const fallback = getSnapshot(store.items[1]) as any
    expect(fallback.type).toBe("ErrorPlaceholder")
  })

  test("multiple errors in one array", () => {
    const Store = types.model({ items: types.array(ResilientUnion) })
    const store = Store.create({
      items: [
        { type: "X" },
        { type: "A", value: "ok" },
        { type: "Y" },
        { type: "Z" }
      ]
    })
    expect(store.items.length).toBe(4)
    expect((getSnapshot(store.items[0]) as any).type).toBe("ErrorPlaceholder")
    expect((getSnapshot(store.items[1]) as any).type).toBe("A")
    expect((getSnapshot(store.items[2]) as any).type).toBe("ErrorPlaceholder")
    expect((getSnapshot(store.items[3]) as any).type).toBe("ErrorPlaceholder")
  })

  test("throws clear error when fallback type itself fails to instantiate", () => {
    const BadFallback = types.model("BadFallback", {
      required: types.refinement(types.string, val => val.length > 0)
    })
    const BadResilient = types.resilient(
      MyUnion,
      BadFallback,
      () => (null as any)
    )
    const Store = types.model({ item: BadResilient })
    expect(() => Store.create({ item: { type: "NOPE" } })).toThrow(
      /resilient.*fallback type.*BadFallback.*failed to instantiate/
    )
  })

  test("throws clear error when createFallbackSnapshot throws", () => {
    const BadResilient = types.resilient(
      MyUnion,
      ErrorPlaceholder,
      () => { throw new Error("callback broke") }
    )
    const Store = types.model({ item: BadResilient })
    expect(() => Store.create({ item: { type: "NOPE" } })).toThrow(
      /resilient.*createFallbackSnapshot threw/
    )
  })

  test("reconciling a fallback node with a valid snapshot recovers to normal type", () => {
    const Store = types.model({ items: types.array(ResilientUnion) })
    const store = Store.create({
      items: [{ type: "BROKEN" }]
    })
    expect((getSnapshot(store.items[0]) as any).type).toBe("ErrorPlaceholder")
    unprotect(store)
    applySnapshot(store, {
      items: [{ type: "A", value: "recovered" }]
    })
    expect(getSnapshot(store.items[0])).toEqual({ type: "A", value: "recovered" })
  })

  test("reconciling a fallback node with another bad snapshot stays as fallback", () => {
    const Store = types.model({ items: types.array(ResilientUnion) })
    const store = Store.create({
      items: [{ type: "BROKEN1" }]
    })
    expect((getSnapshot(store.items[0]) as any).originalSnapshot).toEqual({ type: "BROKEN1" })
    unprotect(store)
    applySnapshot(store, {
      items: [{ type: "BROKEN2" }]
    })
    const fallback = getSnapshot(store.items[0]) as any
    expect(fallback.type).toBe("ErrorPlaceholder")
    expect(fallback.originalSnapshot).toEqual({ type: "BROKEN2" })
  })
})
