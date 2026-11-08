# @jbrowse/mobx-state-tree

Our fork of mobx-state-tree, published to npm and consumed by JBrowse, its
plugins and out-of-tree apps such as Apollo3, so a green suite here is not a
compatibility story. Docs are in `agent-docs/`; its `CLAUDE.md` says what goes
where.

- **Verify as CI does:**
  `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test-ci`.
  `pnpm test` never runs production mode, where validation is a no-op, so a
  change that moves validation can pass it and break production; some tests
  run in one mode alone.
- **`~/src/jbrowse-components` installs the published fork from the pnpm store,
  so editing source here changes nothing there.** Try a build in it with
  [agent-docs/reference/testing-against-jbrowse.md](agent-docs/reference/testing-against-jbrowse.md):
  that package's files are hardlinked into the store every project on the
  machine shares, so move its `dist` aside rather than copying onto it.
- **Size a performance change with
  [agent-docs/reference/benchmarking.md](agent-docs/reference/benchmarking.md).**
  `vitest bench`, a single invocation and a loaded machine each give a
  confident ratio that is wrong.
- **When bumping mobx, re-run `scripts/ab-value-churn.mjs`.**
  `getPropObservables` in `src/types/complex-types/model.ts` reads mobx's
  internal `values_` and falls back to the slow path without a sound if mobx
  drops it
  ([ADR 0002](agent-docs/architecture-decision-records/0002-mobx-proxy-traps-and-per-property-lookups.md)).
