// Type-only tests for `types.compose`'s variadic signatures, which replaced a
// generated block of overloads capped at eleven parts. Checked by
// `pnpm test:types`.

import {
  types,
  type IAnyModelType,
  type Instance,
  type SnapshotIn,
  type SnapshotOut
} from "../../src/index.ts"

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false
function expectType<T extends true>(): T | void {}

const Base = types
  .model("Base", { type: types.literal("Base"), id: types.identifier, n: 1 })
  .views(self => ({
    get double() {
      return self.n * 2
    }
  }))
const Child = types
  .model({ type: types.literal("Child"), extra: types.string })
  .actions(self => ({
    setExtra(extra: string) {
      self.extra = extra
    }
  }))

// a later part's prop overrides an earlier one's rather than intersecting to
// never, and every part's views and actions come along
const Composed = types.compose("Composed", Base, Child)
const composed = Composed.create({ type: "Child", id: "a", extra: "e" })
expectType<Equal<typeof composed.type, "Child">>()
expectType<Equal<typeof composed.double, number>>()
composed.setExtra("f")
const snapshotIn: SnapshotIn<typeof Composed> = {
  type: "Child",
  id: "a",
  extra: "e"
}
console.log(snapshotIn)
// @ts-expect-error extra is required
Composed.create({ type: "Child", id: "a" })
// @ts-expect-error the overridden discriminant is Child's
Composed.create({ type: "Base", id: "a", extra: "e" })

// past the eleven parts the overloads stopped at, nothing is dropped
const A = types.model({ a: types.string })
const Twelve = types.compose(
  A,
  types.model({ b: 1 }),
  types.model({ c: 1 }),
  types.model({ d: 1 }),
  types.model({ e: 1 }),
  types.model({ f: 1 }),
  types.model({ g: 1 }),
  types.model({ h: 1 }),
  types.model({ i: 1 }),
  types.model({ j: 1 }),
  types.model({ k: 1 }),
  types.model({ l: types.boolean })
)
const twelve = Twelve.create({ a: "x", l: true })
expectType<Equal<typeof twelve.a, string>>()
expectType<Equal<typeof twelve.l, boolean>>()
// @ts-expect-error l, from the twelfth part, is required
Twelve.create({ a: "x" })

// a part's post-processor owns its own keys and passes the other parts'
// through, wherever the part sits
type Same<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false
const Processed = types
  .model({ x: types.number })
  .postProcessSnapshot(sn => ({ y: String(sn.x) }))
const Reprocessed = types
  .model({ z: types.number })
  .postProcessSnapshot(sn => ({ ...sn, w: true }))
const ProcessedLast = types.compose(A, Processed)
const ProcessedFirst = types.compose(Processed, A)
const ProcessedTwice = types.compose(Processed, A, Reprocessed)
expectType<Same<SnapshotOut<typeof ProcessedLast>, { a: string; y: string }>>()
expectType<Same<SnapshotOut<typeof ProcessedFirst>, { a: string; y: string }>>()
expectType<
  Same<
    SnapshotOut<typeof ProcessedTwice>,
    { a: string; y: string; z: number; w: boolean }
  >
>()

// the shape jbrowse's session parts use: a part drops a key of its own, and a
// processor added to the composed model still sees every other part's keys
const Drawer = types
  .model({ drawerWidth: 1, stickyHeaders: false })
  .postProcessSnapshot(sn => {
    const { stickyHeaders, ...rest } = sn
    return rest
  })
const Session = types
  .compose(Drawer, types.model({ views: types.array(types.string) }))
  .postProcessSnapshot(sn => ({ ...sn, viewCount: sn.views.length }))
expectType<
  Same<
    SnapshotOut<typeof Session>,
    { drawerWidth: number; views: string[]; viewCount: number }
  >
>()

// props added after a post-processor pass through it too, so they reach the
// snapshot type — including a replaced prop's new type
const WithView = Session.props({ view: types.string, drawerWidth: "wide" })
expectType<
  Same<
    SnapshotOut<typeof WithView>,
    { drawerWidth: string; views: string[]; viewCount: number; view: string }
  >
>()

const withViewSnapshot: SnapshotOut<typeof WithView> = {
  drawerWidth: "w",
  views: [],
  viewCount: 0,
  view: "v",
  // @ts-expect-error a real object type, not any
  bogus: 1
}
console.log(withViewSnapshot)

// a part typed `any` composes to an any-shaped model rather than an empty one
declare const untyped: any
const Untyped = types.compose("Untyped", untyped, types.model({ t: 1 }))
Untyped.create({ anything: true })

// a part that is a type parameter still composes
function withFlag<M extends IAnyModelType>(model: M) {
  return types.compose(model, types.model({ flag: false }))
}
const flagged: Instance<ReturnType<typeof withFlag<typeof A>>> = withFlag(
  A
).create({ a: "x" })
expectType<Equal<typeof flagged.flag, boolean>>()

// @ts-expect-error at least two parts
types.compose(A)
