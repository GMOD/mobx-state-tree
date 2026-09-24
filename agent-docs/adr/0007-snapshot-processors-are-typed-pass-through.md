# ADR 0007 — Snapshot processors are typed as passing through keys they don't own

Status: Accepted (September 2026)

## Context

A model's custom creation or snapshot type (`CustomC` / `CustomS`) comes from
`preProcessSnapshot` / `postProcessSnapshot`. `types.compose` chains its parts'
processors first part first:

```ts
pre = snapshot => cur.pre(prev.pre(snapshot))
post = snapshot => cur.post(prev.post(snapshot))
```

Every processor receives the whole snapshot. Each one is still typed against
its own model's props, because that is all it can know about. jbrowse's session
parts all use the same shape:

```ts
.postProcessSnapshot(snap => {
  const { stickyViewHeaders, ...rest } = snap
  return rest as typeof snap
})
```

So a part's custom type describes **its keys**, and the rest of the snapshot
passes through untouched.

Before this ADR, the generated overloads folded the custom types with
`_CustomJoin`: keep the first customized type and intersect the later ones. An
uncustomized part followed by `A & _NotCustomized` read as "not customized", so
the customization was dropped. The composed snapshot type therefore depended on
part order, and `.props()` after a processor kept the stale custom type.
`IModelType` carried a warning comment about exactly that.

## What did not work

**"The snapshot is the last post-processing part's output."** This reads
straight off the runtime chain, and it was tried and rejected. Typechecking
jbrowse against it produced six new errors: `MultipleViews`'s own
post-processor lost `stickyViewHeaders`, session snapshots lost `id` and
`view`, and so on. The cause is that the last part's type covers only that
part's keys, not the merged snapshot.

## Decision

**A processor owns only its own props' keys and passes the rest through.**

- `compose` folds each customized part in as `Omit<Acc, keyof ItsProps> & ItsCustom`,
  starting from the merged props' own type. The result is `_NotCustomized`
  when no part customizes.
- `.props()` follows the same rule: props added after a processor pass
  through it, so they replace their keys in a customized type.
- A part typed `any` composes to `IAnyModelType`. Inferring from `any` yields
  the type parameters' constraints, which describe an empty model.

A processor that reshapes the whole snapshot, for example `sn => ({ y: sn.x })`,
is typed as though the other parts' keys survive. Inside a composed model such
a processor would destroy the other parts' data, so the contract types the
sensible case, not that one.

## Consequences

- Typechecking jbrowse against the build gives no errors from this.
- The composed result is identical to 6.5.2's when no part customizes.
- **When comparing types across two builds, give each dist its own package
  name.** TypeScript dedupes two copies that share a name@version, so aliasing
  both as `@jbrowse/mobx-state-tree@6.5.2` silently compares a build with
  itself. That happened here and briefly made this change look equivalent to
  the old overloads.
