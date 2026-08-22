import { expect, test } from "vitest"
import {
  type IAnyModelType,
  type IAnyType,
  applySnapshot,
  getSnapshot,
  getUnionSubtypes,
  isUnionType,
  types,
  unprotect
} from "../../src"

function makeRegistry() {
  const loaded = new Map<string, IAnyModelType>()
  const union = types.union({
    name: "registryUnion",
    dispatcher: (snapshot: { type: string }) => {
      const member = loaded.get(snapshot.type)
      if (!member) {
        throw new Error(`type "${snapshot.type}" is not loaded`)
      }
      return member
    },
    members: () => [...loaded.values()]
  })
  return { loaded, union }
}

const CircleModel = types.model("Circle", {
  id: types.identifier,
  type: types.literal("circle"),
  radius: types.number
})

const SquareModel = types.model("Square", {
  id: types.identifier,
  type: types.literal("square"),
  side: types.number
})

test("a member registered after construction becomes instantiable", () => {
  const { loaded, union } = makeRegistry()
  const Store = types.model("Store", { shapes: types.array(union) })

  loaded.set("circle", CircleModel)
  const store = Store.create({
    shapes: [{ id: "c1", type: "circle", radius: 2 }]
  })
  unprotect(store)

  expect(() =>
    store.shapes.push({ id: "s1", type: "square", side: 3 })
  ).toThrow('type "square" is not loaded')

  loaded.set("square", SquareModel)
  store.shapes.push({ id: "s1", type: "square", side: 3 })
  expect(getSnapshot(store).shapes).toEqual([
    { id: "c1", type: "circle", radius: 2 },
    { id: "s1", type: "square", side: 3 }
  ])
})

test("is() tracks current membership", () => {
  const registryTypes: IAnyType[] = []
  const union = types.union({ members: () => registryTypes })
  const snapshot = { id: "c1", type: "circle", radius: 2 }

  expect(union.is(snapshot)).toBe(false)
  registryTypes.push(CircleModel)
  expect(union.is(snapshot)).toBe(true)
})

test("instantiation without a dispatcher falls back to scanning current members", () => {
  const registryTypes: IAnyType[] = [CircleModel]
  const union = types.union({ members: () => registryTypes })
  const Store = types.model("Store", { shapes: types.array(union) })

  const store = Store.create({
    shapes: [{ id: "c1", type: "circle", radius: 2 }]
  })
  unprotect(store)
  expect(() =>
    store.shapes.push({ id: "s1", type: "square", side: 3 })
  ).toThrow(/No matching type|No type is applicable/)

  registryTypes.push(SquareModel)
  store.shapes.push({ id: "s1", type: "square", side: 3 })
  expect(store.shapes.length).toBe(2)
})

test("safeReference resolves an instance of a late-registered member", () => {
  const { loaded, union } = makeRegistry()
  const Store = types
    .model("Store", {
      shapes: types.array(union),
      selected: types.safeReference(union)
    })
    .actions(self => ({
      select(id: string) {
        self.selected = id
      }
    }))

  loaded.set("circle", CircleModel)
  const store = Store.create({
    shapes: [{ id: "c1", type: "circle", radius: 2 }]
  })
  unprotect(store)

  loaded.set("square", SquareModel)
  store.shapes.push({ id: "s1", type: "square", side: 3 })
  store.select("s1")
  expect(store.selected).toBe(store.shapes[1])

  store.select("c1")
  expect(store.selected).toBe(store.shapes[0])
})

test("applySnapshot reconciles across members registered at different times", () => {
  const { loaded, union } = makeRegistry()
  const Store = types.model("Store", { shapes: types.array(union) })

  loaded.set("circle", CircleModel)
  const store = Store.create({
    shapes: [{ id: "c1", type: "circle", radius: 2 }]
  })
  unprotect(store)
  const original = store.shapes[0]

  loaded.set("square", SquareModel)
  applySnapshot(store, {
    shapes: [
      { id: "c1", type: "circle", radius: 5 },
      { id: "s1", type: "square", side: 3 }
    ]
  })
  expect(store.shapes[0]).toBe(original)
  expect(store.shapes[0].radius).toBe(5)
  expect(store.shapes[1].side).toBe(3)
})

test("an explicit name is stable while an unnamed union folds current members", () => {
  const registryTypes: IAnyType[] = [CircleModel]
  const named = types.union({
    name: "registryUnion",
    members: () => registryTypes
  })
  const unnamed = types.union({ members: () => registryTypes })

  expect(named.name).toBe("registryUnion")
  expect(unnamed.name).toBe("(Circle)")
  registryTypes.push(SquareModel)
  expect(named.name).toBe("registryUnion")
  expect(unnamed.name).toBe("(Circle | Square)")
})

test("getUnionSubtypes reflects current membership", () => {
  const registryTypes: IAnyType[] = [CircleModel]
  const union = types.union({ members: () => registryTypes })

  expect(isUnionType(union)).toBe(true)
  expect(getUnionSubtypes(union)).toEqual([CircleModel])
  registryTypes.push(SquareModel)
  expect(getUnionSubtypes(union)).toEqual([CircleModel, SquareModel])
})

test("the members option cannot be combined with positional member types", () => {
  expect(() =>
    types.union({ members: () => [CircleModel] }, SquareModel)
  ).toThrow(/cannot be combined with positional member types/)
})

test("an explicit name applies to plain options unions too", () => {
  const union = types.union({ name: "shapes" }, CircleModel, SquareModel)
  expect(union.name).toBe("shapes")
})
