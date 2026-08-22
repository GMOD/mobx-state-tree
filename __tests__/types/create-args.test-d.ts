// Type-only tests for when `.create()` may be called with no snapshot.
//
// Checked by `pnpm test:types` (tsc -p __tests__/types/tsconfig.json), NOT by vitest —
// vitest strips types via esbuild and would silently ignore every assertion here.
//
// The rule is "required only when omitting it would throw at runtime". `ComplexType.create`
// defaults its snapshot to `getDefaultSnapshot()`, so an array, a map and every
// `optional`-flavoured type can be created with no argument; their creation types admit
// `undefined`, which is what the signature keys off. Testing `{} extends C` alone got maps
// right by accident — `{}` is assignable to an index signature — and arrays wrong.

import { types } from "../../src/index.ts"

// --- types that supply their own default snapshot ---
types.array(types.string).create()
types.array(types.string).create(["a"])
types.map(types.string).create()
types.optional(types.string, "x").create()
types.optional(types.model({ a: types.string }), { a: "x" }).create()
types.maybe(types.string).create()
types.maybeNull(types.string).create()
types.stripDefault(types.model({ a: types.string }), { a: "x" }).create()

// --- and inside a model, where the whole snapshot then becomes optional ---
const WithDefaults = types.model({
  list: types.array(types.string),
  opt: types.optional(types.string, "x")
})
WithDefaults.create()

// --- a required member still requires a snapshot ---
const Required = types.model({ a: types.string })
// @ts-expect-error a model with a required prop cannot be created with no argument
Required.create()
Required.create({ a: "x" })

// --- and a required member is not excused by a sibling that has a default ---
const Mixed = types.model({ a: types.string, list: types.array(types.string) })
// @ts-expect-error the required `a` is still missing
Mixed.create()
Mixed.create({ a: "x" })

// --- the second argument stays optional throughout ---
types.array(types.string).create(undefined, { env: 1 })
Required.create({ a: "x" }, { env: 1 })
