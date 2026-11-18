# Known gaps

Each entry is a defect or an improvement that was found, reproduced and left
unfixed. No consumer has reported any of them. Delete an entry when its fix
lands.

A fix in node lifecycle code needs an adversarial review before it lands: the
reference fix in 6.10.1 passed the full suite three times while still dropping
an invalidation watch.

## Wrong behavior in production

- **A map `put` or a property assignment keeps a node whose `afterAttach`
  threw.** The write throws and the map or property does not hold the node, but
  the node stays parented and `resolveIdentifier` on the root still finds it,
  in development and production. Arrays roll this back (`2f7ceb64`,
  `967bd4af`); `MapType.willChange` and `ModelType.willChange` need the same
  record-before-attach rollback.
- **The identifier cache keeps a node that left the tree during a failed or
  re-entrant write.** `IdentifierCache.splitCache` moves the ids of the
  detached subtree by walking it. An identified node that was built but not yet
  stored when a hook detached its ancestor stays in the old root's cache, and
  so does a leaf whose `afterAttach` threw. A review confirmed both; neither
  has been probed since the walk landed (`d86682d2`).
- **Production can pick a different union member than development.** The
  production quick-match in `union.ts` matches a snapshot to a member by its
  keys and literal props, and gives the snapshot to a later member in three
  cases:
  - a legacy snapshot that an earlier member's preprocessor would migrate;
  - a model with a bare `types.frozen()` prop;
  - a member that is not a model, such as `maybe(Model)`, `frozen` or a nested
    union.

  The local branch `union-quick-match` holds a rewrite, tracked as
  [GMOD/mobx-state-tree#23](https://github.com/GMOD/mobx-state-tree/issues/23).
  Three review findings on it are open:
  - `mayBeLeftOut` reads the `Undefined` flag, which wrappers inherit, so a
    `snapshotProcessor` or `refinement` over `union(string, undefined)` makes
    production throw or pick a member that neither main nor development picks;
  - the branch asks every primitive member `is()` for an object, about 0.75x on
    `union(string, number, …, Model)`;
  - an undiscriminated union of preprocessed models is about 1.65x slower,
    which the fix cannot avoid and so needs a decision on scope.

  JBrowse's pluggable unions have no dispatcher, so they take this path.

- **A reused scalar node keeps its old subpath after a reorder.**
  `SimpleType.reconcile` (`src/core/type/type.ts:634`) returns the reused node
  without calling `setParent`, so reversing an array of primitives, frozen
  values or lazy nodes leaves each node with the index it had before. The tail
  loop in `ArrayType.willChange` re-stamps subpaths on every later splice,
  which is why that loop also runs for a splice that adds as many as it
  removes. The stale subpath is visible in two places: liveliness messages, and
  `types.lazy`, which after loading patches the slot named by the stale
  subpath.
- **`types.lazy` has three defects** (`src/types/utility-types/lazy.ts`).
  JBrowse does not use `types.lazy`.
  - `when(() => !node.isAlive)` reads a field mobx does not observe, so the
    reaction never runs again and dead nodes stay in `pendingNodeList`, as in
    upstream.
  - `pendingNodeList` is never emptied after the type loads.
  - Adding a model that holds a lazy value to an unprotected tree, outside an
    action, runs the type's `when` while the parent node is still being
    constructed. The parent's instance creation throws inside the reaction and
    the parent node is marked dead.

## Slower than needed

- **An optional prop validates the whole new value on every reconcile.**
  `OptionalValue.reconcile` (`src/types/utility-types/optional.ts:105`) calls
  `subtype.is(newValue)`. Moving one of 100 pages with `applySnapshot` took
  16.8 ms against 0.24 ms on upstream 9.0.0, with 82% of the time in
  `isValidSnapshot` (`scripts/ab-editor.mjs`). Upstream avoids it with a
  validation cache that ADR 0001 removed as unsound. A candidate fix skips
  `is()` when the value is the live node's current snapshot. Only undo, redo
  and session load reach this path in JBrowse.
- **A write builds its patch's snapshots before checking for a listener.**
  `didChange` in `model.ts`, `array.ts` and `map.ts` reads
  `change.newValue.snapshot` and passes it to `emitPatch`, which then finds no
  subscriber. Assigning a 5,000-leaf snapshot to a prop spent about 30% of its
  time there. Checking for a subscriber first would change when a node with a
  snapshot post-processor is instantiated, since reading its snapshot builds
  it. JBrowse always has an `onPatch` listener, so the check would not speed it
  up.

## Development mode only

- **`deepFreeze` does not descend into arrays** (`src/utils.ts:142`). In
  `types.frozen().create({ a: [{ b: 1 }] })` the inner object stays mutable, as
  in upstream. A fix makes development and consumer tests throw
  wherever code mutates such an object today; production does not freeze.

## Cleanups

- **`reconcileArrayChildren` repeats its orphan and built-node bookkeeping** in
  the `!oldNode` branch and the reorder branch
  (`src/types/complex-types/array.ts:436`). The first branch is the second with
  no old match plus one refusal.
- **`refinement()` reads its subtype's name in the constructor**
  (`src/types/utility-types/refinement.ts:111`). ADR 0003 moved the other
  wrappers to `computeName`. JBrowse builds one unnamed refinement per config
  slot.
- **`getStateTreeNodeSafe` is typed to take a node** but is called with
  arbitrary values; its parameter should be `unknown`.
- **`IType.flags` and `IType.isType` are writable** on the public interface
  (`src/core/type/type.ts:171`) and could be `readonly`.
