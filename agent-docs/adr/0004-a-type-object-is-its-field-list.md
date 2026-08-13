# ADR 0004 — A type object costs what its field list costs

Status: Accepted (August 2026)

Follows [ADR 0003](0003-type-construction-is-per-type-work.md), which should be
read first: same workload (`scripts/config-schema-profile.mjs`, 262 jbrowse-shaped
config schemas), same premise that anything a type's constructor does is
multiplied by twenty thousand.

## Context

ADR 0003's largest single win was `declare`-ing five **phantom** fields that had
no runtime meaning at all. Profiling the workload again afterwards showed the
same cost in a form that is easy to miss, because the fields are real:

**A field declared on a type class is materialized on every type object, even
when it only ever holds its default.** `Union` declared `_dispatcher`, `_eager`,
`_discriminatorCache` and `_allMembersDiscriminated`; a union that is eager, has
no dispatcher, is never instantiated and never fails a typecheck — which is
every union in a jbrowse config slot — carried four slots holding nothing.
`BaseType.isType` was the same `true` on every type ever built.
`BaseType._name` is `undefined` for every composite type, which is the entire
point of ADR 0003's decision to fold the name on first read.

Two allocation bugs turned up alongside:

- `union()` allocated **two** arrays per call and kept one. The signature took
  the leading argument separately, so `union(A, B)` built a rest array for `B`
  and then a second array to put `A` back in front.
- ADR 0003 had replaced that second array with `otherTypes.unshift(first)`,
  reasoning that the rest array is already fresh. That is **3.1x slower** than
  the spread it replaced on a two-member union: V8 inlines the spread and calls
  out to the `unshift` builtin. It was 9.6% of the workload's self time.

## Decision

**1. Shared defaults live on the prototype.** `declare` the field so nothing is
emitted, then `Object.assign(Klass.prototype, { ... })` after the class body. An
own slot appears only when a value is actually assigned. Applied to
`BaseType.isType`, `BaseType._name`, `Union._dispatcher`, `Union._eager`,
`Union._discriminatorCache`, `Union._allMembersDiscriminated` and
`StripDefaultValue._defaultSnapshot`.

`Object.assign` rather than `defineProperty`, so these stay enumerable exactly
where they were enumerable before and `for...in` over a type is unchanged.
`Object.keys` no longer reports them — see the ABI note below.

Deliberately **not** applied to `_flags` on `Union` / `OptionalValue` /
`SnapshotProcessor`: those are written for most types (`_getIdentifierAttribute`
folds every property's flags on each `types.model()`), so hoisting them would
trade a slot allocated at construction for the same slot added later, plus a
hidden-class transition.

**2. `union()` takes one rest array and hands it to the `Union`.** Only the
options overload, which nothing hot uses, pays for a `slice`.

**3. `_getIdentifierAttribute` is a free function over the property names.** It
was allocating a closure per `types.model()` and making an indirect call per
property through `forAllProps`.

**4. `checkOptionalPreconditions` narrows before probing.** A state tree node is
always an object, so `typeof x === "object"` guards the `$treenode` read, which
was a megamorphic miss on the primitive defaults most config slots carry.

## Consequences

`scripts/ab-config-schema.mjs`, per-round medians, 61 rounds, production mode,
several invocations each on an otherwise-quiet machine:

| stage                                       | ratio          |
| ------------------------------------------- | -------------- |
| `unshift` -> spread, identifier scan, `$treenode` guard | 1.04–1.11x |
| \+ prototype defaults (`isType`, `_name`, `Union`, `StripDefaultValue`) | 1.17–1.28x |
| \+ `union()`'s single rest array            | 1.08–1.21x     |
| **cumulative**                              | **1.40–1.50x** |

That is on top of ADR 0003's 1.62–1.71x, so roughly **2.3–2.5x** against the
type-construction path as it stood before either ADR. GC fell to ~5% of the
profile. The value-churn path is unchanged, as it should be — this is all
per-*type* work.

`Union`'s own-enumerable key set goes from eight names to three, `OptionalValue`'s
from six to four, and `ModelType` loses exactly one: `isType`.

## What did not work

Recorded because each looked obviously right and cost real time.

- **Replacing `cloneAndEnhance`'s options bag with positional parameters.** Seven
  call sites passed seven differently-shaped literals, so every `opts.x` read was
  megamorphic — and removing that measured **neutral**. The cost in
  `cloneAndEnhance` is the eight-key literal it builds for `new ModelType`, which
  positional parameters do not remove. Reverted.
- **`this.initializers.concat(fn)` instead of `concat([fn])`**, to skip the
  one-element array a chain step allocates: **4% slower**. `concat`'s fast path
  is for array arguments.
- **Returning the key list from `toPropertiesObject`** so the `ModelType`
  constructor need not re-run `Object.keys` over a 40-key declaration:
  **neutral**. Reverted.
- **Dropping the per-key `Object.getOwnPropertyDescriptor` in
  `toPropertiesObject`.** Worth ~11% of that function, i.e. ~1.4% of the
  workload, and it can only be done by invoking getters — which the descriptor
  exists to reject. Not worth the semantics.

## The measurement trap this exposed

CLAUDE.md said the alternating-round harness "resolves 1.03x reproducibly" at
~25 rounds. It does not, and two separate things are going on:

- **Run-to-run spread.** Two byte-identical dists, 41 rounds, eight
  invocations: **0.933x to 1.022x**. A single invocation cannot resolve
  anything under ~1.1x, and a run of same-direction results is not evidence —
  six in a row happened here on identical builds.
- **Load sensitivity of the ratio itself.** The `union()` change measured
  **1.22x** at load average 16 and **1.12x** on a quiet machine. Load does not
  just widen the spread, it inflates the winner. This checkout is shared with
  other agents running `tsc`, so check `uptime` before believing a number.

Take several invocations, compare medians of medians, and re-measure anything
important once the machine is idle.

## ABI: prototype hoisting is safe, and here is the exact reason

ADR 0003 explains why jbrowse's `packages/core/src/ReExports/abi.test.ts` pins
MST internals as plugin ABI: `@jbrowse/core/util/Base1DViewModel` is served as
the MST type object itself, so whatever generated `abiBaseline.json` enumerated
its own properties. The entry is:

```
"@jbrowse/core/util/Base1DViewModel": ["C","N","S","T","duplicateKeysChecked",
  "flags","identifierAttribute","initializers","isType","name","named",
  "postProcessSnapshot","postProcessor","preProcessSnapshot","preProcessor",
  "properties","propertiesArePreProcessed","propertyNames","props"]
```

**The check is `names.filter(n => !(n in mod))`, and `in` walks the prototype
chain.** So moving a field from the instance to the prototype is invisible to
it, and **nothing in this ADR adds to the baseline edit ADR 0003 needs**.
Verified against the build: `isType` and `name` still answer `true`; the five
that answer `false` are `C`, `N`, `S`, `T` and `propertiesArePreProcessed`,
every one of them from ADR 0003 — `declare` on a phantom removes the name
outright, and dropping the `Object.assign(this, opts)` plumbing removed the
fifth.

That is the rule for anyone doing more of this work: **hoisting a field to the
prototype is ABI-safe; deleting one is not.** The corollary is that
`Object.keys` on a type is not the check to run when sizing the blast radius,
even though it is the check that generated the baseline — use `in`.

The ADR 0003 argument for the edit is unchanged: no plugin imports `C` from
`Base1DViewModel`, and per-name pins should not be generated for a module whose
export is a value rather than a namespace of names.
