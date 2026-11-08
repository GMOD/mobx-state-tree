# Benchmarking

## A/B with the alternating-round harnesses

`vitest bench` runs all of one build's samples, then all of the other's: ±5–13%
rme on create/applySnapshot, and one build pair read "baseline 1.26x faster" on
one scenario and "optimized 1.17x faster" on a near-identical one. `pnpm bench`
is for single-build microbenchmarks only.

The harnesses in `scripts/` time A then B back to back each round, flip the
leading side every round, and compare per-round medians, since GC spikes skew
means. Each takes `<baselineDist> <newDist> [rounds]`:

- `scripts/ab-config-schema.mjs`: type construction, 262 jbrowse-shaped config
  schemas.
- `scripts/ab-value-churn.mjs`: one typed write per frame on a jbrowse-shaped
  session, `MODE=onSnapshot|bare|autorunSnapshot`. Raise `INNER` to 2000 or
  more: at the default 400 a no-op change reads a steady 0.96–0.99x, because
  each sample sits near timer granularity.
- `scripts/ab-editor.mjs`: an editor-shaped tree, pages of identified elements
  with ~60 props each.

`scripts/config-schema-profile.mjs [dist]` profiles the config-schema workload,
and `scripts/prof-summary.mjs <file.cpuprofile> [topN]` reads a profile.

## What one run can resolve

One invocation resolves nothing under ~1.1x, whatever the round count. Two
byte-identical dists at 41 rounds, eight invocations, read 0.933x to 1.022x,
including six same-direction results in a row, so a consistent direction is not
evidence by itself. Load inflates the winner rather than only widening the
spread: one change measured 1.22x at load average 16 and 1.12x quiet. Other
agents share this machine, so check `uptime`, take several invocations, and
re-measure anything you intend to write down once the machine is idle.

## Memory-shaped changes

Removing an own slot from a type object (the ADR 0003 / 0004 trick) moves
allocation, and below the timing floor that is indistinguishable from doing
nothing. `node --expose-gc scripts/mem-config-schema.mjs [distDir]` runs the
262-schema workload and reports retained heap plus the own-slot count over the
reachable type graph, the same to the byte on every run. Run it before
concluding that a slot removal did nothing or that it sped anything up; ADR
0004's follow-up has the `flags` hoist that was real and still not worth the
code. The payoff scales with how many objects carry the field, not how many
classes declare it.

## Writing a new node benchmark

Put this above the imports, as every script in `scripts/` does:

```js
process.env.NODE_ENV = "production"
Object.defineProperty(process, "env", { value: { ...process.env } })
```

Node serves `process.env` from a live getenv proxy, and mobx reads
`process.env.NODE_ENV` on every observable read and write, in branches a
bundler removes for real consumers. Left alone, that one guard
(`checkIfStateReadsAreAllowed`) measured 38.8% of `getSnapshot`. A/B ratios
survive without it, since both sides pay, but profiles do not, and the ratios
understate MST-side wins. `import "mobx"` from a plain `.mjs` resolves to the
unminified `dist/mobx.mjs`, with those guards intact.

## Building a baseline

Put the baseline dist inside the worktree (`./dist-base`); an `.mjs` under
`/tmp` cannot resolve `import "mobx"`.

- `git worktree add --detach <scratch>/baseline HEAD`
- Give it `node_modules`: run the setup hook,
  `echo '{"worktree_path":"<scratch>/baseline"}' | .claude/hooks/setup-worktree.sh`
  (status goes to `~/.claude/worktree-hook.log`), which also serves any
  worktree made with plain `git worktree add`. Symlinking the main checkout's
  `node_modules` works here, since this is a single package, but then build
  with `<main>/node_modules/.bin/tsc && <main>/node_modules/.bin/rollup -c`:
  `pnpm build` tries to purge the symlinked `node_modules` and aborts with
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
- Copy its `dist/` aside, build the main worktree the same way, then import
  both bundles from one node process.
- `git worktree remove --force <path>` when done.

To isolate a single change, copy the current `src` into the baseline worktree,
revert just that one thing there, and A/B against the full build.
