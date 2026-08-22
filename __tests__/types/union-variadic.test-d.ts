// Type-only tests for `types.union`'s variadic-tuple signatures, which replaced
// the generated 2-to-9-member overload block. Checked by `pnpm test:types`.

import {
  types,
  type IAnyModelType,
  type IType,
  type Instance,
  type ReferenceIdentifier,
  type SnapshotIn,
  type SnapshotOut
} from "../../src/index.ts"

type Assignable<X extends Y, Y> = true

const A = types.model("A", { kind: types.literal("a"), x: types.number })
const B = types.model("B", { kind: types.literal("b"), y: types.string })
const C = types.model("C", { kind: types.literal("c") })

const models = types.union(A, B, C)

// the discriminated members survive: narrowing on `kind` reaches each member's
// own properties
const instance = models.create({ kind: "a", x: 1 })
if (instance.kind === "a") {
  const x: number = instance.x
  console.log(x)
} else if (instance.kind === "b") {
  const y: string = instance.y
  console.log(y)
}

// @ts-expect-error a snapshot mixing two members is rejected
models.create({ kind: "a", y: "no" })

type ModelsIn = SnapshotIn<typeof models>
type ModelsOut = SnapshotOut<typeof models>
type ModelsInstance = Instance<typeof models>

// the creation / snapshot / instance types are exactly the union of the
// members', in both directions
type mIn1 = Assignable<SnapshotIn<typeof A> | SnapshotIn<typeof B>, ModelsIn>
type mIn2 = Assignable<
  ModelsIn,
  SnapshotIn<typeof A> | SnapshotIn<typeof B> | SnapshotIn<typeof C>
>
type mOut1 = Assignable<SnapshotOut<typeof C>, ModelsOut>
type mInst1 = Assignable<
  Instance<typeof A> | Instance<typeof C>,
  ModelsInstance
>

// scalars
const scalars = types.union(types.string, types.number)
type sc1 = Assignable<Instance<typeof scalars>, string | number>
type sc2 = Assignable<string | number, Instance<typeof scalars>>

// optional-wrapped members (what `maybe` builds)
const withUndefined = types.union(types.string, types.undefined)
type wu1 = Assignable<SnapshotIn<typeof withUndefined>, string | undefined>
type wu2 = Assignable<string | undefined, SnapshotIn<typeof withUndefined>>

const maybeString = types.maybe(types.string)
type ms1 = Assignable<Instance<typeof maybeString>, string | undefined>
type ms2 = Assignable<string | undefined, Instance<typeof maybeString>>

const maybeNullString = types.maybeNull(types.string)
type mn1 = Assignable<Instance<typeof maybeNullString>, string | null>
type mn2 = Assignable<string | null, Instance<typeof maybeNullString>>

// the UnionOptions-leading form infers the same member tuple
const eager = types.union({ eager: false }, A, B, C)
type eagerInstance = Instance<typeof eager>
type e1 = Assignable<eagerInstance, ModelsInstance>
type e2 = Assignable<ModelsInstance, eagerInstance>

// a 12-member union stays precise; the old generated overloads stopped at nine
// and degraded the rest to IAnyType
const twelve = types.union(
  types.literal("a"),
  types.literal("b"),
  types.literal("c"),
  types.literal("d"),
  types.literal("e"),
  types.literal("f"),
  types.literal("g"),
  types.literal("h"),
  types.literal("i"),
  types.literal("j"),
  types.literal("k"),
  types.literal("l")
)
type Twelve = Instance<typeof twelve>
const last: Twelve = "l"
const first: Twelve = "a"
// @ts-expect-error "z" is not one of the twelve literals
const notAMember: Twelve = "z"

// a two-member union built inside a generic function, over a member that is
// itself the bare type parameter, still satisfies a return type spelled out with
// SnapshotIn/SnapshotOut. This is jbrowse's `ConfigurationReference`, and the
// variadic signature alone cannot type it: `S["CreationType"]` stays a deferred
// lookup that does not relate to `SnapshotIn<S>`.
type IdOrSnapshot<S extends IAnyModelType> = Omit<
  IType<
    ReferenceIdentifier | SnapshotIn<S>,
    ReferenceIdentifier | SnapshotOut<S>,
    Instance<S>
  >,
  "Type"
> & { readonly Type: Instance<S> }

function idOrSnapshotRef<S extends IAnyModelType>(schema: S): IdOrSnapshot<S> {
  return types.union(types.reference(schema), schema)
}

// a spread of a plain array still resolves, via the IAnyType fallback signature
declare const manyTypes: (typeof A)[]
const spread = types.union(...manyTypes)
console.log(spread.name)

console.log(
  idOrSnapshotRef,
  models,
  scalars,
  withUndefined,
  eager,
  twelve,
  last,
  first,
  notAMember
)
