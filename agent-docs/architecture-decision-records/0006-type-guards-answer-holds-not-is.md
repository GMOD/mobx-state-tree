# ADR 0006 — Type guards answer "holds an X"; the exact type comes from unwrapType

Status: Accepted (September 2026)

## Context

Every `isXType` guard tests `type.flags`, and wrapper and union types OR in the
flags of what they hold. So `isArrayType` is true for an array type, for
`types.maybe(types.array(X))` and for every array prop of a model, which
`types.model` auto-wraps in `optional(array, [])`. `isModelType` is true for a
union of models.

Three of the guards, `isArrayType`, `isMapType` and `isModelType`, were
declared as `type is IArrayType` / `IMapType` / `IModelType`. That narrowing is
unsound: it promises a `getChildType()` or a `properties` the wrapper does not
have. The library itself was caught out by it:

- `getPropertyMembers(optional(M))` returned no properties.
- `compose`'s dev assert accepted a wrapped model and then silently dropped its
  props.
- `getUnionSubtypes(resilient(union))` returned `[union, fallback]` as members.

jbrowse carries four hand-rolled unwrappers, two of which read private fields
(`_subtype`, `_subType`, `subType`) in its build scripts.

## Decision

**The flag semantics stay, and all twelve guards return `boolean`.** Switching
the runtime to `instanceof` looks like the obvious fix, but it would break
consumers without a compile error:

- jbrowse's `filterSessionInPlace` walks optional-wrapped props with
  `isArrayType`/`isModelType` and then uses node-based APIs.
- Its config-schema registry is keyed by the `stripDefault` wrapper, so
  `isModelType` has to answer true for it.
- `isReferenceType(types.safeReference(X))`, a union, has to be true.
- `late.test.ts` pins the flag semantics.

**Exact structure gets its own sound API**, built on the contract that already
existed internally: a `getSubTypes()` that returns one type means "I hand
everything to this type".

- `getWrappedType(t)`: that one type, for `optional`, `stripDefault`,
  `refinement`, `snapshotProcessor` and a resolved `late`. It is `undefined`
  for anything else. A union or a `resilient` picks its type per value, so it
  has none.
- `unwrapType(t)`: strips all of those. For a complex `T`,
  `getType(T.create(snapshot)) === unwrapType(T)`.
- `asArrayType` / `asMapType` / `asModelType`: `instanceof` applied to the
  unwrapped type, so they narrow soundly by construction.

A new wrapper type must return its single delegate from `getSubTypes()`, or
none of these can see through it.

`unwrapType` is not the right tool for everything. Union dispatch, both the
production quick-match and discriminator scoping, has to know which model a
member is meant for. For `resilient(M, Fallback)` that model is `M`, even
though `resilient` is not a wrapper, because a failed create builds the
fallback instead. So `resolveModelType` in `union.ts` also follows a
resilient's `primaryType`.

This was learned the hard way. With only `unwrapType`,
`union(resilient(A), B)` picked the wrong member in production. That is
the "unknown plugin types" case `resilient` exists for.

## Consequences

- The runtime export list grows from 82 to 87 names and nothing is removed.
- TS consumers that relied on the narrowing get compile errors, and each site
  moves to an `as*Type`. Typechecking jbrowse against the build gave nine
  errors from eight sites, all of which are correct-by-context today. The
  migration is mechanical, for example `(asArrayType(t) ?? asMapType(t))?.getChildType()`.
- `getPropertyMembers` keeps its flag-based assert and reports a union of models
  as having no properties, because jbrowse's `discriminantOf` calls it on
  `maybe(Model)`, and throwing there would be a runtime break.
