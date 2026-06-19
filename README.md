# @jbrowse/mobx-state-tree

Fork of [mobx-state-tree](https://mobx-state-tree.js.org) v5.4.2 maintained for use in
[JBrowse 2](https://jbrowse.org). All upstream types and APIs are available — this page
documents only the additions and changes made in this fork.

## Infrastructure changes

- Updated TypeScript and import paths to use explicit file extensions
- Replaced `process.env.NODE_ENV` with an exported `setDevMode()` function
- Converted tests from Jest to Vitest
- Replaced tslint with eslint + typescript-eslint
- Dual CJS/ESM build (avoids issues when both are imported in the same Vite build)
- Removed unused dependencies and the `NonEmptyObject` annotation
- Replaced `unique symbol` phantom properties (`$emptyObject`, `$stateTreeNodeType`) with
  exported string-keyed brand interfaces (`$EmptyObjectBrand`, `$__mstStateTreeNodeType__`),
  fixing tsgo TS4058/TS4023 errors when MST types appear in exported function return types

## Error message changes

Validation and conversion errors have been reworked to stay readable on large state
trees. Upstream MST could throw error messages hundreds of kilobytes long because it
expanded every union member's full structure and stringified entire snapshots unbounded.
This fork keeps the errors short while making them more diagnosable.

### Bounded conversion errors

`typecheck()` / instantiation errors no longer dump unbounded output:

- Stringified snapshots are depth-bound (nested objects past 3 levels collapse to `…`)
- Each printed value is capped in length
- At most 10 individual errors are reported, with a `(… and N more errors)` suffix

### Scoped discriminated-union errors

Take a union of view types discriminated by a literal `type` property:

```ts
const LinearGenomeView = types.model("LinearGenomeView", {
  type: types.literal("LinearGenomeView"),
  height: types.number,
  assembly: types.string
})
const DotplotView = types.model("DotplotView", {
  type: types.literal("DotplotView"),
  height: types.number
})
const AnyView = types.union(LinearGenomeView, DotplotView)
```

Upstream MST listed every member's full structure on any failure. A single mistyped field
produced output like this — each member's entire schema expanded inline, repeated for every
member, often hundreds of kilobytes on a real config union:

```
No matching type for union(LinearGenomeView | DotplotView)
(snapshot `{"type":"LinearGenomeView","height":"tall","assembly":"hg38"}` is not assignable
to type: `({ type: ("LinearGenomeView" | snapshot like `"LinearGenomeView"`); height: number;
assembly: string } | { type: ("DotplotView" | snapshot like `"DotplotView"`); height: number })`,
expected an instance of `LinearGenomeView` or a snapshot like `{ type: ("LinearGenomeView" |
snapshot like `"LinearGenomeView"`); height: number; assembly: string }` instead. … )
```

Now the error is scoped to the single member whose literal `type` matches the snapshot's
discriminator, and reports only the property-level reasons it failed.

`AnyView.create({ type: "LinearGenomeView", height: "tall", assembly: "hg38" })` throws:

```
[mobx-state-tree] Error while converting `{"type":"LinearGenomeView","height":"tall","assembly":"hg38"}` to `(LinearGenomeView | DotplotView)`:

    at path "/height" value `"tall"` is not assignable to type: `number` (Value is not a number).
```

And in production builds (where full type-checking is skipped) a missing required field on a
recognized member still names the discriminator and the offending path —
`AnyView.create({ type: "LinearGenomeView", height: 100 })` throws:

```
[mobx-state-tree] No matching type for union (LinearGenomeView | DotplotView) for snapshot with type "LinearGenomeView":
    at path "/assembly" value `undefined` is not assignable to type: `string` (Value is not a string).
```

Instead of a wall of text covering every union member, you get the discriminator that was
seen plus the property-level reasons that one intended member rejected the snapshot (wrong
field type, missing required field, etc.). The scoping drills through wrapped members
(`optional`, `refinement`, `snapshotProcessor`, `late`) to find the underlying model, so
real-world members like an `optional(model)` config schema are still matched correctly.
When two members declare the same `type` literal (ambiguous), it falls back to the short
message rather than guessing.

## Added APIs

### `types.resilient`

Wraps a type so that if instantiation fails (e.g. because the snapshot is from an unknown
plugin that is not installed), the error is caught and a fallback type is used instead of
crashing the entire state tree.

```ts
const PluginWidget = types.resilient(
  KnownWidget,
  UnknownWidget,
  (error, originalSnapshot) => ({ kind: "unknown", raw: originalSnapshot })
)

// Arrays of plugins stay alive even if one entry is unrecognized
const Store = types.model({
  widgets: types.array(PluginWidget)
})
```

`types.resilient` takes three arguments:

- `type` — the primary type to try first
- `fallbackType` — the type to use when the primary fails
- `createFallbackSnapshot(error, originalSnapshot)` — a callback that receives the caught
  error and the original snapshot, and returns a valid snapshot for the fallback type

**Important caveat:** `isValidSnapshot` always returns success for a resilient type. Any
value is considered a valid snapshot — validation is deferred to instantiation time, where
failures are caught and routed to the fallback.

---

### `types.stripDefault`

Like `types.optional`, but omits the property key from the parent model's snapshot entirely
when the value equals the default.

#### Background: snapshots and `types.optional`

In MST, a **snapshot** is the plain JSON representation of your model — what you'd get from
`getSnapshot(model)` and what you'd pass to `Model.create(...)`. Snapshots are used for
serialization, persistence, and undo/redo.

`types.optional` lets you define a property with a default value so it can be omitted when
creating a model:

```ts
const Settings = types.model({
  theme: types.optional(types.string, "light")
})

const s = Settings.create() // theme is "light"
getSnapshot(s) // { theme: "light" }
```

Even though `"light"` is just the default, it always appears in the snapshot. If you store
or diff these snapshots, every instance carries that redundant data.

#### What `types.stripDefault` does

`types.stripDefault` works exactly like `types.optional` at runtime — the property gets its
default when missing — but the key is **left out of the snapshot entirely** when the value
equals the default:

```ts
const Settings = types.model({
  theme: types.stripDefault(types.string, "light")
})

const s = Settings.create()
getSnapshot(s) // {}  ← key omitted because value equals default

s.theme = "dark"
getSnapshot(s) // { theme: "dark" }

s.theme = "light"
getSnapshot(s) // {}  ← omitted again
```

#### Why this matters

Without `stripDefault`, keeping defaults out of snapshots requires a manual
`postProcessSnapshot` on every model. `stripDefault` handles this automatically per-property.

This is especially useful when:

- Snapshots are stored or synced and you want to minimize their size
- You diff snapshots (e.g. for undo/redo or change detection) and want default values to
  appear as "no change" rather than an explicit write
- You have many optional fields and don't want boilerplate `postProcessSnapshot`

#### How the default comparison works

The comparison is done against the **normalized** default snapshot, not the raw value you
passed in. MST instantiates the subtype with the default once, reads back its snapshot
(which applies any nested model defaults and post-processing), and caches that as the
reference. This means a complex nested default that gains extra fields at instantiation time
will still compare correctly.

---

### Reflection API additions

These utilities expose type metadata that is useful for building generic tooling (e.g.
editors, inspectors, plugin systems) that need to introspect an MST type at runtime.

**`getChildType(node, propertyName?)`** — returns the declared MST type of a child
property on a model, array, or map instance. For arrays and maps the property name is
ignored (all children share one element type).

```ts
const Box = types.model({ x: types.number, y: types.number })
const box = Box.create({ x: 1, y: 2 })

getChildType(box, "x").name // "number"
```

**`getUnionSubtypes(type)`** — given a `types.union` type, returns the array of its member
types. Useful when you need to enumerate what a union can hold.

```ts
const Shape = types.union(Circle, Square, Triangle)

getUnionSubtypes(Shape) // [Circle, Square, Triangle]
```

**`getDefaultInstanceOrSnapshot(optionalType)`** — returns the default value (or snapshot)
declared on a `types.optional` or `types.stripDefault` type. Lets generic tooling read the
default without having to create a model instance.

```ts
const t = types.optional(types.string, "hello")

t.getDefaultInstanceOrSnapshot() // "hello"
```
