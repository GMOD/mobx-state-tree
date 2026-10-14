// Type-only tests, checked by `pnpm test:types`, not by vitest.

import {
  applyAction,
  castToReferenceSnapshot,
  castToSnapshot,
  recordActions,
  types,
  type Instance,
  type ReferenceIdentifier,
  type SnapshotIn
} from "../../src/index.ts"

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
function assertType<T extends true>(_: T) {}

const Item = types.model("Item", { id: types.identifier, n: 0 })
type ItemSnapshot = SnapshotIn<typeof Item>

// --- a map deletes by the same keys it gets, has and sets by ---
const map = types.map(Item).create()
map.delete(17)
map.delete("17")

// --- a collection type reports its element type ---
const elementOfArray = types.array(Item).getChildType()
const elementOfMap = types.map(Item).getChildType()
elementOfArray.properties.id
elementOfMap.properties.n
// @ts-expect-error the element type is the model, which declares no `missing`
elementOfArray.properties.missing

// --- casting keeps a value's null and undefined ---
declare const maybeItem: Instance<typeof Item> | undefined
declare const item: Instance<typeof Item>
assertType<
  Eq<
    ReturnType<typeof castToSnapshot<typeof maybeItem>>,
    ItemSnapshot | undefined
  >
>(true)
assertType<Eq<ReturnType<typeof castToSnapshot<typeof item>>, ItemSnapshot>>(
  true
)
assertType<
  Eq<
    ReturnType<typeof castToReferenceSnapshot<typeof maybeItem>>,
    ReferenceIdentifier | undefined
  >
>(true)
assertType<
  Eq<
    ReturnType<typeof castToReferenceSnapshot<typeof item>>,
    ReferenceIdentifier
  >
>(true)
type MaybeCast = ReturnType<typeof castToSnapshot<typeof maybeItem>>
// @ts-expect-error negative control: the undefined is kept
assertType<Eq<MaybeCast, ItemSnapshot>>(true)

// --- recorded actions replay as they come back ---
const recorder = recordActions(item)
applyAction(item, recorder.actions)
