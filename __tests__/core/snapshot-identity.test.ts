import { describe, expect, test } from "vitest"
import { applySnapshot, getSnapshot, types } from "../../src"

describe("snapshot identity across lazy instantiation", () => {
  test("reading a child for the first time keeps the snapshot objects", () => {
    const Item = types.model("Item", {
      id: types.identifier,
      value: types.number
    })
    const Store = types.model("Store", { items: types.array(Item) })
    const store = Store.create({ items: [{ id: "a", value: 1 }] })
    const before = getSnapshot(store)

    expect(store.items[0]!.value).toBe(1)

    expect(getSnapshot(store.items[0]!)).toBe(before.items[0])
    expect(getSnapshot(store)).toBe(before)
  })

  test("a snapshot taken before instantiation matches the unchanged children after it", () => {
    const Item = types
      .model("Item", { id: types.identifier, value: types.number })
      .actions(self => ({
        setValue(value: number) {
          self.value = value
        }
      }))
    const Store = types.model("Store", { items: types.array(Item) })
    const store = Store.create({
      items: [
        { id: "a", value: 1 },
        { id: "b", value: 2 }
      ]
    })
    const initial = getSnapshot(store)
    const b = store.items[1]!
    store.items.forEach(item => item.value)
    store.items[0]!.setValue(3)

    applySnapshot(store, initial)

    expect(getSnapshot(store)).toEqual(initial)
    expect(getSnapshot(b)).toBe(initial.items[1])
    expect(store.items[1]).toBe(b)
  })

  const Child = types
    .model("Child", { value: types.number })
    .actions(self => ({
      setValue(value: number) {
        self.value = value
      }
    }))

  test("an initializer that mutates a child is reflected in the node's snapshot", () => {
    const Parent = types.model("Parent", { child: Child }).extend(self => {
      self.child.setValue(2)
      return {}
    })
    const Store = types.model("Store", { parents: types.array(Parent) })
    const store = Store.create({ parents: [{ child: { value: 1 } }] })
    getSnapshot(store)

    expect(store.parents[0]!.child.value).toBe(2)

    expect(getSnapshot(store.parents[0]!.child)).toEqual({ value: 2 })
    expect(getSnapshot(store.parents[0]!)).toEqual({ child: { value: 2 } })
  })

  test("an initializer that only reads keeps the snapshot objects", () => {
    const Parent = types
      .model("Parent", { child: Child })
      .volatile(self => ({ initialValue: self.child.value }))
    const Store = types.model("Store", { parents: types.array(Parent) })
    const store = Store.create({ parents: [{ child: { value: 1 } }] })
    const before = getSnapshot(store)

    expect(store.parents[0]!.initialValue).toBe(1)

    expect(getSnapshot(store.parents[0]!)).toBe(before.parents[0])
    expect(getSnapshot(store.parents[0]!.child)).toBe(before.parents[0]!.child)
  })
})
