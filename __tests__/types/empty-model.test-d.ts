// Type-only regression tests for the empty-model creation/snapshot typing.
//
// These are checked by `pnpm test:types` (tsc -p __tests__/types/tsconfig.json), NOT by
// vitest — vitest strips types via esbuild and would silently ignore every assertion here.
//
// Background: `types.model()` (no props) must reject `.create({ junk })`, but `{}` in
// TypeScript accepts any non-nullish value. The fix is a *weak* brand on the empty
// *creation* type only. The empty *snapshot* type stays `{}` so that derived models with
// extra optional props remain substitutable for their base (issue #2186). Putting the weak
// brand on the snapshot type instead breaks that substitutability via the weak-type
// "no properties in common" check, and is what this test guards against.

import { assert, _ } from "spec.ts"

import { types, type SnapshotOut } from "../../src/index.ts"

const Empty = types.model()
const Named = types.model("Named", {})
const Optional = Empty.props({ a: "" })
const Required = Empty.props({ a: types.string })
const RequiredPlusOptional = Required.props({ a: types.string, b: 5 })

// --- collapse prevention: an empty model must not accept arbitrary objects ---
Empty.create()
Empty.create({})
Named.create({})
// @ts-expect-error excess properties are rejected, i.e. the type did not collapse to `{}`
Empty.create({ foo: 1 })
// @ts-expect-error same for a named empty model
Named.create({ foo: 1 })

// --- normal creation keeps working ---
Optional.create()
Optional.create({ a: "x" })
Required.create({ a: "x" })
// @ts-expect-error required prop missing from the object literal
Required.create({ b: 1 })
// @ts-expect-error a model with a required prop cannot be created with no argument
Required.create()

// --- #2186: only-optional derived model is assignable to the empty base ---
const useBase = (t: typeof Empty) => t.create()
useBase(Optional)
const useRequired = (t: typeof Required) => t.create({ a: "1" })
useRequired(RequiredPlusOptional)

// --- the empty model's *snapshot out* is `{}`, with no leaked brand key. (SnapshotIn keeps
// the weak brand on purpose — that is what rejects the excess-property creates above.) ---
assert(_ as SnapshotOut<typeof Empty>, _ as {})

// --- a derived model's snapshot has its props (no leaked brand key) ---
assert(_ as SnapshotOut<typeof Optional>, _ as { a: string })
