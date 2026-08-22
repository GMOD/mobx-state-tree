# ADR 0005 — A union is a pure function of its members, so build each one once

Status: Accepted (August 2026)

Follows [ADR 0003](0003-type-construction-is-per-type-work.md) and
[ADR 0004](0004-a-type-object-is-its-field-list.md): same workload
(`scripts/config-schema-profile.mjs`, 262 jbrowse-shaped config schemas), same
premise that jbrowse builds ~20k unions per session load. Those ADRs made each
union cheaper. This one stops building most of them.

## Context

Every jbrowse config slot is `stripDefault(union(JexlStringType, valueModel),
default)`, and both members come from module-level singletons — a 13-entry
`valueModel` table plus one shared refinement. So the ~20k unions built per
session have only ~13 distinct member-identity tuples. On the 262-schema
workload, 21k of the 45k reachable type objects were redundant unions.

ADR 0003 already named the property that makes deduplication safe as
_desirable_: "two separately built but equivalent types compare equal" is the
stated reason `computeName()` beat a constructor thunk.

Scale caveat on the workload: 262 hydrated track schemas is an upper bound,
not a typical session. jbrowse keeps configs as `types.frozen` snapshots in
`jbrowse.tracks` and only builds a track's config-schema type when it becomes
an active track, so real sessions build schemas for the handful of displayed
tracks plus the registration-time types (per track/display/adapter _type_,
including the `pluggableConfigSchemaType` unions). The percentages below hold
at any scale; the absolute MB saved scales with how many schemas actually get
built.

## Decision

**`union(...types)` with no options is interned on the identity tuple of its
members.** A trie of `WeakMap<IAnyType, node>` (each node holding an optional
terminal union plus an optional next level) maps the member sequence to a
single shared `Union`; WeakMaps keep dynamically-built member types
collectable. Order matters (`union(A, B) !== union(B, A)`), prefixes do not
collide, and **the options overload is never interned** — dispatcher closures
and eager settings are not comparable.

## Why sharing is sound

Every field a no-options `Union` can ever hold is a pure fold over `_types`:
`_flags` (the ADR 0003 `Late` guard already prevents caching an unstable
fold), `_name` via `computeName()`, `_discriminatorCache`,
`_allMembersDiscriminated`. `_dispatcher`/`_eager` stay prototype defaults on
this path. MST type objects carry no parent link and no per-tree state — nodes
hold that. `resolveModelType`'s WeakMap is keyed on member types, not unions.

Two edges, both pinned by tests:

- `types.enumeration(name, opts)` performs the repo's only `.name` write on a
  type object — on a union. Safe: `literal()` allocates a fresh `Literal` per
  call, so two enumerations can never share a member tuple. A grep of
  jbrowse-components found zero `.name` writes on MST type objects.
- In production, `union(A, 5)` (trailing non-type) now throws
  `TypeError: Invalid value used as weak map key` instead of silently building
  a broken union; dev mode already threw clearly.

`maybe`/`maybeNull` build through `union()`, so `maybe(X) === maybe(X)` falls
out for free.

## Measurements

`scripts/mem-config-schema.mjs`, identical to the byte on repeated runs:

|                                  | baseline | interned | delta      |
| -------------------------------- | -------- | -------- | ---------- |
| retained heap, 262 track schemas | 6.34 MB  | 4.17 MB  | **−34.2%** |
| reachable type objects           | 45,088   | 24,139   | **−46.5%** |
| own slots across them            | 140,788  | 98,890   | **−29.8%** |

Timing (`scripts/ab-config-schema.mjs`, 41 rounds, load average 10–12.5, so
the ADR 0004 load-inflation caveat applies): ten invocations read 1.000–1.073x
(median 1.034x) against a null control of 0.989–1.022x (median 1.003x). Every
change sample ≥ 1.000 and 7 of 10 clear the control's maximum — but the
separation is ~3%, below what one invocation resolves. Recorded as **no
regression, plausibly ~1.02–1.03x**. Value churn (`MODE=onSnapshot
INNER=2000`): noise, no regression.

**This is the first change here where the timer was the wrong instrument and
the change was still worth keeping.** ADR 0004's follow-up predicted exactly
this shape: allocation-moving changes are legible in the slot/heap count and
invisible to the clock. Count objects first; here the count was 21k.

## Consumer verification

The interned dist was swapped into both jbrowse pnpm-store copies (mv-aside,
`trap restore EXIT INT TERM`): `packages/core+product-core+app-core`
**3574/3574**, `plugins` **9978/9984 with 0 failed** (6 skipped). All-pass, so
no baseline run was needed. Runtime export list and `index.d.ts` are
byte-identical to the pre-change build.

## Follow-up (August 2026): `members` thunk unions are the sanctioned exception

`types.union({ members: () => IAnyType[], dispatcher?, name? })` builds a
`DynamicUnion` whose membership is re-read from the thunk on every operation —
the primitive for registry-backed pluggable unions whose member types load
after construction (the jbrowse lazy-stateModel design). It deliberately breaks
this ADR's premise for itself and only itself:

- It is **never interned** (it always has options, and the thunk closure is not
  comparable), so the identity guarantee for no-options unions is untouched.
- Every membership-derived cache is bypassed in the subclass — `flags` and the
  folded name recompute per read, the discriminator scan is uncached so misses
  stay retryable — while the base class keeps all its caching. Membership flows
  through the one `protected members()` accessor; `scripts/mem-config-schema.mjs`
  is byte-identical before/after, and the construction A/B reads 0.96–1.03x
  (measured at load 38, i.e. noise).
- `isAssignableFrom` folding over live members is the load-bearing part:
  reference resolution asks it through the identifier cache, so instances of
  late-registered members can satisfy `safeReference`s.
