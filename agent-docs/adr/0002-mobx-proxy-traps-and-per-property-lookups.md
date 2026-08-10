# ADR 0002 — Read mobx's property observables once per operation, not per property

Status: Accepted (August 2026)

## Context

`ModelType` reached each property's mobx `ObservableValue` through
`getAtom(storedValue, key)` (in `getSnapshot`/`getChildren`) or
`_interceptReads(instance, key, node.unbox)` (in `finalizeNewInstance`), once
per property.

**`observable.object` returns a Proxy**, and both of those entry points probe
the thing they are given with marker-property reads:

```js
getAtom(thing, property)          // isObservableArray(thing) -> thing["isMobXObservableArray"]
                                  // isObservableSet(thing)   -> thing["isMobXObservableSet"]
                                  // isObservableMap(thing)   -> thing["isMobXObservableMap"]
                                  // isObservableObject(thing)-> thing[$mobx]
                                  // then adm.values_.get(property)
```

Every one of those reads goes through the proxy's `get` trap
(`getAdm(target).get_(name)` → `hasProp` → target read). So a per-property
lookup costs several trap round-trips *before* it reaches the map that actually
holds the observable.

Profiling a 32-property `stripDefault` config schema — the shape of every
JBrowse config — showed the result plainly. In `getSnapshot`, MST's own frame
was a minority of the time; the majority was `getAdm` / `get_` / `hasProp` /
`createInstanceofPredicate`'s closure, i.e. the trap machinery, repeated 32
times per snapshot.

## Decision

**Resolve the administration once per operation and index `values_` directly.**
`getPropObservables(storedValue)` does one `_getAdministration()` call and
returns its `values_` map; `getSnapshot`, `getChildren` and
`finalizeNewInstance` then do a `Map.get` per property. `finalizeNewInstance`
assigns the `dehancer` field itself — which is exactly, and only, what
`_interceptReads` does with its result.

**`values_` is mobx-internal, so the shortcut is optional, never assumed.**
`getPropObservables` returns `undefined` when the field is absent and every
caller keeps its supported-API path (`getAtom` / `_interceptReads`). A mobx that
renames or drops `values_` therefore degrades to the previous speed instead of
breaking silently. This matters: `6a7ee024` already had to chase mobx internals
that disappeared in mobx 7, so **re-check this on every mobx major**.

The map is complete for our instances. `getAtom` also falls back to
`materializeLazyComputed_` / `materializeLazyObservable_` because mobx defers
constructing an `ObservableValue` for *decorator* annotations; `createNewInstance`
builds instances through `observable.object`, which populates `values_` eagerly
for every declared property. MST never uses mobx decorators.

**Separately, `ArrayType.willChange` stopped copying the whole array for a
single-element write.** It called `node.getChildren()` — `storedValue.slice()` —
before switching on the change type, so `arr[i] = x` was O(array length) even
though only the child at `i` gets reconciled. The copy now lives in the `splice`
branch, which is the only one that needs the full list.

## Measurements

A/B against `b408c3a0`, alternating rounds, per-round medians (n=25), repeated
runs. Two builds imported into one node process, per the harness in CLAUDE.md.

| scenario | speedup |
| --- | --- |
| `getSnapshot` of a 32-prop stripDefault config | 3.19x – 3.25x |
| single-element assign in a 2000-element array | 3.38x – 4.41x |
| create wide stripDefault config | 1.77x – 1.82x |
| create with type-checking on | 1.76x – 2.01x |
| `applySnapshot` replace-all, 500 identified | 1.20x – 1.33x |
| `union.is()` on a wide member | 1.11x – 1.25x |
| map set, model-type chain construction, hydrate union | 1.04x – 1.23x |
| `onPatch` + deep write, `resolveIdentifier` | no change |

No scenario regressed.

## Consequences

- **Compatibility was verified against the consumer, not just the suite.** The
  installed `@jbrowse/mobx-state-tree@6.1.0` dist was confirmed byte-identical to
  a build of this repo at the baseline commit, then swapped for the new build
  (restored via `trap restore EXIT`). All three project groups matched their
  baseline exactly: `packages/*` 2665 tests / 43 snapshots, `plugins` 7148 tests
  / 174 snapshots, `products` 1663 tests / 327 snapshots — 0 failures, 0 snapshot
  diffs on either side. Runtime export list and `index.d.ts` are byte-identical
  to the baseline build.
- **The remaining cost in both paths is mobx's, not MST's.** After the change,
  creation is dominated by `defineObservableProperty_`/`extendObservable` (one
  `ObservableValue` per property is inherent to the design) and `getSnapshot` by
  the computed's dependency tracking (`bindDependencies`/`reportObserved` over 32
  props). There is no further MST-side lever here short of not using
  `observable.object` per node.
- **`isStateTreeNode` pays a proxy trap and cannot avoid it.** `$treenode` is an
  own property of the proxy *target*, so `value?.$treenode` costs a trap plus
  `getAdm`/`hasProp`. MST only ever holds the proxy, so there is nothing to
  shortcut.
