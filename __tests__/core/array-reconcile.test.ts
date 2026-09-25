import { describe, expect, test } from "vitest"
import {
  type IAnyType,
  type IMSTArray,
  type IStateTreeNode,
  applySnapshot,
  destroy,
  getSnapshot,
  isAlive,
  recordPatches,
  types,
  unprotect
} from "../../src"

const initial = ["a", "b", "c", "d", "e"]

type AnyArray = IMSTArray<IAnyType> & IStateTreeNode

const edits: Record<string, (a: AnyArray) => void> = {
  assign: a => applySnapshot(a, ["x", "y"]),
  clear: a => a.clear(),
  reverse: a => a.replace(initial.slice().reverse()),
  overlap: a => applySnapshot(a, ["b", "x", "d", "a", "y"]),
  "splice overlap": a => a.splice(1, 3, "x", "d", "b", "y"),
  duplicates: a => applySnapshot(a, ["c", "c", "a", "e", "e", "a"]),
  unchanged: a => applySnapshot(a, initial.slice())
}

const scalarElementTypes: Record<string, IAnyType> = {
  string: types.string,
  optional: types.optional(types.string, "z"),
  maybe: types.maybe(types.string),
  enumeration: types.enumeration(["a", "b", "c", "d", "e", "x", "y"]),
  refinement: types.refinement(types.string, s => s.length === 1),
  "union of scalars": types.union(types.string, types.number)
}

function record(elementType: IAnyType, edit: (a: AnyArray) => void) {
  const Store = types.model({ a: types.array(elementType) })
  const store = Store.create({ a: initial })
  unprotect(store)
  const recorder = recordPatches(store)
  edit(store.a)
  recorder.stop()
  const after = getSnapshot(store.a)

  const replayed = Store.create({ a: initial })
  recorder.replay(replayed)
  expect(getSnapshot(replayed.a)).toEqual(after)

  recorder.undo(store)
  expect(getSnapshot(store.a)).toEqual(initial)

  return {
    patches: recorder.patches,
    inversePatches: recorder.inversePatches,
    after
  }
}

describe.each(Object.entries(scalarElementTypes))(
  "array(%s) reconciliation",
  (_, elementType) => {
    test.each(Object.keys(edits))("%s", name => {
      expect(record(elementType, edits[name]!)).toMatchSnapshot()
    })
  }
)

function lifecycleLog(identified: boolean) {
  const log: string[] = []
  const Item = types
    .model("Item", {
      ...(identified ? { id: types.identifier } : {}),
      name: types.string
    })
    .actions(self => ({
      afterCreate() {
        log.push(`create ${self.name}`)
      },
      afterAttach() {
        log.push(`attach ${self.name}`)
      },
      beforeDestroy() {
        log.push(`destroy ${self.name}`)
      }
    }))
  const Store = types.model({ a: types.array(Item) })
  const item = (name: string) => (identified ? { id: name, name } : { name })
  return { log, Store, item }
}

describe.each([
  ["identified", true],
  ["unidentified", false]
])("array of %s models", (_, identified) => {
  const modelEdits: Record<string, (a: AnyArray, before: any[]) => void> = {
    clear: a => a.clear(),
    "reverse by snapshot": (a, before) =>
      a.replace(before.map(n => getSnapshot(n)).reverse()),
    "reverse by instance": (a, before) => a.replace(before.slice().reverse()),
    "reverse by fresh snapshot": a =>
      applySnapshot(
        a,
        initial
          .slice()
          .reverse()
          .map(name => (identified ? { id: name, name } : { name }))
      ),
    "overlap by fresh snapshot": a =>
      applySnapshot(
        a,
        ["b", "x", "d", "a", "y"].map(name =>
          identified ? { id: name, name } : { name }
        )
      ),
    "unchanged by fresh snapshot": a =>
      applySnapshot(
        a,
        initial.map(name => (identified ? { id: name, name } : { name }))
      )
  }

  test.each(Object.keys(modelEdits))("%s", name => {
    const { log, Store, item } = lifecycleLog(identified)
    const store = Store.create({ a: initial.map(item) })
    unprotect(store)
    const before = store.a.slice()
    log.length = 0
    const recorder = recordPatches(store)
    modelEdits[name]!(store.a, before)
    recorder.stop()
    const after = getSnapshot(store.a)
    const reusedFrom = store.a.map(n => before.indexOf(n))
    const alive = before.map(n => isAlive(n))
    const paths = store.a.map((_, i) => `${i}`)
    recorder.undo(store)
    expect(getSnapshot(store.a)).toEqual(initial.map(item))
    expect({
      log,
      reusedFrom,
      alive,
      paths,
      after,
      patches: recorder.patches
    }).toMatchSnapshot()
  })
})

class Box {
  constructor(readonly s: string) {}
}
const BoxType = types.custom<string, Box>({
  name: "Box",
  fromSnapshot: s => new Box(s),
  toSnapshot: b => b.s,
  isTargetType: (v): v is Box => v instanceof Box,
  getValidationMessage: v => (typeof v === "string" ? "" : "not a string")
})

test("array(custom) keeps the instances it reuses on a reorder", () => {
  const store = types.model({ a: types.array(BoxType) }).create({ a: initial })
  unprotect(store)
  const before = store.a.slice()
  applySnapshot(store.a, ["e", "c", "x", "a", "c", "b"])
  expect(store.a.map(b => b.s)).toEqual(["e", "c", "x", "a", "c", "b"])
  expect(store.a.map(b => before.indexOf(b))).toEqual([4, 2, -1, 0, -1, 1])
})

test("array(reference) keeps its invalidation handlers across a reorder", () => {
  const log: string[] = []
  const Target = types.model({ id: types.identifier })
  const Store = types.model({
    targets: types.array(Target),
    refs: types.array(
      types.reference(Target, {
        onInvalidated(ev) {
          log.push(`${ev.cause} ${ev.invalidId}`)
          ev.removeRef()
        }
      })
    )
  })
  const store = Store.create({
    targets: initial.map(id => ({ id })),
    refs: initial
  })
  unprotect(store)
  applySnapshot(store.refs, ["e", "d", "x", "a", "b"])
  destroy(store.targets[1]!)
  destroy(store.targets[0]!)
  expect(log).toEqual(["destroy b", "destroy a"])
  expect(getSnapshot(store.refs)).toEqual(["e", "d", "x"])
})
