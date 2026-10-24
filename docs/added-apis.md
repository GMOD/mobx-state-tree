# Added APIs

Everything here is absent from upstream mobx-state-tree.

- [`types.resilient`](#typesresilient)
- [`types.stripDefault`](#typesstripdefault)
- [Reflection API additions](#reflection-api-additions)
- [`union({ members })`](#union-members)
- [`extendInstance`](#extendinstance)
- [Exact-type helpers](#exact-type-helpers)

## `types.resilient`

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

## `types.stripDefault`

Like `types.optional`, but omits the property key from the parent model's snapshot entirely
when the value equals the default.

### Background: snapshots and `types.optional`

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

### What `types.stripDefault` does

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

### Why this matters

Without `stripDefault`, keeping defaults out of snapshots requires a manual
`postProcessSnapshot` on every model. `stripDefault` handles this automatically per-property.

This is especially useful when:

- Snapshots are stored or synced and you want to minimize their size
- You diff snapshots (e.g. for undo/redo or change detection) and want default values to
  appear as "no change" rather than an explicit write
- You have many optional fields and don't want boilerplate `postProcessSnapshot`

### How the default comparison works

The comparison is done against the **normalized** default snapshot, not the raw value you
passed in. MST instantiates the subtype with the default once, reads back its snapshot
(which applies any nested model defaults and post-processing), and caches that as the
reference. This means a complex nested default that gains extra fields at instantiation time
will still compare correctly.

---

## Reflection API additions

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

---

## `union({ members })`

`types.union` accepts a `members` thunk that is re-read on every operation, so types registered after the union is built still take part in dispatch, validation and reference resolution.

```ts
const AnyView = types.union({
  members: () => registry.viewTypes,
  dispatcher: snapshot => registry.get(snapshot.type),
  name: "AnyView"
})
```

- Use it for plugin systems that load types lazily.
- Pair it with `dispatcher` for snapshot dispatch and `name` for stable error messages.
- A union with no options is interned instead: `union(A, B) === union(A, B)`. A union with options is never interned. See [ADR 0005](../agent-docs/architecture-decision-records/0005-a-union-is-a-pure-function-of-its-members.md).

---

## `extendInstance`

Attaches actions, views and volatile state to a live model instance, using the same machinery as `.extend()`.

```ts
const view = BaseView.create(snapshot)

extendInstance(view, self => ({
  views: {
    get label() {
      return `${self.type}:${self.id}`
    }
  },
  actions: {
    reset() {
      self.id = ""
    }
  }
}))
```

- Create the model with only its base props, then attach the rest from a dynamically imported module. The type is not rebuilt and the tree is not re-hydrated.
- Attached views are computeds and attached actions get a full action context, so it works on protected trees.
- The attached members are not part of the static type. Declare the augmented shape separately.
- It refuses a member named like an existing property, before installing anything.

---

## Exact-type helpers

The `isXType` guards answer "holds an X", not "is exactly an X": `isArrayType(types.maybe(types.array(T)))` is true. The helpers below give the exact type.

- `getWrappedType(type)` returns the one type a wrapper (`optional`, `stripDefault`, `refinement`, `snapshotProcessor`, a resolved `late`) delegates to, or `undefined`.
- `unwrapType(type)` strips every such wrapper.
- `asArrayType`, `asMapType`, `asModelType` apply `instanceof` to the unwrapped type and narrow soundly.

`isArrayType`, `isMapType` and `isModelType` return `boolean` since 6.6.0, so code that relied on their narrowing moves to the `as*Type` functions. See [ADR 0006](../agent-docs/architecture-decision-records/0006-type-guards-answer-holds-not-is.md).

---

## Smaller additions

- `types.compose` takes up to 11 parts. Upstream's overloads stopped at 9 and dropped every prop silently past that.
- `getChildType`, `getUnionSubtypes` and `getDefaultInstanceOrSnapshot` are documented above under reflection.
- `setDevMode(boolean)` replaces reading `process.env.NODE_ENV` at runtime.
- `findParent(node, predicate)` returns the nearest ancestor the predicate accepts, or `undefined`. A type-guard predicate narrows the result. `getParentOfType` matches only by type and throws on a miss.
- `types.union` and `types.compose` have variadic signatures in place of generated overloads.
- A custom `preProcessSnapshot` or `postProcessSnapshot` types the keys it does not own as passing through ([ADR 0007](../agent-docs/architecture-decision-records/0007-snapshot-processors-are-typed-pass-through.md)).
