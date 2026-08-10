# @jbrowse/mobx-state-tree

Our fork of mobx-state-tree, published to npm and consumed by JBrowse and by
third parties. `agent-docs/adr/` holds the decisions where the obvious change is
wrong for a measured reason — read
[0001](agent-docs/adr/0001-keyed-array-reconcile-and-no-validation-cache.md)
before touching array reconciliation or union dispatch, and
[0002](agent-docs/adr/0002-mobx-proxy-traps-and-per-property-lookups.md) before
touching how `ModelType` reaches a property's mobx observable — or when
upgrading mobx, since it depends on the internal `values_` field.

## Verification norm

`npx tsc --noEmit`, `pnpm lint src/`, `pnpm test:dev --run`, `pnpm test:prod
--run`, `pnpm test:types`.

**Run prod mode, not just dev.** `typecheckInternal`/validation is a **no-op**
under `NODE_ENV=production`, and some tests are dev-only
(`describe.runIf(NODE_ENV !== 'production')`). A change that only moves
validation around can pass one mode and break the other.

Build output is `dist/mobx-state-tree.mjs` / `.cjs`.

## This fork has real consumers, so a green suite is not a compatibility story

JBrowse plugins depend on it, and so do out-of-tree consumers like Apollo3.

**`~/src/jbrowse-components` installs the *published* fork from the pnpm store —
it is not symlinked to this repo, so editing source here does nothing there.** To
A/B a change against it:

1. `PKG=$JB/node_modules/.pnpm/@jbrowse+mobx-state-tree@<ver>_mobx@<ver>/node_modules/@jbrowse/mobx-state-tree`
2. Back up `$PKG/dist` and verify it is byte-identical to a build of this repo at
   the released tag. That is what makes the swap a true A/B.
3. `cp -r <my dist> $PKG/dist`, run the suites, and **restore from a bash
   `trap restore EXIT`** — a failure must not leave someone else's checkout on a
   private build.
4. Jest writes to **stderr**: capture with `> file 2>&1`, never `2>&1 > file`,
   which prints to the terminal and writes an empty file.

Run the three project groups separately: `packages/core/src packages/product-core
packages/app-core` is fast and MST-dense, `plugins` is the big one, `products`
holds the slow image-snapshot tests. **Capture a baseline run first** —
pre-existing and flaky failures over there are normal, and assuming a failure is
yours costs a lot of time.

**What the consumers actually exercise**, so you know what a change can break.
JBrowse's imports are all public API — `types` by a wide margin, then
`getSnapshot`, `isAlive`, `addDisposer`, `getParent`, `isStateTreeNode`, `cast`;
nothing reaches internals. Within `types`, the shape that matters is
**`stripDefault`**: every JBrowse config schema is
`types.stripDefault(model, {type, id})`, slots are stripDefault too, and
sub-schemas nest the same way. That makes
`StripDefaultValue.shouldStripFromSnapshot` one of the hottest paths in the whole
app, and worth optimizing for "same key count as the default, differing only in
the identifier" — the normal case, which no size guard catches. Unions, by
contrast, barely matter to JBrowse and are mostly `dispatcher`-based (which
bypasses the quick-match path entirely).

**Where JBrowse's MST time actually goes — measure before optimizing for it.**
Profiled `createTestSession` over the 262-track `test_data/config_demo.json`
with MST forced to production mode (`setDevMode(false)`; jest otherwise runs
`NODE_ENV=test`, which leaves full validation on and is *not* what ships):

- **~44% of the run is MST, and roughly 27 points of that is building model
  *types*, not instances** — `ModelType` constructor, `cloneAndEnhance`,
  `toPropertiesObject`, `union()`, `BaseType`/`ComplexType`, plus the GC
  pressure they generate. JBrowse constructs a config-schema type per track at
  runtime via `makeConfigurationSchemaModel`.
- **Instance-level work barely registers, because `jbrowse.tracks` elements are
  `types.frozen`** — `isStateTreeNode(tracks[0])` is `false`. The 262 tracks
  never become model instances, so they never touch `getSnapshot`,
  `finalizeNewInstance` or reconciliation.
- The one instance-heavy operation, `addView('LinearGenomeView')`, is **57%
  mobx / 21% MST**, and the mobx half is `defineProperty_` /
  `defineComputedProperty_` installing ~60 computed views per instance.
  Batching MST's per-getter `makeObservable` into one call was tried and
  **rejected**: 1.05x/1.25x on an LGV-shaped model and both directions on a
  narrow one, i.e. noise. The cost is mobx's per-computed work, which batching
  does not remove.

So **type construction is the open target for JBrowse startup**, and
instance-path wins (however large in isolation) will not show up there. Note
also that a cross-process jest A/B of `createTestSession` is far too noisy to
resolve anything under ~1.3x — samples ranged 16–125 ms for one build.

**Startup is not the interesting workload, though — value churn is.** For rapid
value changes (dragging/scrolling a view, where one prop is written per frame
and everything observing it re-derives), the cost of a single typed write on a
JBrowse-shaped session, measured in-process with alternating rounds:

| what is listening | µs per write |
| --- | --- |
| nothing | ~9 µs |
| `onPatch(root)` | ~9 µs — essentially free |
| an `autorun` over derived computeds | ~18 µs |
| **`onSnapshot(root)`** | **~75 µs (was ~150 µs)** |
| an `autorun` reading `getSnapshot(view)` | ~28 µs (was ~70 µs) |

Two things follow, and the first matters more than any MST change:

- **`onSnapshot` on a hot path turns every value change into a subtree
  reserialize, ~8x the cost of the write itself.** `onPatch` costs nothing by
  comparison. 95 files in jbrowse-components reference `onSnapshot`; if any sit
  above a view that changes per frame, that is the dominant cost of the change.
  Debounce it or switch to patches.
- The cost is **flat in tree size** (measured 10 → 800 tracks): child snapshots
  are memoized, so only the path from the changed node to the root re-serializes.
  It scales with the *width of the models on that path*, not the size of the
  tree — a 40-prop view costs 40 property reads per write.

This is where the ADR 0002 work actually lands: 1.99x/2.19x on
`onSnapshot(root)` and 2.48x/2.59x on `autorun(getSnapshot(view))` across
repeated runs, while bare writes, `onPatch` and pure computed reactivity are
unchanged (those are mobx's own machinery, not MST's). After the change,
`ModelType.getSnapshot` is the largest single frame in the write path at 22%,
followed by mobx re-binding the computed's ~40 dependencies.

**Confirmed on a real interaction.** Instrumenting `autorun`/`reaction`/
`onSnapshot`/`onPatch` at registration (jest.mock is hoisted, so wrappers are in
place before any jbrowse module imports them) and dragging a real
LinearGenomeView over the volvox config, 120 frames of `horizontalScroll`:

- **Exactly one listener fires per frame**, and it is
  `onSnapshot` in `packages/core/src/util/TimeTraveller.ts` — undo/redo, wired as
  `types.optional(TimeTraveller, { targetPath: '../session' })`, so it serializes
  **the whole session** on every frame. Nothing else in the app fires per frame.
- Per scroll frame at the model layer, medians over 9 alternating rounds, twice:
  **176 → 99 µs and 113 → 65 µs, i.e. 1.74x–1.78x faster** as shipped. The undo
  listener's own share drops from ~25 µs to ~2–10 µs.

**The `onSnapshot` + `setTimeout` debounce is the trap; `autorun(..., {delay})`
is not.** TimeTraveller debounces *recording* with a 300 ms `setTimeout` inside
the callback — but MST must compute the snapshot to invoke the callback at all,
so 119 of 120 frames serialize the session and throw it away. Compare
`setupSessionStorageAutosave` (`products/jbrowse-web/src/rootModel/persistence.ts`),
which wraps the same `getSnapshot(session)` in `autorun(..., { delay: 400 })`:
mobx defers the whole body, so it costs nothing per frame. That is the pattern to
copy. (Beware grepping for this: most `onSnapshot` hits in jbrowse are substring
matches on `getSessionSnapshot(` / `migrateSessionSnapshot(`; there are only
three real `onSnapshot(` call sites in non-test source.)

**Cheap safety check for any change:** diff the runtime export list
(`Object.keys(require('dist/mobx-state-tree.cjs'))`) and the `index.d.ts`
declaration surface between old and new builds. Note `ComplexType`, `BaseType`
and `IdentifierCache` appear in the bundled `.d.ts` but are not `export`ed, so
their signatures are not part of the plugin-facing contract.

## Benchmarking

**The stock `__tests__/perf/mst.bench.ts` A/B harness is not trustworthy for
small deltas.** It runs all of one branch's samples then all of the other's, at
`{warmupIterations: 3, iterations: 20}`. On the allocation-heavy
create/applySnapshot scenarios that gives ±5–13% rme and self-contradictory
verdicts run to run — the same build pair once reported "baseline 1.26x faster"
on one create scenario and "optimized 1.17x faster" on a near-identical one.
Treat anything under ~1.3x from it as noise.

**What works:** an alternating-round harness. Per round, time A then B back to
back; flip the leading side each round; compare per-round **medians**, not means,
since GC spikes skew means. ~25 rounds with an inner loop sized to ~1 ms+ per
sample resolves 1.03x reproducibly.

**Neutralize `process.env` in any node benchmark, or you will profile the wrong
thing.** Node serves `process.env` from a live getenv proxy, and mobx reads
`process.env.NODE_ENV` on *every* observable read and write — branches a bundler
dead-code-eliminates for real consumers. Left alone, that one guard
(`checkIfStateReadsAreAllowed`) measured **38.8% of `getSnapshot`**, drowning out
every MST frame. Put this above the imports:

```js
process.env.NODE_ENV = "production"
Object.defineProperty(process, "env", { value: { ...process.env } })
```

A/B *ratios* survive without it — both sides pay equally — but profiles do not,
and the ratios understate MST-side wins.

Also note the ESM entry: `import "mobx"` resolves to `dist/mobx.mjs`, the
unminified build with those guards intact. There is no production condition to
opt into from a plain `.mjs`.

**Building a baseline without disturbing this worktree.** Don't use
`scripts/build-both-branches.sh` (wired to `prebench`) — it does `git checkout` of
two branches, which is unsafe in a shared worktree, and it refuses to run with
uncommitted changes anyway. Instead:

1. `git worktree add --detach <scratch>/baseline HEAD`
2. `ln -s <main>/node_modules <scratch>/baseline/node_modules`
3. Build there with the binaries directly —
   `<main>/node_modules/.bin/tsc && <main>/node_modules/.bin/rollup -c`. **Not
   `pnpm build`**: pnpm's dep check tries to purge the symlinked `node_modules`
   and aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
4. Copy its `dist/` aside, build the main worktree the same way, then import both
   bundles from one node process.
5. `git worktree remove --force <path>` when done.

The same trick isolates a *single* change: copy current `src` into the baseline
worktree, revert just the one thing there, and A/B against the full build. That
is how the `getSnapshot` strip-default `instanceof` check was shown to cost
nothing measurable (idea dropped), and how memoizing `Union.flags` was sized at
only ~4–6%, on union creation alone.
