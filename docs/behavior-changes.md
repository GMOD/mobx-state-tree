# Behavior changes from upstream

Each bullet names a case where upstream throws, leaks, hangs or corrupts and this fork does not. The commit message of each fix has the reproduction.

## A refused write leaves the tree as it found it

- An array insertion, identified-map write, reassignment of a node that lives elsewhere, or `detach()` on a protected tree checks its preconditions before it kills, adopts or detaches anything.
- Upstream acted first and refused afterwards, which left ghost identifiers in the cache and dead nodes in live trees.
- An attach that can never work (a dead node, or an ancestor of the target) throws a clear error before the tree changes, not a raw `TypeError`.

## Death and lifecycle

- A node nobody read still gets `beforeDestroy`, and its disposers run, when its tree dies.
- A dead node that nothing had read builds its instance on first read and stays dead. Reads work, writes throw `Cannot modify`. See [ADR 0008](../agent-docs/architecture-decision-records/0008-a-dead-node-builds-its-instance-and-stays-dead.md).
- Children that hooks add while a node is built at death are destroyed too.
- The `onSnapshot` reaction is disposed with its last listener, so a node stops re-serializing its subtree once nobody listens.

## References

- Detaching an ancestor of a reference's target invalidates the reference. `safeReference` clears itself instead of throwing on the next read.
- Assigning an instance to a reference whose target is gone no longer throws while checking for a change.
- A custom reference's `set()` receives the parent, not the old identifier.

## Unions

- A member whose preprocessor throws on another member's snapshot counts as a refusal during dispatch, so a later member can still match. When none matches, the first error is rethrown.
- A dispatcher that returns `undefined` fails the typecheck. It no longer throws a `TypeError`.
- `union(undefined, A)`, which a circular import produces, is refused in dev mode. Upstream read `undefined` as missing options and dropped `A`.
- Production quick-match treats `resilient(A, Fallback)` as `A`, so `union(resilient(A, Fallback), B)` still routes `A`-shaped snapshots to the resilient member.

## Models and types

- A property or action named after an `Object.prototype` member (`toString`, `valueOf`, `constructor`) is refused at definition with the real reason. Upstream's hook-name check used `in`, which also holds for those names.
- `snapshotProcessor` post-processes an instance attached under it once, so `n: 0` stays `n: 0`.
- `snapshotProcessor` leaves the wrapped type's `create` alone.
- `types.lazy` reconciles through the loaded type, keeping node identity and volatile state across `applySnapshot`.
- `types.resilient` kills the fallback node when the snapshot recovers, so its identifier leaves the cache.
- `types.float` and `types.finite` count as primitive types.

## Flows and middleware

- A flow that yields a non-promise rejects its promise, which settles.
- `createActionTrackingMiddleware` keeps its running-action map per instance. Two on one tree no longer overwrite each other's context.
- It settles an action once its last flow does, reports a failed flow the action started, and passes a synchronous action's return value to `onSuccess`.
- Disposing a middleware mid-run no longer skips the next one.
- A reentrant `EventHandler.emit` no longer skips handlers.
