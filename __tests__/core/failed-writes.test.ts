import { describe, expect, test } from "vitest"
import {
  destroy,
  detach,
  getParent,
  getRoot,
  getSnapshot,
  isAlive,
  resolveIdentifier,
  types,
  unprotect
} from "../../src/index.ts"

// A write that throws must leave the tree as it found it: no node killed,
// re-parented or registered under an identifier by the attempt.

const Item = types.model("Item", { id: types.identifier, v: 0 })

describe("an array insertion that throws", () => {
  const Store = types.model({ items: types.array(Item) })

  test("leaves a node given twice where it was", () => {
    const store = Store.create({ items: [] })
    unprotect(store)
    const b = Item.create({ id: "b" })

    expect(() => store.items.push(b, b)).toThrow(
      "Tried to assign an object to '/items/1', but it lives already at '/items/0'"
    )

    expect(store.items.length).toBe(0)
    expect(isAlive(b)).toBe(true)
    expect(() => getParent(b)).toThrow()
    store.items.push({ id: "c" })
    detach(store.items[0]!)
    expect(getSnapshot(store.items)).toEqual([])
  })

  test("registers no identifier for the values before the refused one", () => {
    const store = Store.create({ items: [{ id: "a" }] })
    unprotect(store)

    expect(() => store.items.push({ id: "x" }, store.items[0]!)).toThrow(
      "lives already at '/items/0'"
    )

    expect(resolveIdentifier(Item, store, "x")).toBeUndefined()
    store.items.push({ id: "x" })
    expect(resolveIdentifier(Item, store, "x")).toBe(store.items[1])
  })

  test("kills the nodes it built before a later value failed", () => {
    const Strict = types
      .model("Strict", { id: types.identifier })
      .preProcessSnapshot((sn: any) => {
        if (sn.bad) {
          throw new Error("bad snapshot")
        }
        return sn
      })
    const store = types.model({ items: types.array(Strict) }).create()
    unprotect(store)

    expect(() =>
      store.items.push({ id: "y" }, { id: "z", bad: true } as any)
    ).toThrow()

    expect(store.items.length).toBe(0)
    expect(resolveIdentifier(Strict, store, "y")).toBeUndefined()
    store.items.push({ id: "y" })
    expect(resolveIdentifier(Strict, store, "y")).toBe(store.items[0])
  })
})

describe("an identified map write under the wrong key", () => {
  const Store = types.model({ map: types.map(Item) })

  test("registers no identifier when it adds a snapshot", () => {
    const store = Store.create()
    unprotect(store)

    expect(() => store.map.set("k", { id: "c" })).toThrow(
      "Trying to store key 'c', but expected: 'k'"
    )

    expect(store.map.size).toBe(0)
    expect(resolveIdentifier(Item, store, "c")).toBeUndefined()
    store.map.put({ id: "c" })
    expect(resolveIdentifier(Item, store, "c")).toBe(store.map.get("c"))
  })

  test("leaves the replaced node and the given instance alone", () => {
    const store = Store.create({ map: { a: { id: "a" }, b: { id: "b" } } })
    unprotect(store)
    const oldB = store.map.get("b")!
    const c = Item.create({ id: "c" })

    expect(() => store.map.set("b", c)).toThrow(
      "Trying to store key 'c', but expected: 'b'"
    )

    expect(isAlive(oldB)).toBe(true)
    expect(store.map.get("b")).toBe(oldB)
    expect(() => getParent(c)).toThrow()
    expect(getSnapshot(store)).toEqual({
      map: { a: { id: "a", v: 0 }, b: { id: "b", v: 0 } }
    })
  })

  test("accepts a union member that has no identifier", () => {
    const Bare = types.model("Bare", { kind: types.literal("bare") })
    const Mixed = types.model({ map: types.map(types.union(Item, Bare)) })
    const store = Mixed.create({ map: { k: { kind: "bare" } } })
    unprotect(store)

    store.map.set("j", { kind: "bare" })

    expect(getSnapshot(store.map)).toEqual({
      k: { kind: "bare" },
      j: { kind: "bare" }
    })
  })
})

test("assigning a node that lives elsewhere refuses before killing the current one", () => {
  const Entry = types.model("Entry", { v: 0 })
  const Store = types.model({ items: types.array(Entry), selected: Entry })
  const store = Store.create({ items: [{ v: 1 }], selected: { v: 5 } })
  unprotect(store)
  const selected = store.selected

  expect(() => {
    store.selected = store.items[0]!
  }).toThrow("but it lives already at '/items/0'")

  expect(isAlive(selected)).toBe(true)
  expect(store.selected).toBe(selected)
  expect(getSnapshot(store)).toEqual({ items: [{ v: 1 }], selected: { v: 5 } })
})

test("a detach refused by protection leaves identifiers and safe references alone", () => {
  const Store = types.model({
    items: types.array(Item),
    safe: types.safeReference(Item)
  })
  const store = Store.create({ items: [{ id: "x" }], safe: "x" })

  expect(() => detach(store.items[0]!)).toThrow("Cannot modify")

  expect(resolveIdentifier(Item, store, "x")).toBe(store.items[0])
  expect(store.safe).toBe(store.items[0])
  expect(getSnapshot(store)).toEqual({ items: [{ id: "x", v: 0 }], safe: "x" })
  destroy(store)
})

test("an array that adopts nothing still takes the same instance twice", () => {
  const Store = types.model({
    items: types.array(Item),
    refs: types.array(types.reference(Item)),
    frozen: types.array(types.frozen())
  })
  const store = Store.create({ items: [{ id: "a" }] })
  unprotect(store)
  const root = Item.create({ id: "r" })

  store.refs.push(root, root)

  expect(getSnapshot(store.refs)).toEqual(["r", "r"])
  if (process.env.NODE_ENV === "production") {
    store.frozen.push(root, root)
    expect(store.frozen.length).toBe(2)
  }
})

test("a beforeDetach hook can still unprotect the tree it leaves", () => {
  const Hooked = types
    .model("Hooked", { id: types.identifier })
    .actions(self => ({
      beforeDetach() {
        unprotect(getRoot(self))
      }
    }))
  const store = types.model({ items: types.array(Hooked) }).create({
    items: [{ id: "h" }]
  })
  const item = store.items[0]!

  detach(item)

  expect(store.items.length).toBe(0)
  expect(isAlive(item)).toBe(true)
})
