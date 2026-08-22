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

test("array/object size short-circuit: differently-sized values are kept", () => {
  // a non-empty value vs an empty default differs in size, so it is kept
  // without a full structural compare of the (potentially large) snapshot
  const M = types.model({
    arr: types.stripDefault(types.array(types.number), []),
    mp: types.stripDefault(types.map(types.number), {})
  })
  expect(getSnapshot(M.create())).toEqual({})
  expect(getSnapshot(M.create({ arr: [1, 2, 3] }))).toEqual({ arr: [1, 2, 3] })
  expect(getSnapshot(M.create({ mp: { a: 1 } }))).toEqual({ mp: { a: 1 } })
  // same-size, same-content still strips (falls through to the equality check)
  const N = types.model({
    arr: types.stripDefault(types.array(types.number), [7])
  })
  expect(getSnapshot(N.create({ arr: [7] }))).toEqual({})
  expect(getSnapshot(N.create({ arr: [8] }))).toEqual({ arr: [8] })
})

test("a child differing only in its identifier keeps every key", () => {
  const Track = types.model("Track", {
    trackId: types.identifier,
    category: types.optional(types.string, "feature"),
    displays: types.optional(types.array(types.string), ["linear"]),
    renderer: types.optional(types.model({ type: "svg", height: 20 }), {})
  })
  const M = types.model({
    track: types.stripDefault(Track, { trackId: "default" })
  })
  expect(getSnapshot(M.create({ track: { trackId: "other" } }))).toEqual({
    track: {
      trackId: "other",
      category: "feature",
      displays: ["linear"],
      renderer: { type: "svg", height: 20 }
    }
  })
  expect(getSnapshot(M.create({ track: { trackId: "default" } }))).toEqual({})
})

test("a child equal to the default, identifier included, is stripped", () => {
  const Track = types.model({ trackId: types.identifier, color: "red" })
  const M = types.model({
    track: types.stripDefault(Track, { trackId: "t1" })
  })
  expect(
    getSnapshot(M.create({ track: { trackId: "t1", color: "red" } }))
  ).toEqual({})
  expect(
    getSnapshot(M.create({ track: { trackId: "t1", color: "blue" } }))
  ).toEqual({ track: { trackId: "t1", color: "blue" } })
})

test("the identifier lookup drills through wrapper types", () => {
  const Track = types.model({ trackId: types.identifier, color: "red" })
  const M = types.model({
    late: types.stripDefault(
      types.late(() => Track),
      { trackId: "t1" }
    ),
    refined: types.stripDefault(
      types.refinement(Track, () => true),
      { trackId: "t1" }
    )
  })
  expect(getSnapshot(M.create())).toEqual({})
  expect(
    getSnapshot(
      M.create({ late: { trackId: "t2" }, refined: { trackId: "t1" } })
    )
  ).toEqual({ late: { trackId: "t2", color: "red" } })
})

test("a postProcessor that drops the identifier key still compares fully", () => {
  const Track = types.model({ trackId: types.identifier, color: "red" })
  const Processed = types.snapshotProcessor(Track, {
    preProcessor(sn: { key: string; color?: string }) {
      return { trackId: sn.key, color: sn.color }
    },
    postProcessor(sn) {
      return { key: sn.trackId, color: sn.color }
    }
  })
  const M = types.model({
    track: types.stripDefault(Processed, { key: "t1" })
  })
  expect(getSnapshot(M.create({ track: { key: "t1", color: "red" } }))).toEqual(
    {}
  )
  expect(getSnapshot(M.create({ track: { key: "t2" } }))).toEqual({
    track: { key: "t2", color: "red" }
  })
})

test("re-serializing after writes keeps answering from the current value", () => {
  const Sub = types.model({ a: 1, b: 2 })
  const M = types
    .model({
      sub: types.stripDefault(Sub, { a: 1 }),
      other: types.optional(types.string, "x")
    })
    .actions(self => ({
      setA(value: number) {
        self.sub.a = value
      },
      setOther(value: string) {
        self.other = value
      }
    }))
  const m = M.create()
  expect(getSnapshot(m)).toEqual({ other: "x" })
  expect(getSnapshot(m)).toEqual({ other: "x" })
  m.setA(5)
  expect(getSnapshot(m)).toEqual({ sub: { a: 5, b: 2 }, other: "x" })
  expect(getSnapshot(m)).toEqual({ sub: { a: 5, b: 2 }, other: "x" })
  m.setA(1)
  expect(getSnapshot(m)).toEqual({ other: "x" })
  // a sibling write re-runs the parent snapshot over an unchanged child
  m.setOther("y")
  expect(getSnapshot(m)).toEqual({ other: "y" })
  m.setA(5)
  m.setOther("z")
  expect(getSnapshot(m)).toEqual({ sub: { a: 5, b: 2 }, other: "z" })
  m.setA(1)
  expect(getSnapshot(m)).toEqual({ other: "z" })
})

test("re-serializing an identified child after it is replaced", () => {
  const Track = types.model({ trackId: types.identifier, color: "red" })
  const M = types
    .model({
      track: types.stripDefault(Track, { trackId: "t1" }),
      other: types.optional(types.string, "x")
    })
    .actions(self => ({
      setTrack(value: { trackId: string; color?: string }) {
        self.track = Track.create(value)
      },
      setOther(value: string) {
        self.other = value
      }
    }))
  const m = M.create()
  expect(getSnapshot(m)).toEqual({ other: "x" })
  m.setTrack({ trackId: "t2" })
  expect(getSnapshot(m)).toEqual({
    track: { trackId: "t2", color: "red" },
    other: "x"
  })
  m.setOther("y")
  expect(getSnapshot(m)).toEqual({
    track: { trackId: "t2", color: "red" },
    other: "y"
  })
  m.setTrack({ trackId: "t1" })
  expect(getSnapshot(m)).toEqual({ other: "y" })
  m.setTrack({ trackId: "t1", color: "blue" })
  expect(getSnapshot(m)).toEqual({
    track: { trackId: "t1", color: "blue" },
    other: "y"
  })
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
