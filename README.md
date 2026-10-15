# @jbrowse/mobx-state-tree

Fork of [mobx-state-tree](https://mobx-state-tree.js.org) v5.4.2 for [JBrowse 2](https://jbrowse.org).

- **In:** any upstream MST code. Every upstream type and API is still here.
- **Out:** the same trees, with the additions and fixes below.
- Each bullet links to the page, ADR or commit that has the detail.
- [CHANGELOG.md](CHANGELOG.md) lists every release.

## Added APIs

Details in [docs/added-apis.md](docs/added-apis.md).

- `types.resilient(type, fallback, createFallbackSnapshot)`: an unrecognized snapshot builds the fallback instead of crashing the tree.
- `types.stripDefault(type, default)`: like `optional`, but the key leaves the snapshot when the value equals the default.
- `types.union({ members: () => [...] })`: membership re-read on every operation, for lazily loaded types.
- `extendInstance(instance, fn)`: attach views, actions and volatile state to a live instance.
- `getChildType`, `getUnionSubtypes`, `getDefaultInstanceOrSnapshot`: reflection for editors and inspectors.
- `getWrappedType`, `unwrapType`, `asArrayType`, `asMapType`, `asModelType`: exact-type helpers.
- `types.compose` takes 11 parts, up from 9.

## Error messages

Details in [docs/error-messages.md](docs/error-messages.md).

- Conversion errors are depth-bound, length-capped and limited to 10 entries.
- A discriminated union reports only the member whose literal `type` matched.

## Behavior changes

Details in [docs/behavior-changes.md](docs/behavior-changes.md).

- A refused write leaves the tree as it found it.
- A never-read node still runs `beforeDestroy` and its disposers.
- Detaching an ancestor of a reference's target invalidates the reference.
- A throwing preprocessor counts as a refusal during union dispatch.
- A flow that yields a non-promise rejects.
- Action-tracking middleware keeps per-instance state and settles after its last flow.

## Performance

Details in [docs/performance.md](docs/performance.md).

- Keyed array reconcile is linear: 10x at n=1000.
- Type construction is ~2.4x faster, and no-options unions are interned: −34% heap.
- `onSnapshot` and `getSnapshot` reads are ~2x faster, and the `onSnapshot` reaction dies with its last listener.
- The validation-result cache is gone.

## Types and build

- `isArrayType`, `isMapType` and `isModelType` return `boolean`; use the `as*Type` helpers to narrow ([ADR 0006](agent-docs/architecture-decision-records/0006-type-guards-answer-holds-not-is.md)).
- Phantom `unique symbol` properties became string-keyed brand interfaces, which fixes tsgo TS4058/TS4023.
- `NonEmptyObject` is removed.
- `setDevMode()` replaces reading `process.env.NODE_ENV`.
- Dual CJS/ESM build, Vitest instead of Jest, eslint instead of tslint.

## Design records

[agent-docs/architecture-decision-records](agent-docs/architecture-decision-records) holds the decisions where the obvious change is wrong for a measured reason. Read the matching ADR before touching array reconciliation, union dispatch, type construction or the `isXType` guards.
