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
