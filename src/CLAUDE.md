# src

Each of these looks like an obvious simplification and measured wrong. Read the
record in `agent-docs/architecture-decision-records/` before changing it:

- Array reconciliation, union dispatch, or a validation cache: 0001.
- How `ModelType` reaches a property's mobx observable: 0002.
- Anything a type's constructor does, a new field on a type class included, or
  `BaseType.name` and the `flags` getters: 0003 and 0004. JBrowse builds tens of
  thousands of type objects, so every field is paid on each one.
- `union()`'s construction path, or per-instance state on `Union`: 0005.
  No-options unions are interned and shared.
- An `isXType` guard, or a new wrapper type: 0006.
- How `compose` or `.props()` type custom snapshots: 0007.
- `createObservableInstance`'s lifecycle checks, or what reading a dead node
  returns: 0008.

What JBrowse exercises, and so what a change can break or speed up:
[agent-docs/reference/jbrowse-workload.md](../agent-docs/reference/jbrowse-workload.md).
