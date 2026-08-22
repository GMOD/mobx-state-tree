# @jbrowse/mobx-state-tree

Our fork of mobx-state-tree, published to npm and consumed by JBrowse and by
third parties. `agent-docs/adr/` holds the decisions where the obvious change is
wrong for a measured reason — read
[0001](agent-docs/adr/0001-keyed-array-reconcile-and-no-validation-cache.md)
before touching array reconciliation or union dispatch,
[0002](agent-docs/adr/0002-mobx-proxy-traps-and-per-property-lookups.md) before
touching how `ModelType` reaches a property's mobx observable — or when
upgrading mobx, since it depends on the internal `values_` field — and
[0003](agent-docs/adr/0003-type-construction-is-per-type-work.md) and
[0004](agent-docs/adr/0004-a-type-object-is-its-field-list.md) before adding
anything to a type's constructor — including a field — or touching
`BaseType.name` / the `flags` getters.

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

**`~/src/jbrowse-components` installs the _published_ fork from the pnpm store —
it is not symlinked to this repo, so editing source here does nothing there.** To
A/B a change against it:

1. `PKG=$JB/node_modules/.pnpm/@jbrowse+mobx-state-tree@<ver>_mobx@<ver>/node_modules/@jbrowse/mobx-state-tree`
2. Back up `$PKG/dist` and verify it is byte-identical to a build of this repo at
   the released tag. That is what makes the swap a true A/B.
3. **`mv "$PKG/dist" "$PKG/dist.orig"` and copy into a fresh directory — never
   `cp` onto the files in place.** Those files are **hardlinked into pnpm's
   content-addressable store** (`stat -c %h` reads 7+), so writing through them
   corrupts the store for every other project sharing the inode. `mv` the
   directory aside and the originals stay untouched on their own inodes.
   **Restore from a bash `trap restore EXIT INT TERM`** — a failure must not
   leave someone else's checkout on a private build.
4. **Invoke jest/tsc directly, not through `pnpm test`.** pnpm's
   `verify-deps-before-run` fires a real install (seen: `Packages: +4 -4`) that
   can rebuild `node_modules` mid-A/B. Two traps in doing so: `node_modules/.bin/jest`
   is a **shell wrapper, not JS** (`node` on it dies with `SyntaxError: missing )`),
   so use `node node_modules/jest/bin/jest.js`; and without
   `NODE_PATH=$JB/node_modules/.pnpm/node_modules` — which `pnpm run` would have
   set — `config/jest/babelTransform.cjs` cannot resolve `babel-jest` and jest
   exits having run **0 of N suites** while still printing a summary that looks
   like a result.
5. Jest writes to **stderr**: capture with `> file 2>&1`, never `2>&1 > file`,
   which prints to the terminal and writes an empty file.

Run the three project groups separately: `packages/core/src packages/product-core
packages/app-core` is fast and MST-dense (~100 s), `plugins` is the big one
(~520 s), `products` holds the slow image-snapshot tests (~760 s). **Capture a
baseline run first** — pre-existing and flaky failures over there are normal, and
assuming a failure is yours costs a lot of time. One shortcut: run the _swapped_
side first, and only run the baseline if something goes red. An all-pass result
cannot be concealing a pre-existing failure, which halves the wall clock on the
common outcome.

**Verified green on the tree as of August 2026** (six commits after 6.2.0:
dedupe, the `createActionTrackingMiddleware` fix, the `isXType` guard
signatures, redundant-assertion removal): `packages/core+product-core+app-core`
**3039/3039** on both sides, `plugins` **7996/7996**, `products` **1870/1870**,
and `pnpm typecheck` **0 errors** on both sides — that last one is the only run
that exercises a `.d.ts` change, since jest transforms with babel and never
typechecks. Note jbrowse dropped its `never`-narrowing workaround in
`packages/core/src/util/mst-reflection.ts` (`b16ba6adf3`); the casts that
remain there are a different gap — guard signatures whose leftover generic
constraints reject concrete types, and missing `ILiteralType`/
`cannotDetermineSubtype` exports.

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
`NODE_ENV=test`, which leaves full validation on and is _not_ what ships):

- **~44% of the run is MST, and roughly 27 points of that is building model
  _types_, not instances** — `ModelType` constructor, `cloneAndEnhance`,
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

**Type construction is now ~2.4x faster** — see
[ADR 0003](agent-docs/adr/0003-type-construction-is-per-type-work.md) (1.65x)
and [ADR 0004](agent-docs/adr/0004-a-type-object-is-its-field-list.md) (a
further 1.4-1.5x). The lesson generalizes: JBrowse builds ~20k unions and ~20k
optionals per session load (one of each per config slot), so **anything a
type's constructor does is multiplied by twenty thousand**. Name folding and
flag folding moved to first read; and **every field declared on a type class is
materialized on every type object**, whether it is a phantom that has no runtime
meaning (ADR 0003) or a real one that only ever holds its default (ADR 0004) —
those go on the prototype. Reproduce with `scripts/config-schema-profile.mjs`,
A/B with `scripts/ab-config-schema.mjs`, and read a profile with
`scripts/prof-summary.mjs <file.cpuprofile>`.

**ADR 0004 also lists four changes that looked obviously right and measured
neutral or worse** — read it before re-trying anything in `cloneAndEnhance` or
`toPropertiesObject`. Its prototype-hoisting trick is **ABI-safe**; see the
`abi.test.ts` note below for why, and why deleting a field is not.

**Watch out for `abi.test.ts` when you change a type's own properties.**
JBrowse's `packages/core/src/ReExports/abi.test.ts` pins the export names
plugins may have linked against, and `@jbrowse/core/util/Base1DViewModel` is
served as an MST **type object**, so its baseline enumerated MST's internals —
`C`, `N`, `S`, `T`, `isType`, `propertiesArePreProcessed`, `preProcessor`,
`duplicateKeysChecked` and friends — as if they were ABI. **The check is
`n in mod`, so it follows the prototype chain**: moving a field off the instance
is invisible to it, and only a name that stops existing anywhere fails. Size the
blast radius of a change with `in`, not `Object.keys` — even though
`Object.keys` is what generated the baseline.

**That test is green again as of August 2026** — jbrowse regenerated
`abiBaseline.json`, and the `Base1DViewModel` entry is now exactly the fourteen
names that survive ADR 0003 (`C`, `N`, `S`, `T` and `propertiesArePreProcessed`
are gone from the pin). So the old "3017/3018 in its group" is stale: verified
against a swapped-in 6.2.0+ build, the group runs **3039/3039** and `plugins`
**7996/7996**. Two of the pinned fourteen (`isType`, `name`) already answer
`false` to `Object.keys` and `true` to `in`, which is the standing proof that
the check is `in`. Keep all fourteen reachable and it stays green.

**Startup is not the interesting workload, though — value churn is.** For rapid
value changes (dragging/scrolling a view, where one prop is written per frame
and everything observing it re-derives), the cost of a single typed write on a
JBrowse-shaped session, measured in-process with alternating rounds:

| what is listening                        | µs per write             |
| ---------------------------------------- | ------------------------ |
| nothing                                  | ~9 µs                    |
| `onPatch(root)`                          | ~9 µs — essentially free |
| an `autorun` over derived computeds      | ~18 µs                   |
| **`onSnapshot(root)`**                   | **~75 µs (was ~150 µs)** |
| an `autorun` reading `getSnapshot(view)` | ~28 µs (was ~70 µs)      |

Two things follow, and the first matters more than any MST change:

- **`onSnapshot` on a hot path turns every value change into a subtree
  reserialize, ~8x the cost of the write itself.** `onPatch` costs nothing by
  comparison. 95 files in jbrowse-components reference `onSnapshot`; if any sit
  above a view that changes per frame, that is the dominant cost of the change.
  Debounce it or switch to patches.
- The cost is **flat in tree size** (measured 10 → 800 tracks): child snapshots
  are memoized, so only the path from the changed node to the root re-serializes.
  It scales with the _width of the models on that path_, not the size of the
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
is not.** TimeTraveller debounces _recording_ with a 300 ms `setTimeout` inside
the callback — but MST must compute the snapshot to invoke the callback at all,
so 119 of 120 frames serialize the session and throw it away. Compare
`setupSessionStorageAutosave` (`products/jbrowse-web/src/rootModel/persistence.ts`),
which wraps the same `getSnapshot(session)` in `autorun(..., { delay: 400 })`:
mobx defers the whole body, so it costs nothing per frame. That is the pattern to
copy. (Beware grepping for this: most `onSnapshot` hits in jbrowse are substring
matches on `getSessionSnapshot(` / `migrateSessionSnapshot(`; there are only
three real `onSnapshot(` call sites in non-test source.)

**Fixed upstream in jbrowse** (`perf(core): stop re-serializing the session on
every change for undo`): TimeTraveller now triggers on `onPatch`, which fires
synchronously on the same changes but costs nothing, and takes the snapshot once
inside the debounce window. 194 → 67 µs per frame, 2.89x, measured against the
_published_ 6.1.0 dist so it stacks with the ADR 0002 work rather than
overlapping it.

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
since GC spikes skew means. Two are checked in — both take
`<baselineDist> <newDist> [rounds]`:

- `scripts/ab-config-schema.mjs` — type construction, 262 jbrowse-shaped config
  schemas.
- `scripts/ab-value-churn.mjs` — one typed write per frame on a jbrowse-shaped
  session. `MODE=onSnapshot|bare|autorunSnapshot`. **Size the inner loop or it
  lies:** at the default `INNER=400` a no-op change reads a steady 0.96–0.99x;
  at `INNER=2000`+ the same pair reads 1.00–1.03x. A _consistent_ direction is
  not by itself evidence when each sample is near timer granularity.

**Some changes are memory-shaped, and no timer here can see them.** Removing an
own slot from a type object (the ADR 0003 / 0004 trick) moves allocation, and
below the timing floor that is indistinguishable from doing nothing.
`scripts/mem-config-schema.mjs [distDir]` (needs `--expose-gc`) runs the same
262-schema workload and reports retained heap plus the own-slot count over the
reachable type graph — **the same to the byte on every run**, so a sub-1% effect
is legible there and invisible in the A/B. Run it before concluding that a slot
removal "did nothing" _or_ that it sped anything up: hoisting `flags` measured
0.99x on the timer against a 1.00x null control, and −1,582 slots / −0.6% heap
here — real, and not worth the code, so it was **reverted**. See the follow-up
section of ADR 0004 before re-trying it. The payoff of that trick scales with
how many _objects_ carry the field, not how many classes declare it.

**One invocation resolves nothing under ~1.1x, whatever the round count.** Two
byte-identical dists at 41 rounds, eight invocations, read **0.933x to 1.022x**
— and six same-direction results in a row happened on those identical builds, so
a consistent direction is not by itself evidence. Worse, **load inflates the
winner rather than just widening the spread**: one change here measured 1.22x at
load average 16 and 1.12x quiet. This checkout is shared with other agents
running `tsc`, so check `uptime`, take several invocations, and re-measure
anything you intend to write down once the machine is idle.

Put the baseline dist **inside** the worktree (`./dist-base`) — an `.mjs` under
`/tmp` cannot resolve `import "mobx"`.

**Neutralize `process.env` in any node benchmark, or you will profile the wrong
thing.** Node serves `process.env` from a live getenv proxy, and mobx reads
`process.env.NODE_ENV` on _every_ observable read and write — branches a bundler
dead-code-eliminates for real consumers. Left alone, that one guard
(`checkIfStateReadsAreAllowed`) measured **38.8% of `getSnapshot`**, drowning out
every MST frame. Put this above the imports:

```js
process.env.NODE_ENV = "production"
Object.defineProperty(process, "env", { value: { ...process.env } })
```

A/B _ratios_ survive without it — both sides pay equally — but profiles do not,
and the ratios understate MST-side wins.

Also note the ESM entry: `import "mobx"` resolves to `dist/mobx.mjs`, the
unminified build with those guards intact. There is no production condition to
opt into from a plain `.mjs`.

**Worktree setup is automatic.** `.claude/hooks/setup-worktree.sh` runs on
`WorktreeCreate` and does `pnpm install` in the new worktree. **Its stdout must
be the worktree path and nothing else** — the runtime reads a `WorktreeCreate`
hook's stdout as the directory to enter, and fails the whole `EnterWorktree` if
it is empty. Printing a `{"systemMessage": ...}` blob there (the earlier bug)
makes it chdir into a directory by that name. Status goes to
`~/.claude/worktree-hook.log`. Don't symlink the
main checkout's `node_modules` instead: it happens to work here (single package)
but not in a pnpm _workspace_ like jbrowse, where each package's deps and the
links between packages live in `<pkg>/node_modules` — there, a root-only symlink
gives `tsc` 12k unresolved-import errors. Run the script by hand for a worktree
you made with plain `git worktree add` (it echoes the path; status is in the log):

```
echo '{"worktree_path":"/path/to/wt"}' | .claude/hooks/setup-worktree.sh
```

**Building a baseline without disturbing this worktree.** Don't use
`scripts/build-both-branches.sh` (wired to `prebench`) — it does `git checkout` of
two branches, which is unsafe in a shared worktree, and it refuses to run with
uncommitted changes anyway. Instead:

1. `git worktree add --detach <scratch>/baseline HEAD`
2. `ln -s <main>/node_modules <scratch>/baseline/node_modules` (or run the setup
   hook above, which avoids the `pnpm build` caveat in step 3)
3. Build there with the binaries directly —
   `<main>/node_modules/.bin/tsc && <main>/node_modules/.bin/rollup -c`. **Not
   `pnpm build`**: pnpm's dep check tries to purge the symlinked `node_modules`
   and aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
4. Copy its `dist/` aside, build the main worktree the same way, then import both
   bundles from one node process.
5. `git worktree remove --force <path>` when done.

The same trick isolates a _single_ change: copy current `src` into the baseline
worktree, revert just the one thing there, and A/B against the full build. That
is how the `getSnapshot` strip-default `instanceof` check was shown to cost
nothing measurable (idea dropped), and how memoizing `Union.flags` was sized at
only ~4–6%, on union creation alone.
