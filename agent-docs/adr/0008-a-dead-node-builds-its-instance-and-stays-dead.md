# ADR 0008 — A dead node builds its instance on first read, and stays dead

Status: Accepted (September 2026)

## Context

MST creates a complex child's instance lazily, on first read. When a parent
dies, `finalizeDeath` marks every child `DEAD` and stores its death snapshot,
but a child nothing had read still has no instance. Reading it later reaches
`createObservableInstance` on a dead node:

- Dev threw `assertion failed: the creation of the observable instance must be
done on the initializing phase`. React 19's dev-mode prop diffing reads every
  prop of a replaced model, so Apollo hit this when switching display types.
- Production built the instance and set the node back to `CREATED`: an orphan
  that counted as alive, fired `afterCreate`, and never ran its disposers.

Upstream has the same bug: 3.17.3, 5.4.2 and 8.0.0 all behave this way.

## Decision

`createObservableInstance` builds the instance for a node that died
uncreated, then returns before setting `CREATED` or firing hooks. The child
then behaves exactly like one read before its parent died: views, the map API
and `getSnapshot` work, writes throw `Cannot modify`, and `isAlive` is false.

The dev assertion keeps guarding every other case. The exemption requires both
`DEAD` and `ObservableInstanceLifecycle.UNINITIALIZED`, so a node that died
mid-creation or after creation still trips it.

## Rejected: return the death snapshot from `getValue` (PR #20)

It looks simpler and it fixes the dev crash, but in production it:

- **Aliases undo history.** Production does not freeze snapshots, so the death
  snapshot is the same object earlier `getSnapshot` calls returned. A stale
  action writing through the child rewrites those snapshots silently, where
  main threw.
- **Drops the API.** Views read `undefined`, actions and map methods throw
  `TypeError`, `types.Date` reads as a number, references as a raw id, and
  `stripDefault` omits default slots, so JBrowse config reads go wrong.
- **Depends on timing.** A child read before death is an instance; one never
  read would be a plain object.

## Consequences

- Reads of such a child now emit the liveliness warning in production, where
  the revived orphan was silent. It is the same warning a child read before
  death already gives.
- Model initializers (`.views`, `.actions`, `.volatile`, `.extend`) run on the
  dead node, as they did in production before; `getParent(self)` in one throws.

## Death builds a never-read node that needs it, hooks and all

The same rule covers death itself. `aboutToDie` builds a never-read node's
instance before its children die, running `afterCreate` and `afterAttach`
and then `beforeDestroy` and its disposers, when either of these holds:

- It has a snapshot `postProcessor`. The post-processor receives the instance,
  so the death snapshot needs one. Building it without hooks was tried and
  rejected: a post-processor that reads state set in `afterCreate` then threw
  from `destroy()` and left the tree alive, where production worked before.
- A child is already built. That happens when an instance is placed in a
  snapshot (`Root.create({ branch: { leaf: Leaf.create() } })`). Without its
  parent built, the child's `beforeDestroy` sees `getParent(self)` as
  `undefined`.

Either way the node dies exactly as if it had been read before its parent
died. Hooks that run during that build can add or replace children, so
`aboutToDie` also walks any child it did not see before the build, and skips
one that died meanwhile. Production already fired `afterCreate` and `afterAttach` for a
post-processed node at death; the change adds the cleanup.
