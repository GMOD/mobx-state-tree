# Error messages

- Upstream MST could throw errors hundreds of kilobytes long: every union member's full structure, plus unbounded snapshots.
- This fork keeps them short and scopes them to the member that matched.
- Each section below shows before and after.

Validation and conversion errors have been reworked to stay readable on large state
trees. Upstream MST could throw error messages hundreds of kilobytes long because it
expanded every union member's full structure and stringified entire snapshots unbounded.
This fork keeps the errors short while making them more diagnosable.

## Bounded conversion errors

`typecheck()` / instantiation errors no longer dump unbounded output:

- Stringified snapshots are depth-bound (nested objects past 3 levels collapse to `…`)
- Each printed value is capped in length
- At most 10 individual errors are reported, with a `(… and N more errors)` suffix

## Scoped discriminated-union errors

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
