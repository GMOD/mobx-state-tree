import { describe, expect, test } from "vitest"
import {
  destroy,
  detach,
  getEnv,
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

  describe("leaves an instance it adopted before a later value failed parentless", () => {
    const Strict = types
      .model("Strict", { id: types.identifier })
      .preProcessSnapshot((sn: any) => {
        if (sn.bad) {
          throw new Error("bad snapshot")
        }
        return sn
      })
    const Other = types.model("Other", { kind: types.literal("other") })
    const Wide = types.model({
      maybes: types.array(types.maybe(Item)),
      unions: types.array(types.union(Item, Other)),
      lates: types.array(types.late(() => Item)),
      items: types.array(Item),
      stricts: types.array(Strict)
    })

    function expectUntouched(store: typeof Wide.Type, root: typeof Item.Type) {
      expect(() => getParent(root)).toThrow()
      expect(resolveIdentifier(Item, store, "r")).toBeUndefined()
      store.items.push(root)
      expect(resolveIdentifier(Item, store, "r")).toBe(root)
    }

    test.each(["maybes", "unions", "lates"] as const)(
      "when %s is given it twice",
      key => {
        const store = Wide.create()
        unprotect(store)
        const root = Item.create({ id: "r" })

        expect(() => store[key].push(root, root)).toThrow("lives already at")

        expect(store[key].length).toBe(0)
        expectUntouched(store, root)
      }
    )

    test("pairing the afterAttach it fired with a beforeDetach", () => {
      const calls: string[] = []
      const Hooked = types
        .model("Hooked", { id: types.identifier })
        .actions(self => ({
          afterAttach() {
            calls.push(`attach ${self.id}`)
          },
          beforeDetach() {
            calls.push(`detach ${self.id}`)
          }
        }))
      const store = types
        .model({ items: types.array(types.maybe(Hooked)) })
        .create()
      unprotect(store)
      const root = Hooked.create({ id: "h" })

      expect(() => store.items.push(root, root)).toThrow("lives already at")

      expect(calls).toEqual(["attach h", "detach h"])
      expect(() => getParent(root)).toThrow()
    })

    test("restoring the environment it had", () => {
      const env = { name: "own" }
      const store = Wide.create()
      unprotect(store)
      const root = Item.create({ id: "r" }, env)

      expect(() => store.maybes.push(root, root)).toThrow()

      expect(getEnv(root)).toBe(env)
    })

    describe("without taking identifiers from the element at the slot it would have had", () => {
      const Child = types.model("Child", { id: types.identifier })
      const Parent = types.model("Parent", {
        id: types.identifier,
        kids: types.array(Child)
      })
      const Tree = types.model({
        items: types.array(Parent),
        ref: types.maybe(types.reference(Child)),
        safe: types.safeReference(Child)
      })

      test.each([
        ["unshift", (s: any, r: any, o: any) => s.items.unshift(r, o)],
        ["splice", (s: any, r: any, o: any) => s.items.splice(0, 1, r, o)],
        ["assignment", (s: any, r: any, o: any) => (s.items = [r, o])]
      ])("by %s", (_, write) => {
        const store = Tree.create({
          items: [{ id: "a", kids: [{ id: "k" }] }],
          ref: "k",
          safe: "k"
        })
        const other = Tree.create({ items: [{ id: "o" }] })
        unprotect(store)
        const root = Parent.create({ id: "r" })

        expect(() => write(store, root, other.items[0])).toThrow(
          "lives already at"
        )

        const k = store.items[0]!.kids[0]
        expect(resolveIdentifier(Child, store, "k")).toBe(k)
        expect(store.ref).toBe(k)
        expect(store.safe).toBe(k)
        expect(() => getParent(root)).toThrow()
      })
    })

    test("but not one a hook moved into another tree meanwhile", () => {
      const elsewhere = types
        .model({ items: types.array(Item) })
        .create({ items: [{ id: "e" }] })
      unprotect(elsewhere)
      const root = Item.create({ id: "r" })
      const Mover = types
        .model("Mover", { id: types.identifier, mover: true })
        .actions(() => ({
          afterAttach() {
            detach(root)
            elsewhere.items.push(root)
          }
        }))
      const store = types
        .model({ items: types.array(types.union(Mover, Item)) })
        .create()
      unprotect(store)
      const mover = Mover.create({ id: "m" })

      expect(() => store.items.push(root, mover, elsewhere.items[0]!)).toThrow(
        "lives already at"
      )

      expect(getParent(root)).toBe(elsewhere.items)
      expect(resolveIdentifier(Item, elsewhere, "r")).toBe(root)
    })

    test("but not one a hook put back into this array meanwhile", () => {
      const other = types
        .model({ items: types.array(Item) })
        .create({ items: [{ id: "o" }] })
      const root = Item.create({ id: "r" })
      const Mover = types
        .model("Mover", { id: types.identifier, mover: true })
        .actions(self => ({
          afterAttach() {
            const items = getParent<any>(self)
            detach(root)
            items.push(root)
          }
        }))
      const store = types
        .model({ items: types.array(types.union(Mover, Item)) })
        .create()
      unprotect(store)
      const mover = Mover.create({ id: "m" })

      expect(() => store.items.push(root, mover, other.items[0]!)).toThrow(
        "lives already at"
      )

      expect(store.items.slice()).toEqual([root])
      expect(getParent(root)).toBe(store.items)
      expect(resolveIdentifier(Item, store, "r")).toBe(root)
    })

    test("when a node from another tree follows it", () => {
      const store = Wide.create()
      const other = Wide.create({ items: [{ id: "o" }] })
      unprotect(store)
      const root = Item.create({ id: "r" })

      expect(() => store.items.push(root, other.items[0]!)).toThrow(
        "lives already at '/items/0'"
      )

      expect(store.items.length).toBe(0)
      expectUntouched(store, root)
    })

    test("when a snapshot whose preprocessor throws follows it", () => {
      const store = Wide.create()
      unprotect(store)
      const root = Strict.create({ id: "r" })

      expect(() =>
        store.stricts.push(root, { id: "z", bad: true } as any)
      ).toThrow("bad snapshot")

      expect(store.stricts.length).toBe(0)
      expect(() => getParent(root)).toThrow()
      expect(resolveIdentifier(Strict, store, "r")).toBeUndefined()
      store.stricts.push(root)
      expect(resolveIdentifier(Strict, store, "r")).toBe(root)
    })
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

  test("leaves the replaced node alone when given a snapshot", () => {
    const store = Store.create({ map: { b: { id: "b" } } })
    unprotect(store)
    const oldB = store.map.get("b")!

    expect(() => store.map.set("b", { id: "c" })).toThrow(
      "Trying to store key 'c', but expected: 'b'"
    )

    expect(isAlive(oldB)).toBe(true)
    expect(store.map.get("b")).toBe(oldB)
    expect(resolveIdentifier(Item, store, "b")).toBe(oldB)
    expect(getSnapshot(store)).toEqual({ map: { b: { id: "b", v: 0 } } })
  })

  test("still lets a preprocessor rewrite the identifier a snapshot shows", () => {
    const Renamed = types
      .model("Renamed", { id: types.identifier, v: 0 })
      .preProcessSnapshot((sn: any) => ({ ...sn, id: sn.id.toLowerCase() }))
    const store = types
      .model({ map: types.map(Renamed) })
      .create({ map: { b: { id: "b" } } })
    unprotect(store)

    store.map.set("b", { id: "B", v: 2 })

    expect(getSnapshot(store.map)).toEqual({ b: { id: "b", v: 2 } })
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

describe("an array write that throws while attaching or rolling back", () => {
  test("detaches an orphan whose afterAttach threw", () => {
    const Hooked = types
      .model("Hooked", { id: types.identifier })
      .actions(() => ({
        afterAttach() {
          throw new Error("boom")
        }
      }))
    const store = types.model({ xs: types.array(Hooked) }).create({ xs: [] })
    unprotect(store)
    const h = Hooked.create({ id: "h" })

    expect(() => store.xs.push(h)).toThrow("boom")
    expect(store.xs.length).toBe(0)
    expect(isAlive(h)).toBe(true)
    expect(getRoot(h)).toBe(h)
    expect(resolveIdentifier(Hooked, store, "h")).toBeUndefined()
  })

  test("detaches an orphan whose beforeDetach throws", () => {
    const Hooked = types
      .model("Hooked", { id: types.identifier })
      .actions(() => ({
        beforeDetach() {
          throw new Error("boom")
        }
      }))
    const store = types
      .model({ xs: types.array(types.union(Hooked, types.string)) })
      .create({ xs: [] })
    unprotect(store)
    const h = Hooked.create({ id: "h" })

    expect(() => store.xs.push(h, h)).toThrow("already")
    expect(store.xs.length).toBe(0)
    expect(getRoot(h)).toBe(h)
    expect(resolveIdentifier(Hooked, store, "h")).toBeUndefined()
  })
})
