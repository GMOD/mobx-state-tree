import {
  type AnyObjectNode,
  BaseType,
  formatValidationErrorLines,
  type IAnyType,
  type IType,
  type IValidationContext,
  type IValidationResult,
  Literal,
  ModelType,
  TypeFlags,
  type _NotCustomized,
  assertArg,
  assertIsType,
  devMode,
  fail,
  isPlainObject,
  isStateTreeNode,
  isType,
  isTypeCheckingEnabled,
  typeCheckFailure,
  typeCheckSuccess
} from "../../internal.ts"

export type ITypeDispatcher = (snapshot: any) => IAnyType

export interface UnionOptions {
  eager?: boolean
  dispatcher?: ITypeDispatcher
  // Late-bound membership: the union re-reads this thunk on every operation, so
  // members registered after construction participate in dispatch, validation
  // and — critically — reference resolution (`isAssignableFrom` is how the
  // identifier cache decides whether a node can satisfy a reference). Cannot be
  // combined with positional member types. See DynamicUnion below.
  members?: () => IAnyType[]
  // With `members` the folded name would be a moving target, so a stable
  // explicit name is offered; it is honored on any options union.
  name?: string
}

// Drill through single-subtype wrappers — optional(), refinement(),
// snapshotProcessor(), late() — to the underlying ModelType. Discriminated-
// union scoping keys on a member's literal `type` property, but real-world
// members are rarely bare models (jbrowse config schemas, for instance, are
// always optional(model) or optional(snapshotProcessor(model))). Without this
// the scoping never engages and every failure prints every member's full
// structure. Wrappers expose their child as `_subtype` (optional/refinement/
// snapshotProcessor) or via `getSubType()` (late); bounded to avoid cycles.
// Only *successful* resolutions are cached. A wrapper chain's shape is fixed at
// construction, so once a member resolves to a ModelType it always will; but a
// `late` member reports no subtype until its definition evaluates, and that
// miss must stay retryable.
const resolvedModelTypes = new WeakMap<
  IAnyType,
  ModelType<any, any, any, any, any>
>()

function resolveModelType(
  type: IAnyType | undefined
): ModelType<any, any, any, any, any> | undefined {
  if (!type) {
    return undefined
  }
  const cached = resolvedModelTypes.get(type)
  if (cached) {
    return cached
  }
  let current: IAnyType | undefined = type
  for (let depth = 0; current && depth < 20; depth++) {
    if (current instanceof ModelType) {
      resolvedModelTypes.set(type, current)
      return current
    }
    const wrapper = current as {
      _subtype?: IAnyType
      getSubType?: (mustSucceed: boolean) => IAnyType | undefined
    }
    current = wrapper._subtype ?? wrapper.getSubType?.(false)
  }
  return undefined
}

// The quick-match paths below already know a type carries TypeFlags.Literal,
// but `is()` still routes through BaseType.validate — a context array, an entry
// object and a `$treenode` probe per property, per candidate member. A real
// `Literal` stores its primitive, and its isValidSnapshot is exactly value
// equality against it, so compare directly. The `instanceof` gate is load
// bearing: wrappers (optional, refinement, snapshotProcessor, late, union)
// inherit the Literal flag from what they wrap and must keep the full check.
function matchesLiteral(type: IAnyType, value: unknown): boolean {
  return type instanceof Literal ? type.value === value : type.is(value)
}

/**
 * @internal
 * @hidden
 */
export class Union extends BaseType<any, any, any> {
  // These, plus `_discriminatorCache` and `_allMembersDiscriminated` below,
  // live on the prototype and only become own slots on the union that needs
  // one. An eager, dispatcher-less union that is never instantiated and never
  // fails a typecheck carries none of them — which is every union jbrowse
  // builds per config slot, tens of thousands per session load. Same reasoning
  // as `BaseType.isType`; see agent-docs/adr/0003.
  declare private readonly _dispatcher?: ITypeDispatcher
  declare private readonly _eager: boolean

  private _flags?: TypeFlags

  // Memoized, but only once the fold is known to be stable. A `types.late`
  // member reports 0 for its subtype until its definition resolves, so a union
  // containing one must keep recomputing — and every wrapper ORs its subtype's
  // flags upward, so `Late` in the *result* is an exact test for "some member
  // may still change" however deeply it is nested. A resolved late still
  // reports Late, so such a union simply never caches; that is conservative in
  // the safe direction and no real-world union is built out of late members.
  //
  // This reverses an earlier decision to leave it uncached, which was sized at
  // ~4% "on union creation alone". That understated it: the reads are what
  // cost, not the creation. `ModelType._getIdentifierAttribute` folds every
  // property's flags on each `types.model()`, and jbrowse's config slots are
  // unions under a stripDefault, so building one schema re-folded every slot's
  // union. See agent-docs/adr/0003.
  get flags(): TypeFlags {
    const cached = this._flags
    if (cached !== undefined) {
      return cached
    }
    let result: TypeFlags = TypeFlags.Union
    for (const type of this.members()) {
      result |= type.flags
    }
    if (!(result & TypeFlags.Late)) {
      this._flags = result
    }
    return result
  }

  protected override computeName(): string {
    return `(${this.members()
      .map(type => type.name)
      .join(" | ")})`
  }

  constructor(
    private readonly _types: IAnyType[],
    options?: UnionOptions
  ) {
    super()
    // read the options directly rather than spreading defaults into a fresh
    // object: this constructor runs once per config slot in jbrowse, and the
    // merged object was allocated only to be read twice and dropped
    if (options !== undefined) {
      if (options.dispatcher !== undefined) {
        this._dispatcher = options.dispatcher
      }
      if (options.eager === false) {
        this._eager = false
      }
      if (options.name !== undefined) {
        this.name = options.name
      }
    }
  }

  // The one point membership is read through, so DynamicUnion can substitute
  // its thunk without duplicating any of the scanning logic below.
  protected members(): IAnyType[] {
    return this._types
  }

  override isAssignableFrom(type: IAnyType) {
    return this.members().some(subType => subType.isAssignableFrom(type))
  }

  override describe() {
    return `(${this.members()
      .map(factory => factory.describe())
      .join(" | ")})`
  }

  instantiate(
    parent: AnyObjectNode | null,
    subpath: string,
    environment: any,
    initialValue: this["C"] | this["T"]
  ): this["N"] {
    const type = this.determineType(initialValue, undefined)
    if (!type) {
      throw fail(this.noMatchMessage(initialValue))
    } // can happen in prod builds
    return type.instantiate(parent, subpath, environment, initialValue)
  }

  reconcile(
    current: this["N"],
    newValue: this["C"] | this["T"],
    parent: AnyObjectNode,
    subpath: string
  ): this["N"] {
    const type = this.determineType(newValue, current.getReconciliationType())
    if (!type) {
      throw fail(this.noMatchMessage(newValue))
    } // can happen in prod builds
    return type.reconcile(current, newValue, parent, subpath)
  }

  private noMatchMessage(value: unknown): string {
    const base = `No matching type for union ${this.name}`
    if (!isPlainObject(value)) {
      return base
    }
    const discriminator = (value as { type?: unknown }).type
    if (typeof discriminator !== "string") {
      return base
    }
    const baseWithDiscriminator = `${base} for snapshot with type "${discriminator}"`
    // If exactly one union member has a literal `type` property matching the
    // snapshot's discriminator, run its validate() so we can append the
    // property-level reasons it didn't match. This converts the bare prod-build
    // "no matching type" into something diagnosable (e.g. which field was the
    // wrong type, which required field was missing) without re-bloating the
    // message back to every-member's full describe() output.
    const candidate = this._findCandidateByTypeDiscriminator(discriminator)
    if (!candidate) {
      return baseWithDiscriminator
    }
    const errors = candidate.validate(value as any, [
      { path: "", type: candidate }
    ])
    if (errors.length === 0) {
      return baseWithDiscriminator
    }
    return `${baseWithDiscriminator}:\n    ${formatValidationErrorLines(
      errors
    ).join("\n    ")}`
  }

  // Memoizes the discriminator -> member scan below. Union membership is fixed
  // at construction, so the result for a given `type` string never changes.
  // Without this, validating a config with many elements drawn from a wide
  // pluggable union (e.g. jbrowse's 30+ track/adapter types) re-scans every
  // member — and calls resolveModelType + literal.is() on each — once per
  // element. With it, each distinct discriminator scans once; the rest are
  // O(1) map hits. `undefined` (no match OR ambiguous) is cached too.
  declare private _discriminatorCache?: Map<string, IAnyType | undefined>
  protected _findCandidateByTypeDiscriminator(
    discriminator: string
  ): IAnyType | undefined {
    const cache = (this._discriminatorCache ??= new Map())
    if (cache.has(discriminator)) {
      return cache.get(discriminator)
    }
    const found = this._scanForTypeDiscriminator(discriminator)
    cache.set(discriminator, found)
    return found
  }

  protected _scanForTypeDiscriminator(
    discriminator: string
  ): IAnyType | undefined {
    let found: IAnyType | undefined
    for (const t of this.members()) {
      const model = resolveModelType(t)
      if (!model) {
        continue
      }
      const typeProp = (
        model.properties as Record<string, IAnyType | undefined>
      )["type"]
      if (
        !typeProp ||
        !(typeProp.flags & TypeFlags.Literal) ||
        !matchesLiteral(typeProp, discriminator)
      ) {
        continue
      }
      if (found) {
        // Ambiguous (two members declare the same `type` literal). Fall back
        // to the short message rather than picking arbitrarily.
        return undefined
      }
      // Return the original (possibly wrapped) member, not the unwrapped
      // model, so validate()/is() still apply optional defaults and any
      // snapshotProcessor pre-processing.
      found = t
    }
    return found
  }

  // True when every member resolves to a model carrying a literal `type`
  // discriminator — i.e. a fully discriminated union, where a snapshot's `type`
  // uniquely identifies the intended member and no untagged catch-all member
  // could also accept it. Cached: membership is fixed at construction.
  declare private _allMembersDiscriminated?: boolean
  protected allMembersDiscriminated(): boolean {
    if (this._allMembersDiscriminated === undefined) {
      this._allMembersDiscriminated = this.computeAllMembersDiscriminated()
    }
    return this._allMembersDiscriminated
  }

  protected computeAllMembersDiscriminated(): boolean {
    return this.members().every(t => {
      const model = resolveModelType(t)
      const typeProp =
        model &&
        (model.properties as Record<string, IAnyType | undefined>)["type"]
      return !!typeProp && (typeProp.flags & TypeFlags.Literal) !== 0
    })
  }

  determineType(
    value: this["C"] | this["T"],
    reconcileCurrentType: IAnyType | undefined
  ): IAnyType | undefined {
    // try the dispatcher, if defined
    if (this._dispatcher) {
      return this._dispatcher(value)
    }

    // fast path: when type checking is disabled, try quick structural matching
    // first. This skips full recursive validation of every property value, a
    // meaningful win for wide model members (e.g. jbrowse config schemas).
    if (!isTypeCheckingEnabled()) {
      const quickMatch = this.tryQuickMatch(value, reconcileCurrentType)
      if (quickMatch) {
        return quickMatch
      }
    }

    // find the most accomodating type
    // if we are using reconciliation try the current node type first (fix for #1045)
    if (reconcileCurrentType) {
      if (reconcileCurrentType.is(value)) {
        return reconcileCurrentType
      }
      return this.members().find(
        type => type !== reconcileCurrentType && type.is(value)
      )
    }
    return this.members().find(type => type.is(value))
  }

  private tryQuickMatch(
    value: any,
    reconcileCurrentType: IAnyType | undefined
  ): IAnyType | undefined {
    // state tree nodes need full type compatibility checking
    // (e.g., A.is(B.create()) must return false even if snapshots are compatible)
    if (isStateTreeNode(value)) {
      return undefined
    }

    // for non-object values, try primitive matching
    if (!isPlainObject(value)) {
      return this.tryMatchPrimitive(value)
    }

    // for objects, try structural matching against model types, preferring the
    // reconciliation type (checked first, then skipped in the main pass) so a
    // reconcile keeps its current member when it still fits — without building
    // the reordered candidate list this used to allocate on every call
    if (
      reconcileCurrentType &&
      this.snapshotLooksLikeType(value, reconcileCurrentType)
    ) {
      return reconcileCurrentType
    }
    for (const type of this.members()) {
      if (
        type !== reconcileCurrentType &&
        this.snapshotLooksLikeType(value, type)
      ) {
        return type
      }
    }
    return undefined
  }

  private tryMatchPrimitive(value: any): IAnyType | undefined {
    const valueType = typeof value
    for (const type of this.members()) {
      const flags = type.flags
      if (
        (valueType === "string" && flags & TypeFlags.String) ||
        (valueType === "number" &&
          flags &
            (TypeFlags.Number |
              TypeFlags.Integer |
              TypeFlags.Float |
              TypeFlags.Finite)) ||
        (valueType === "boolean" && flags & TypeFlags.Boolean) ||
        (value === null && flags & TypeFlags.Null) ||
        (value === undefined && flags & TypeFlags.Undefined)
      ) {
        return type
      }
      // for literals, check exact value match
      if (flags & TypeFlags.Literal) {
        if (matchesLiteral(type, value)) {
          return type
        }
      }
    }
    return undefined
  }

  private snapshotLooksLikeType(value: any, type: IAnyType): boolean {
    // for model types, check if snapshot has all the required property keys
    // and that any literal-typed properties match exactly. Unwrap optional() /
    // snapshotProcessor() / refinement() / late() so wrapped members (e.g.
    // jbrowse config schemas, which are always optional(model)) still match.
    const model = resolveModelType(type)
    if (model) {
      const props = model.properties
      // use cached propertyNames from ModelType instead of Object.keys()
      for (const key of model.propertyNames) {
        const propType = props[key]!
        // `flags` is a recomputed getter on the wrapper types (optional,
        // snapshotProcessor, late, union), so read it once per property
        const flags = propType.flags
        const propValue = value[key]

        // check required properties exist and are not undefined
        // (unless the type accepts undefined, which Optional types do)
        if (!(flags & TypeFlags.Optional)) {
          if (!(key in value) || propValue === undefined) {
            return false
          }
        }

        // for literal types, verify the value matches exactly
        // this is critical for discriminated unions
        if (flags & TypeFlags.Literal) {
          if (!matchesLiteral(propType, propValue)) {
            return false
          }
        }
      }
      return true
    }
    return false
  }

  isValidSnapshot(
    value: this["C"],
    context: IValidationContext
  ): IValidationResult {
    if (this._dispatcher) {
      return this._dispatcher(value).validate(value, context)
    }

    // For plain-object snapshots carrying a `type` discriminator, validate only
    // the single member whose literal `type` matches.
    // - Clean validation short-circuits to success only when it is sound to skip
    //   the other members: an eager union (first match wins) or a fully
    //   discriminated one (no untagged catch-all could also match). A non-eager
    //   union with a catch-all must still fall through so ambiguity is counted.
    // - A failure is the definitive, scoped error only when every member is
    //   discriminated; otherwise a catch-all could still accept the value, so
    //   fall through to full validation.
    const isSnapshotObject = isPlainObject(value) && !isStateTreeNode(value)
    if (isSnapshotObject) {
      const discriminator = (value as { type?: unknown }).type
      if (typeof discriminator === "string") {
        const candidate = this._findCandidateByTypeDiscriminator(discriminator)
        if (candidate) {
          const errors = candidate.validate(value, context)
          const cleanAndUnique = errors.length === 0 && this._eager
          if (cleanAndUnique || this.allMembersDiscriminated()) {
            return errors
          }
        }
      }
    }

    // for plain-object snapshots, prefer union members whose literal-typed
    // discriminator properties match the value (e.g. {type: "MsaView"})
    // so error output is scoped to the intended branch instead of every member
    const members = this.members()
    const candidates = isSnapshotObject
      ? members.filter(t => this.snapshotLooksLikeType(value, t))
      : []
    const typesToValidate = candidates.length > 0 ? candidates : members

    const allErrors: IValidationResult[] = []
    let applicableTypes = 0
    for (const type of typesToValidate) {
      const errors = type.validate(value, context)
      if (errors.length === 0) {
        if (this._eager) {
          return typeCheckSuccess()
        } else {
          applicableTypes++
        }
      } else {
        allErrors.push(errors)
      }
    }

    if (applicableTypes === 1) {
      return typeCheckSuccess()
    }
    return typeCheckFailure(
      context,
      value,
      "No type is applicable for the union"
    ).concat(allErrors.flat())
  }

  getSubTypes() {
    return this.members()
  }
}

// Defaults shared by every union; see the field declarations at the top of the
// class for why they are not own slots.
Object.assign(Union.prototype as object, {
  _dispatcher: undefined,
  _eager: true,
  _discriminatorCache: undefined,
  _allMembersDiscriminated: undefined
})

/**
 * @internal
 * @hidden
 *
 * A union whose membership is read fresh from a thunk on every operation, so
 * members that come into existence after the union was built — a registry of
 * pluggable types whose modules load on demand — still dispatch, validate, and
 * satisfy references. That last one is the reason this exists: reference
 * resolution asks the target type `isAssignableFrom(node.type)` through the
 * identifier cache, and a membership list frozen at construction would reject
 * every late-loaded member's instances.
 *
 * Every membership-derived cache the base class keeps is bypassed here: flags
 * and the folded name are recomputed per read, and the discriminator scan is
 * uncached so a miss stays retryable once the missing member registers. A hit
 * for a given discriminator is assumed stable — registering two members with
 * the same `type` literal at different times can leave a stale unambiguous
 * answer where the base class would have reported ambiguity.
 */
class DynamicUnion extends Union {
  private readonly _members: () => IAnyType[]

  // `declare` + the setter below, not a field: a field initializer would run
  // after super() and clobber the name the Union constructor assigns through
  // the overridden setter.
  declare private _explicitName?: string

  constructor(members: () => IAnyType[], options: UnionOptions) {
    super([], options)
    this._members = members
  }

  protected override members() {
    return this._members()
  }

  override get flags(): TypeFlags {
    let result: TypeFlags = TypeFlags.Union
    for (const type of this.members()) {
      result |= type.flags
    }
    return result
  }

  override get name(): string {
    return this._explicitName !== undefined
      ? this._explicitName
      : this.computeName()
  }

  override set name(value: string) {
    this._explicitName = value
  }

  protected override _findCandidateByTypeDiscriminator(discriminator: string) {
    return this._scanForTypeDiscriminator(discriminator)
  }

  protected override allMembersDiscriminated() {
    return this.computeAllMembersDiscriminated()
  }
}

// Structurally identical unions are the same object. A union built without
// options is a pure function of its member list — `_types` is the members,
// `_flags`, `_name`, `_discriminatorCache` and `_allMembersDiscriminated` are
// all folds over them, and `_dispatcher`/`_eager` come only from the options
// overload, which is never interned because a dispatcher closure is not
// comparable. Types carry no parent, so one object can serve every use.
//
// jbrowse builds a union per config slot — ~20k per session load — from a
// handful of module-level singletons, so the member tuples number in the
// dozens. A trie of WeakMaps keyed on member identity keeps dynamically built
// members collectable: a node is reachable only through its own key, and the
// union it terminates is reachable only through the node.
interface UnionInternNode {
  union?: Union
  next?: WeakMap<IAnyType, UnionInternNode>
}

const unionInternRoot: UnionInternNode = {}

function internUnion(types: IAnyType[]): Union {
  let node = unionInternRoot
  for (const type of types) {
    const level = (node.next ??= new WeakMap())
    const existing = level.get(type)
    if (existing) {
      node = existing
    } else {
      node = {}
      level.set(type, node)
    }
  }
  return (node.union ??= new Union(types))
}

/**
 * Transform _NotCustomized | _NotCustomized... to _NotCustomized, _NotCustomized | A | B to A | B
 * @hidden
 */
export type _CustomCSProcessor<T> =
  Exclude<T, _NotCustomized> extends never
    ? _NotCustomized
    : Exclude<T, _NotCustomized>

/** @hidden */
export interface ITypeUnion<C, S, T> extends IType<
  _CustomCSProcessor<C>,
  _CustomCSProcessor<S>,
  T
> {}

// Variadic-tuple signatures in place of the 2-to-9-member overload block that
// `scripts/generate-union-types.js` used to emit: the member types are captured
// as a tuple, so the result stays precise past nine members instead of falling
// through to the `IAnyType` signature below.
//
// The member projections go through a mapped tuple indexed by `number` rather
// than the direct `Types[number]["CreationType"]`. Both describe the same set,
// but the direct form is one indexed access over a *union* of type parameters,
// which TypeScript leaves deferred; mapping first resolves each member in its
// own tuple position, so the result reduces to a plain union.
/** @hidden */
export type _UnionMembersCreationType<Types extends readonly IAnyType[]> = {
  [K in keyof Types]: Types[K]["CreationType"]
}[number]
/** @hidden */
export type _UnionMembersSnapshotType<Types extends readonly IAnyType[]> = {
  [K in keyof Types]: Types[K]["SnapshotType"]
}[number]
/** @hidden */
export type _UnionMembersTypeWithoutSTN<Types extends readonly IAnyType[]> = {
  [K in keyof Types]: Types[K]["TypeWithoutSTN"]
}[number]

// The two-member form keeps one type parameter per member, ahead of the
// variadic signatures. Reducing the mapped tuple still leaves each member's C/S/T
// as an indexed access, and when a member is itself a bare type parameter —
// `union(reference(schema), schema)` inside a generic function, which is how
// jbrowse's `ConfigurationReference` is written — `S["CreationType"]` is a
// deferred lookup that TypeScript will not relate to the `SnapshotIn<S>` such a
// function declares as its return. Inferring C/S/T through `IType` reads them
// off the argument's constraint instead of deferring a lookup, so the result is
// a type the checker can relate — at the cost of a member that is itself a bare
// parameter contributing its constraint's C/S/T rather than its own. Two members
// is where such call sites sit (`maybe`/`maybeNull` included); wider unions keep
// the variadic precision.
export function union<CA, SA, TA, CB, SB, TB>(
  A: IType<CA, SA, TA>,
  B: IType<CB, SB, TB>
): ITypeUnion<CA | CB, SA | SB, TA | TB>
export function union<Types extends [IAnyType, ...IAnyType[]]>(
  ...types: Types
): ITypeUnion<
  _UnionMembersCreationType<Types>,
  _UnionMembersSnapshotType<Types>,
  _UnionMembersTypeWithoutSTN<Types>
>
export function union<Types extends [IAnyType, ...IAnyType[]]>(
  options: UnionOptions,
  ...types: Types
): ITypeUnion<
  _UnionMembersCreationType<Types>,
  _UnionMembersSnapshotType<Types>,
  _UnionMembersTypeWithoutSTN<Types>
>
export function union<Types extends readonly IAnyType[]>(
  options: UnionOptions & { members: () => Types }
): ITypeUnion<
  _UnionMembersCreationType<Types>,
  _UnionMembersSnapshotType<Types>,
  _UnionMembersTypeWithoutSTN<Types>
>

// manually written
export function union(...types: IAnyType[]): IAnyType
export function union(
  dispatchOrType: UnionOptions | IAnyType,
  ...otherTypes: IAnyType[]
): IAnyType
/**
 * `types.union` - Create a union of multiple types. If the correct type cannot be inferred unambiguously from a snapshot, provide a dispatcher function of the form `(snapshot) => Type`.
 *
 * Passing `members: () => Type[]` in the options (with no positional member
 * types) creates a union whose membership is re-read from the thunk on every
 * operation, so types registered after construction — e.g. from a lazily
 * loaded module — participate in dispatch, validation and reference
 * resolution. Pair it with a `dispatcher` for snapshot dispatch and a `name`
 * for stable error messages.
 *
 * @param optionsOrType
 * @param otherTypes
 * @returns
 */
export function union(...args: (UnionOptions | IAnyType)[]): IAnyType {
  // One rest array, handed straight to the Union in the common case. Splitting
  // the leading argument out — whether by a `(first, ...rest)` signature that
  // rebuilds `[first, ...rest]`, or by `rest.unshift(first)` — allocates a
  // second array per union, and jbrowse builds one union per config slot. (The
  // `unshift` form is worse still: V8 inlines the spread and calls out to the
  // builtin, so it measured 3x the spread on a two-member union.) Only the
  // options overload, which nothing hot uses, pays for a copy.
  const firstIsType = isType(args[0])
  const options = firstIsType ? undefined : (args[0] as UnionOptions)
  const types = (firstIsType ? args : args.slice(1)) as IAnyType[]
  // the name is folded from the members on demand — see Union.computeName

  // check all options
  if (devMode()) {
    if (options) {
      assertArg(
        options,
        o => isPlainObject(o),
        "object { eager?: boolean, dispatcher?: Function, members?: Function, name?: string }",
        1
      )
    }
    types.forEach((type, i) => {
      assertIsType(type, options ? i + 2 : i + 1)
    })
  }
  if (options?.members !== undefined) {
    if (types.length > 0) {
      throw fail(
        "union(): the members option cannot be combined with positional member types"
      )
    }
    return new DynamicUnion(options.members, options)
  }
  return options === undefined ? internUnion(types) : new Union(types, options)
}

/**
 * Returns if a given value represents a union type.
 *
 * Returns a plain `boolean`, not a `type is IT` predicate: with the parameter
 * typed as `IT`, narrowing to `IT` was a no-op in the positive branch while
 * collapsing the negative one to `never`, so `if (!isX(t)) { t.name }` failed
 * to compile. Guards with a distinct narrowing target (`isArrayType`,
 * `isMapType`, `isModelType`) keep their predicate.
 *
 * @param type
 * @returns
 */
export function isUnionType(type: IAnyType): boolean {
  return isType(type) && (type.flags & TypeFlags.Union) > 0
}

/**
 * Returns the member types of a union.
 *
 * Wrapper types (`optional`, `refinement`, `late`) inherit the union flag from
 * the type they wrap, so `isUnionType` is true for e.g. an optional-of-union,
 * but their `getSubTypes()` reports the single wrapped type rather than the
 * union's members. This drills through those wrappers until the union's member
 * array surfaces.
 *
 * @param type a type for which `isUnionType` is true
 * @returns the array of member types of the underlying union
 */
export function getUnionSubtypes(type: IAnyType): IAnyType[] {
  if (!isUnionType(type)) {
    throw fail("expected a union type")
  }
  let subtypes = type.getSubTypes()
  while (
    typeof subtypes === "object" &&
    subtypes !== null &&
    !Array.isArray(subtypes)
  ) {
    subtypes = subtypes.getSubTypes()
  }
  if (!Array.isArray(subtypes)) {
    throw fail("could not extract subtypes from union type")
  }
  return subtypes
}
