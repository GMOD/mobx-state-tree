# ADR 0001 — Keyed array reconcile, no validation cache, keep the union quick-match

Status: Accepted (July 2026)

## Context

JBrowse loads large arrays via `applySnapshot`, so array reconciliation is the
fork's hottest real-world path.

`reconcileArrayChildren` (`src/types/complex-types/array.ts`) matches each new
value to a reusable old node. On an aligned-position miss it used to scan the
remaining old nodes linearly via `areSame`, which runs a deep `is()` type check.
A **full array replacement** — new identifiers at every position — matches
nothing, so every position scanned to the end: **O(n²), with a deep validation at
each step**. Measured, an `applySnapshot` of 100 items made ~11.8k `validate`
calls, ~10k of them redundant repeats.

A validation cache (a `WeakMap` in `src/core/type/type.ts`) had been added
earlier and appeared to help. It was a band-aid over exactly this O(n²): it
turned the redundant deep validations into `WeakMap` hits without removing the
scan.

## Decision

**Index old nodes by identifier once, and resolve matches by lookup.** A miss
becomes O(1), so full replacement is O(n). Measured at n=1000, full replacement
is 10.3x faster and scales linearly where the baseline was quadratic.

**The validation cache is deleted.** Instrumented `validate()` hit counts (N=200)
showed it earns its keep in exactly one case — replacing or reordering an
_already-populated union array_, the O(n²) scan (39,800 hits = 200×199). It gives
**zero** hits for frozen arrays, plain identified replace-all, and union _initial_
load (empty→fill does no scanning). So it did nothing for construction or for any
common JBrowse path, and it carried a latent staleness bug: keyed by object
identity and never invalidated, so mutating a snapshot object between validations
returned a stale result. Full dev, prod and type suites pass unchanged without it;
no test depended on it.

**The union `determineType` quick-match stays** — it is not a band-aid. In
production (`!isTypeCheckingEnabled()`), `tryQuickMatch`/`snapshotLooksLikeType`
pick a union member by required-key presence and literal-prop match instead of
full recursive validation. Negligible for narrow members, but ~1.5x faster
hydration for **wide** ones (177ms→115ms at N=2000, ~44 slots each — the shape of
a JBrowse config schema).

## The correctness constraint, learned by breaking four tests

**Do not reorder the `&&` in `areSame` to put `isMatchingSnapshotId` before
`is()`.** For `snapshotProcessor`, `isMatchingSnapshotId` runs the user's
`preProcessSnapshot`; during a union scan, `is()` is the type guard that stops a
subtype's preprocessor from running on a different subtype's snapshot.

That is why the O(n) path is gated to plain model element types with an
identifier — `childType instanceof ModelType && childType.identifierAttribute`.
Union, `snapshotProcessor` and `late` element types stay on the scan deliberately.

## Consequences

Two paths remain O(n²), both known and both judged lower priority than the risk
of changing them:

- **Genuine large reorderings of keyed items.** The id map does not fix this: the
  reorder branch still needs `oldNodes.indexOf(candidate, i)` for the splice
  index, and `oldNodes.splice(j, 1)` itself shifts elements. Splice-in-place is
  inherently quadratic for reorders. A true O(n) reconcile means abandoning it for
  a standard keyed-list diff — build a fresh result array, look each new value up
  by id, then kill unused old nodes. Any such rewrite must preserve the
  `is()`-before-id ordering above, the "double parent" throw, and undead-node
  handling (`createObservableInstanceIfNeeded()` before `die()`). **Profile a real
  JBrowse workload before attempting it**: JBrowse's "load new data" is
  replace-all, which is already O(n), and genuine large reorders may be rare
  enough not to matter.
- **Union and `snapshotProcessor` arrays on replacement**, now the only O(n²) path
  without the cache masking it. Removing the cache regressed wholesale replacement
  of a populated union array by ~2.6x, which is the accepted cost. JBrowse does not
  hit it hard: web migrated its `tracks` arrays to `types.frozen` (frozen elements
  are scalar nodes, so `areSame` returns at the `instanceof ObjectNode` check and
  never calls `is()`), having moved for a different reason — hydrating thousands of
  union models measured 17x slower to construct than frozen, and the cache never
  helped construction either. Desktop still uses hydrated union config schemas, but
  its common operation is initial load, which does no scanning.

Making union arrays O(n) is possible — give `reconcileArrayChildren` an id index
for unions too, built from the old nodes' own `.identifier`, and run the full
`areSame` (with `is()` first) against the single candidate. It **must exclude**
unions containing `snapshotProcessor` or `late` members, whose identifier only
exists after `preProcessSnapshot`, so a raw-snapshot lookup would miss. This is
the code that broke four tests before; treat it as high risk.
