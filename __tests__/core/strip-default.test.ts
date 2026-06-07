import { test, expect } from "vitest"
import { getSnapshot, types } from "../../src"

test("omits a default-valued property from the snapshot", () => {
  const M = types.model({
    color: types.stripDefault(types.string, "black"),
    height: types.stripDefault(types.number, 10)
  })
  expect(getSnapshot(M.create())).toEqual({})
  expect(getSnapshot(M.create({ color: "red" }))).toEqual({ color: "red" })
  expect(getSnapshot(M.create({ color: "red", height: 20 }))).toEqual({
    color: "red",
    height: 20
  })
})

test("keeps non-stripDefault siblings (e.g. a type discriminator)", () => {
  const M = types.model({
    type: types.optional(types.literal("widget"), "widget"),
    id: types.identifier,
    color: types.stripDefault(types.string, "black")
  })
  expect(getSnapshot(M.create({ id: "a" }))).toEqual({
    type: "widget",
    id: "a"
  })
})

test("strips falsy defaults (0, '', false)", () => {
  const M = types.model({
    n: types.stripDefault(types.number, 0),
    s: types.stripDefault(types.string, ""),
    b: types.stripDefault(types.boolean, false)
  })
  expect(getSnapshot(M.create())).toEqual({})
  expect(getSnapshot(M.create({ n: 1, b: true }))).toEqual({ n: 1, b: true })
})

test("compares against the normalized (filled-in) default snapshot", () => {
  // sub-model default omits `b`, which fills to its own default; a value equal
  // to that normalized default still strips
  const Sub = types.model({ a: 1, b: 2 })
  const M = types.model({
    sub: types.stripDefault(Sub, { a: 1 })
  })
  expect(getSnapshot(M.create())).toEqual({})
  expect(getSnapshot(M.create({ sub: { a: 1, b: 2 } }))).toEqual({})
  expect(getSnapshot(M.create({ sub: { a: 1, b: 3 } }))).toEqual({
    sub: { a: 1, b: 3 }
  })
})

test("nested all-default stripDefault model collapses to {} and is stripped by parent", () => {
  const Inner = types.model({
    x: types.stripDefault(types.string, "d")
  })
  const Outer = types.model({
    inner: types.stripDefault(Inner, {})
  })
  expect(getSnapshot(Outer.create())).toEqual({})
  expect(getSnapshot(Outer.create({ inner: { x: "d" } }))).toEqual({})
  expect(getSnapshot(Outer.create({ inner: { x: "z" } }))).toEqual({
    inner: { x: "z" }
  })
})

test("reloads a stripped snapshot back to the default", () => {
  const M = types.model({
    color: types.stripDefault(types.string, "black")
  })
  const inst = M.create(getSnapshot(M.create({ color: "black" })))
  expect(inst.color).toBe("black")
})

test("strips defaults for array/map element models (lazy snapshot path)", () => {
  // array/map children are serialized via processInitialSnapshot before they
  // become observable instances, a different path from ModelType.getSnapshot;
  // both must strip defaults
  const Elt = types.model({ n: types.stripDefault(types.number, 1) })
  const M = types.model({
    arr: types.array(Elt),
    mp: types.map(Elt)
  })
  expect(
    getSnapshot(M.create({ arr: [{ n: 1 }, { n: 2 }], mp: { a: { n: 1 } } }))
  ).toEqual({ arr: [{}, { n: 2 }], mp: { a: {} } })
})
