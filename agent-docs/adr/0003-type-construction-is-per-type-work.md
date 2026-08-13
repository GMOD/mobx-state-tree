# ADR 0003 — Charge nothing per _type_ that can be charged per _use_

Status: Accepted (August 2026)

## Context

CLAUDE.md names type construction as the open target for JBrowse startup:
roughly 27 of the 44 points MST costs on `createTestSession` go to building
model _types_, not instances, because JBrowse builds a config-schema type per
track at runtime through `makeConfigurationSchemaModel`.

The shape of that workload, read off
`packages/core/src/configuration/{configurationSchema,configurationSlot}.ts`:

- every config **slot** is `stripDefault(union(JexlString, valueModel), default)`
  — so one `Union` plus one `StripDefaultValue` per slot;
- every **schema** is `model(name, slots).actions(...)` plus one MST chain step
  per inherited hook, wrapped in a final `stripDefault`;
- a track schema nests display sub-schemas, each of which is another schema.

262 tracks over `test_data/config_demo.json` therefore build on the order of
**20k unions and 20k optionals**. `scripts/config-schema-profile.mjs` reproduces
this; profiling it showed the cost was almost entirely allocation and repeated
folds, with GC alone at 11.6%.

Three things were being paid **once per type** that no type needs to pay:

1. **Five phantom fields on every type object.** `BaseType` declared
   `[$type]!`, `C!`, `S!`, `T!` and `N!` — the nominal brand and the aliases
   that let subclasses write `this["C"]`. None exists at runtime. But under
   `useDefineForClassFields` a definite-assignment `!` field is still _emitted_,
   so every type in the process materialized five own slots it never read.
2. **A name string folded eagerly.** `union()` built
   `(${types.map(t => t.name).join(" | ")})` at construction — two arrays and a
   join per union — for a string that only error messages and `describe()` ever
   read. Worse, each wrapper folded its subtype's name in its own constructor,
   so `stripDefault(union(...))` forced the union's name immediately.
3. **`flags` refolded on every read.** `Union.flags` and `OptionalValue.flags`
   are getters that walk their members. `ModelType._getIdentifierAttribute`
   reads every property's flags on each `types.model()`, and JBrowse's slots are
   unions under a stripDefault — so building one schema refolded every slot.

## Decision

**1. `declare` the phantom fields.** `declare readonly C: C` emits nothing.

**2. Composite types compute their name on demand.** `BaseType` keeps
`private _name?: string` and exposes `get name()`, which fills it from a
`protected computeName()` on first read. `union`, `array`, `map`, `reference`,
`resilient`, `frozen`, `optional` and `snapshotProcessor` override it and pass
no name to `super()`.

Deliberately **not** a thunk passed to the constructor, which was tried first:
it allocates a closure per type — the very cost being avoided — and makes two
separately built but equivalent types compare unequal, since their closures
differ. A method on the prototype has neither problem, and unlike a `super(...)`
argument it can read the subclass's own fields, because it runs after
construction.

**3. `flags` memoizes once the fold is stable.** A `types.late` member reports
nothing for its subtype until its definition resolves, which is the reason the
fold is not stable over a type's lifetime — and the reason an earlier pass left
it uncached. Every wrapper ORs its subtype's flags upward, so **`Late` in the
folded result is an exact test for "some member may still change"**, however
deeply nested. Cache unless that bit is set. A resolved late still reports
`Late`, so such a union simply never caches: conservative in the safe direction.
Pinned by "flags folded over a late member are not cached before it resolves" in
`__tests__/core/late.test.ts`.

**4. `ModelType` assigns its fields explicitly.** `Object.assign(this,
defaultObjectOptions, opts)` copied whatever `opts` happened to carry, and the
three call sites carry different key sets — so ModelType had three hidden
classes, and the internal `propertiesArePreProcessed` / `propertiesAreConverted`
plumbing stayed on the type for its whole life. Note this also means
`types.model("", {})` now keeps its empty name via `??` rather than by
`Object.assign` overwriting a `||` fallback afterwards.

Also dropped: the options object `Union`'s constructor spread only to read twice.

## Consequences

Measured with `scripts/ab-config-schema.mjs` (alternating rounds, per-round
medians, 31 rounds, production mode), building 262 track schemas:

| stage                                | ratio          |
| ------------------------------------ | -------------- |
| explicit ModelType field assignment  | 1.02x          |
| \+ `declare` the five phantom fields | 1.21–1.30x     |
| \+ lazy composite names              | 1.49–1.59x     |
| \+ `flags` memoization               | **1.62–1.71x** |

GC fell from 11.6% to 7.5% of the profile; `BaseType`'s constructor from 7.5% to
2.7% self time.

**The value-churn path is unchanged** (`scripts/ab-value-churn.mjs`: 0.98–1.03x
on both bare writes and `onSnapshot(root)`, i.e. noise). That is expected — all
of this is per-_type_ work — and it is worth stating because the churn path is
the one that matters per frame. Note the harness needs `INNER=2000`+ to resolve
that; at 400 writes a round it reads a consistent-looking 0.96–0.99x that is
purely timer granularity.

## The trap this exposed in JBrowse

`packages/core/src/ReExports/abi.test.ts` pins, per module, the names external
plugins may have linked against. `@jbrowse/core/util/Base1DViewModel` is served
as the MST **type object itself**, not as a namespace of names, so whatever
generated `abiBaseline.json` enumerated that object's own properties and pinned
MST internals as ABI:

```
"C","N","S","T","duplicateKeysChecked","flags","identifierAttribute",
"initializers","isType","name","named","postProcessSnapshot","postProcessor",
"preProcessSnapshot","preProcessor","properties","propertiesArePreProcessed",
"propertyNames","props"
```

`C`, `N`, `S`, `T` and `propertiesArePreProcessed` are exactly what this ADR
removes, so that one test fails against this build — while the other 3017 tests
in its group and all 7890 in `plugins` pass. No plugin imports `C` from
`Base1DViewModel`; the test's own doc says a module "served as the thing itself
rather than as a namespace of names" should not be per-name pinned, and this one
slipped through because an MST type happens to have enumerable own properties.

**The fix belongs in JBrowse**, following the process its own comment lays out:
drop those five names from `abiBaseline.json` in the same commit, and ideally
stop generating per-name pins for modules whose export is a value rather than a
namespace — otherwise the next MST internals change re-breaks it.
