# Performance choices

The workload that drives these is JBrowse: hundreds of config-schema types built at startup, large arrays loaded through `applySnapshot`, and one typed write per frame while a view scrolls.

- Numbers come from the harnesses in `scripts/`. `CLAUDE.md` explains how to run them and why one invocation resolves nothing under ~1.1x.
- Each decision has an ADR with the measurement and what was tried and rejected.

| Area              | Choice                                                                                                                             | Result                                                                         | ADR                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Array reconcile   | Index old nodes by identifier; build a fresh result array with a claimed bitmap                                                    | Full replacement is O(n), 10x at n=1000. A 2,000-string reverse is 35x faster. | [0001](../agent-docs/architecture-decision-records/0001-keyed-array-reconcile-and-no-validation-cache.md)                                                                                   |
| Validation cache  | Deleted. It only helped replacing a populated union array, and served stale results after a snapshot mutated                       | No regression                                                                  | 0001                                                                                                                                                                                        |
| Union dispatch    | Production quick-match by required keys and literal props instead of full validation                                               | ~1.5x faster hydration of wide members                                         | 0001                                                                                                                                                                                        |
| mobx access       | Read a model's property observables once per operation, not once per property                                                      | `onSnapshot(root)` 2x, `autorun(getSnapshot(view))` 2.5x faster                | [0002](../agent-docs/architecture-decision-records/0002-mobx-proxy-traps-and-per-property-lookups.md)                                                                                       |
| Type construction | Charge per use, not per type: phantom fields are `declare`d, name and flags fold on first read, unset fields live on the prototype | ~2.4x faster for 262 config schemas                                            | [0003](../agent-docs/architecture-decision-records/0003-type-construction-is-per-type-work.md), [0004](../agent-docs/architecture-decision-records/0004-a-type-object-is-its-field-list.md) |
| Unions            | A union with no options is interned on its member tuple                                                                            | Retained heap −34%, reachable type objects −46%                                | [0005](../agent-docs/architecture-decision-records/0005-a-union-is-a-pure-function-of-its-members.md)                                                                                       |
| Instance creation | The root snapshot computes lazily, not eagerly at `create()`                                                                       | Removed ~42% of `create()` time on a wide session                              | -                                                                                                                                                                                           |
| `stripDefault`    | Compare snapshots by walking, with a size short-circuit, not by stringifying                                                       | Hot path for every JBrowse config schema                                       | -                                                                                                                                                                                           |
| Actions           | Build each action's mobx wrapper once, not per call                                                                                | -                                                                              | -                                                                                                                                                                                           |
| `detach`          | Move only the detached subtree's nodes between identifier caches, not scan every identifier in the tree                            | Detaching 600 of 3,600 nodes: 4.5 s to 34 ms (upstream 9.0.0: 52 ms)           | -                                                                                                                                                                                           |
| Snapshot identity | A node's first snapshot read after instantiation returns the initial snapshot object when its entries are unchanged                | A snapshot taken before a read still matches by identity, so undo skips it     | -                                                                                                                                                                                           |

## Choices that measured neutral

- Batching MST's per-getter `makeObservable` into one call was rejected: the cost is mobx's per-computed work.
- Hoisting `flags` to the prototype saved 0.6% heap and no time, so it was reverted ([ADR 0004](../agent-docs/architecture-decision-records/0004-a-type-object-is-its-field-list.md)).
- Compiling with `useDefineForClassFields: false` (upstream #2309) measured inside the noise of a null control. The build targets `esnext`, so classes already emit native fields.

## Against upstream 9.0.0

Fork 6.10.0 against upstream `mobx-state-tree` 9.0.0 (the published `dist/mobx-state-tree.module.js`), production mode, alternating rounds, medians. The machine was loaded (load average 8-15), so read ratios under ~1.1x as ties.

| Scenario                                         | upstream 9.0.0 | fork 6.10.0 | Ratio               |
| ------------------------------------------------ | -------------- | ----------- | ------------------- |
| `onSnapshot(root)` per write (`ab-value-churn`)  | 65 µs          | 27 µs       | 2.4x faster         |
| `autorun(getSnapshot(view))` per write           | 91 µs          | 28 µs       | 3.2x faster         |
| Bare typed write                                 | 6.8 µs         | 3.8 µs      | 1.8x faster         |
| Drag 600 elements x10, `getSnapshot` each step   | 676 ms         | 232 ms      | 2.9x faster         |
| Reverse-replace 600 elements via `applySnapshot` | 490 ms         | 227 ms      | 2.2x faster         |
| `detach` 600 of 3,600 nodes                      | 52-66 ms       | 34 ms       | 1.5x faster         |
| Drag 600 elements x10, no snapshot reads         | 62 ms          | 52 ms       | 1.2x (near the tie) |
| Move one page of 100 via `applySnapshot`         | 0.24 ms        | 16.8 ms     | 70x **slower**      |
| Undo to a snapshot, 600 changed elements         | 69-80 ms       | 87-138 ms   | 1.2-2x **slower**   |

- Reproduce the editor rows with `scripts/ab-editor.mjs <baselineDist> <newDist>` and the first three with `scripts/ab-value-churn.mjs`.
- The baseline directory holds upstream's `mobx-state-tree.module.js` copied to `mobx-state-tree.mjs`.
- The two slower rows come from re-validating the whole snapshot: the validation cache is gone (ADR 0001). Only undo/redo and session loads reach it.
