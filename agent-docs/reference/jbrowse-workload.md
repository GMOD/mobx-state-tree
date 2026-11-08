# What JBrowse exercises

JBrowse is the workload these optimizations target. Measure against it before
optimizing for it; the harnesses are in [benchmarking.md](benchmarking.md).

## The API it uses

JBrowse's imports are public API: `types` by a wide margin, then `isAlive`,
`addDisposer`, `getSnapshot`, `getParent`, `isStateTreeNode` and `cast`. Its
build scripts (`scripts/generateConfigManifest.ts`,
`scripts/configJsonSchema.ts`) walk types through `unwrapType`, the `as*Type`
guards and `IType.getSubTypes()`, so those are consumer-facing too.

Within `types`, the shape that matters is **`stripDefault`**: every config
schema is `types.stripDefault(model, {type, id})`, slots are `stripDefault`
too, and sub-schemas nest the same way. That makes
`StripDefaultValue.shouldStripFromSnapshot` one of the hottest paths in the
app, and the case to optimize is "same key count as the default, differing only
in the identifier", which no size guard catches.

Most slots are `stripDefault(refinement(value, v => !isJexl(v)))`, one fresh
refinement per slot; only callback slots build `union(JexlString, value)`, so
ADR 0005's union interning covers those alone. Pluggable unions have no
dispatcher (`pluggableConfigSchemaType` is a plain `types.union(...)`,
`pluggableMstType` a `members` thunk union), so hydrating a track config or a
view goes through the production quick-match in `union.ts`.

## Startup

`jbrowse.tracks` elements are `types.frozen`, so track configs never become
model instances and never touch `getSnapshot`, `finalizeNewInstance` or
reconciliation. jbrowse builds config-schema types per track _type_ at plugin
registration (jbrowse's `agent-docs/reference/EAGER_BUNDLE.md`, pinned by
`products/jbrowse-web/src/configSchemaCost.test.ts`); its per-track cost is
creating config _nodes_.

ADRs 0003 and 0004 made type construction ~2.4x faster, measured over 262
schema types, about 20k unions and 20k optionals. `scripts/` still builds those
262 types, so retarget the scripts at node creation before sizing a startup
change with them.

`addView('LinearGenomeView')` is mostly mobx: `defineProperty_` and
`defineComputedProperty_` installing ~60 computed views per instance. Batching
MST's per-getter `makeObservable` into one call measured as noise, since the
cost is mobx's per-computed work.

A cross-process jest A/B of `createTestSession` cannot resolve anything under
~1.3x.

## Value churn

The workload that matters is one prop written per frame while a view scrolls,
with everything observing it re-deriving. Cost of one typed write on a
JBrowse-shaped session (`scripts/ab-value-churn.mjs`):

| what is listening                        | µs per write |
| ---------------------------------------- | ------------ |
| nothing                                  | ~9           |
| `onPatch(root)`                          | ~9           |
| an `autorun` over derived computeds      | ~18          |
| `onSnapshot(root)`                       | ~75          |
| an `autorun` reading `getSnapshot(view)` | ~28          |

- `onSnapshot` on a hot path turns every value change into a reserialize of the
  path from the changed node to the root. The cost is flat in tree size (child
  snapshots are memoized) and scales with the width of the models on that path.
- An `onSnapshot` callback that debounces with `setTimeout` still pays for the
  snapshot on every change, since MST computes it to call the callback.
  `autorun(() => getSnapshot(x), { delay })` defers the whole body and costs
  nothing per frame, and `onPatch` fires on the same changes for free.
  jbrowse's `TimeTraveller` (undo) uses `onPatch` for this reason.
- After ADR 0002, `ModelType.getSnapshot` is the largest single MST frame in
  the write path, followed by mobx re-binding a computed's dependencies.
