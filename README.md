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
