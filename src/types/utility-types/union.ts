import {
  type AnyObjectNode,
  BaseType,
  formatValidationErrorLines,
  type IAnyType,
  type IModelType,
  type IType,
  type IValidationContext,
  type IValidationError,
  type IValidationResult,
  type ModelCreationType2,
  type ModelInstanceType,
  type ModelProperties,
  type ModelSnapshotType2,
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

/**
 * @internal
 * @hidden
 */
export class Union extends BaseType<any, any, any> {
  private readonly _dispatcher?: ITypeDispatcher
  private readonly _eager: boolean = true

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
    for (const type of this._types) {
      result |= type.flags
    }
    if (!(result & TypeFlags.Late)) {
      this._flags = result
    }
    return result
  }

  protected override computeName(): string {
    return `(${this._types.map(type => type.name).join(" | ")})`
  }

  constructor(
    private readonly _types: IAnyType[],
    options?: UnionOptions
  ) {
    super()
    // read the two options directly rather than spreading defaults into a fresh
    // object: this constructor runs once per config slot in jbrowse, and the
    // merged object was allocated only to be read twice and dropped
    this._dispatcher = options?.dispatcher
    if (options?.eager === false) {
      this._eager = false
    }
  }

  override isAssignableFrom(type: IAnyType) {
    return this._types.some(subType => subType.isAssignableFrom(type))
  }

  describe() {
    return `(${this._types.map(factory => factory.describe()).join(" | ")})`
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
  private _discriminatorCache?: Map<string, IAnyType | undefined>
  private _findCandidateByTypeDiscriminator(
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

  private _scanForTypeDiscriminator(
    discriminator: string
  ): IAnyType | undefined {
    let found: IAnyType | undefined
    for (const t of this._types) {
      const model = resolveModelType(t)
      if (!model) {
        continue
      }
      const typeProp = (
        model.properties as Record<string, IAnyType | undefined>
      ).type
      if (
        !typeProp ||
        !(typeProp.flags & TypeFlags.Literal) ||
        !typeProp.is(discriminator)
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
  private _allMembersDiscriminated?: boolean
  private allMembersDiscriminated(): boolean {
    if (this._allMembersDiscriminated === undefined) {
      this._allMembersDiscriminated = this._types.every(t => {
        const model = resolveModelType(t)
        const typeProp =
          model &&
          (model.properties as Record<string, IAnyType | undefined>).type
        return !!typeProp && (typeProp.flags & TypeFlags.Literal) !== 0
      })
    }
    return this._allMembersDiscriminated
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
      return this._types.find(
        type => type !== reconcileCurrentType && type.is(value)
      )
    }
    return this._types.find(type => type.is(value))
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
    for (const type of this._types) {
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
    for (const type of this._types) {
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
        if (type.is(value)) {
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
          if (!propType.is(propValue)) {
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
    if (isPlainObject(value) && !isStateTreeNode(value)) {
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
    const candidates =
      isPlainObject(value) && !isStateTreeNode(value)
        ? this._types.filter(t => this.snapshotLooksLikeType(value, t))
        : []
    const typesToValidate = candidates.length > 0 ? candidates : this._types

    const allErrors: IValidationError[][] = []
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
    return this._types
  }
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

// generated with packages/mobx-state-tree/scripts/generate-union-types.js
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB>(A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB>(options: UnionOptions, A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB,
    OB, FCB, FSB>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC>(A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC>(options: UnionOptions, A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD>(A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD>(options: UnionOptions, A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE>(A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE>(options: UnionOptions, A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE, PF extends ModelProperties, OF, FCF, FSF>(A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>, F: IModelType<PF, OF, FCF, FSF>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE> | ModelCreationType2<PF, FCF>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE> | ModelSnapshotType2<PF, FSF>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE> | ModelInstanceType<PF, OF>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE, PF extends ModelProperties, OF, FCF, FSF>(options: UnionOptions, A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>, F: IModelType<PF, OF, FCF, FSF>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE> | ModelCreationType2<PF, FCF>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE> | ModelSnapshotType2<PF, FSF>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE> | ModelInstanceType<PF, OF>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE, PF extends ModelProperties, OF, FCF, FSF, PG extends ModelProperties, OG, FCG, FSG>(A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>, F: IModelType<PF, OF, FCF, FSF>, G: IModelType<PG, OG, FCG, FSG>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE> | ModelCreationType2<PF, FCF> | ModelCreationType2<PG, FCG>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE> | ModelSnapshotType2<PF, FSF> | ModelSnapshotType2<PG, FSG>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE> | ModelInstanceType<PF, OF> | ModelInstanceType<PG, OG>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE, PF extends ModelProperties, OF, FCF, FSF, PG extends ModelProperties, OG, FCG, FSG>(options: UnionOptions, A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>, F: IModelType<PF, OF, FCF, FSF>, G:
        IModelType<PG, OG, FCG, FSG>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE> | ModelCreationType2<PF, FCF> | ModelCreationType2<PG, FCG>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE> | ModelSnapshotType2<PF, FSF> | ModelSnapshotType2<PG, FSG>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE> | ModelInstanceType<PF, OF> | ModelInstanceType<PG, OG>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE, PF extends ModelProperties, OF, FCF, FSF, PG extends ModelProperties, OG, FCG, FSG, PH extends ModelProperties, OH, FCH, FSH>(A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>, F: IModelType<PF, OF, FCF, FSF>, G: IModelType<PG, OG, FCG, FSG>, H: IModelType<PH, OH, FCH, FSH>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE> | ModelCreationType2<PF, FCF> | ModelCreationType2<PG, FCG> | ModelCreationType2<PH, FCH>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE> | ModelSnapshotType2<PF, FSF> | ModelSnapshotType2<PG, FSG> | ModelSnapshotType2<PH, FSH>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE> | ModelInstanceType<PF, OF> | ModelInstanceType<PG, OG> | ModelInstanceType<PH, OH>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE, PF extends ModelProperties, OF, FCF, FSF, PG extends ModelProperties, OG, FCG, FSG, PH extends ModelProperties, OH, FCH, FSH>(options: UnionOptions, A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE,
        FSE>, F: IModelType<PF, OF, FCF, FSF>, G: IModelType<PG, OG, FCG, FSG>, H: IModelType<PH, OH, FCH, FSH>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE> | ModelCreationType2<PF, FCF> | ModelCreationType2<PG, FCG> | ModelCreationType2<PH, FCH>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE> | ModelSnapshotType2<PF, FSF> | ModelSnapshotType2<PG, FSG> | ModelSnapshotType2<PH, FSH>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE> | ModelInstanceType<PF, OF> | ModelInstanceType<PG, OG> | ModelInstanceType<PH, OH>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE, PF extends ModelProperties, OF, FCF, FSF, PG extends ModelProperties, OG, FCG, FSG, PH extends ModelProperties, OH, FCH, FSH, PI extends ModelProperties, OI, FCI, FSI>(A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD, OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>, F: IModelType<PF, OF, FCF, FSF>, G: IModelType<PG, OG, FCG, FSG>, H: IModelType<PH, OH, FCH, FSH>, I: IModelType<PI, OI, FCI, FSI>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE> | ModelCreationType2<PF, FCF> | ModelCreationType2<PG, FCG> | ModelCreationType2<PH, FCH> | ModelCreationType2<PI, FCI>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE> | ModelSnapshotType2<PF, FSF> | ModelSnapshotType2<PG, FSG> | ModelSnapshotType2<PH, FSH> | ModelSnapshotType2<PI, FSI>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE> | ModelInstanceType<PF, OF> | ModelInstanceType<PG, OG> | ModelInstanceType<PH, OH> | ModelInstanceType<PI, OI>>
// prettier-ignore
export function union<PA extends ModelProperties, OA, FCA, FSA, PB extends ModelProperties, OB, FCB, FSB, PC extends ModelProperties, OC, FCC, FSC, PD extends ModelProperties, OD,
    FCD, FSD, PE extends ModelProperties, OE, FCE, FSE, PF extends ModelProperties, OF, FCF, FSF, PG extends ModelProperties, OG, FCG, FSG, PH extends ModelProperties, OH, FCH, FSH, PI extends ModelProperties, OI, FCI, FSI>(options: UnionOptions, A: IModelType<PA, OA, FCA, FSA>, B: IModelType<PB, OB, FCB, FSB>, C: IModelType<PC, OC, FCC, FSC>, D: IModelType<PD,
        OD, FCD, FSD>, E: IModelType<PE, OE, FCE, FSE>, F: IModelType<PF, OF, FCF, FSF>, G: IModelType<PG, OG, FCG, FSG>, H: IModelType<PH, OH, FCH, FSH>, I: IModelType<PI, OI, FCI, FSI>): ITypeUnion<ModelCreationType2<PA, FCA> | ModelCreationType2<PB, FCB> | ModelCreationType2<PC, FCC> | ModelCreationType2<PD, FCD> | ModelCreationType2<PE, FCE> | ModelCreationType2<PF, FCF> | ModelCreationType2<PG, FCG> | ModelCreationType2<PH, FCH> | ModelCreationType2<PI, FCI>, ModelSnapshotType2<PA, FSA> | ModelSnapshotType2<PB, FSB> | ModelSnapshotType2<PC, FSC> | ModelSnapshotType2<PD, FSD> | ModelSnapshotType2<PE, FSE> | ModelSnapshotType2<PF, FSF> | ModelSnapshotType2<PG, FSG> | ModelSnapshotType2<PH, FSH> | ModelSnapshotType2<PI, FSI>, ModelInstanceType<PA, OA> | ModelInstanceType<PB, OB> | ModelInstanceType<PC, OC> | ModelInstanceType<PD, OD> | ModelInstanceType<PE, OE> | ModelInstanceType<PF, OF> | ModelInstanceType<PG, OG> | ModelInstanceType<PH, OH> | ModelInstanceType<PI, OI>>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB>(A: IType<CA, SA, TA>, B: IType<CB, SB, TB>): ITypeUnion<CA | CB, SA | SB, TA | TB>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB>(options: UnionOptions, A: IType<CA, SA, TA>, B: IType<CB, SB, TB>): ITypeUnion<CA | CB, SA | SB, TA | TB>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC>(A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>): ITypeUnion<CA | CB | CC, SA | SB | SC, TA | TB | TC>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC>(options: UnionOptions, A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>): ITypeUnion<CA | CB | CC, SA | SB | SC, TA | TB | TC>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD>(A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>): ITypeUnion<CA | CB |
    CC | CD, SA | SB | SC | SD, TA | TB | TC | TD>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD>(options: UnionOptions, A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>): ITypeUnion<CA | CB | CC | CD, SA | SB | SC | SD, TA | TB | TC | TD>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE>(A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>): ITypeUnion<CA | CB | CC | CD | CE, SA | SB | SC | SD | SE, TA | TB | TC | TD | TE>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE>(options: UnionOptions, A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>): ITypeUnion<CA | CB | CC | CD | CE, SA | SB | SC | SD | SE, TA | TB | TC | TD | TE>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE, CF, SF, TF>(A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>, F: IType<CF, SF, TF>): ITypeUnion<CA | CB | CC | CD | CE | CF, SA | SB | SC | SD | SE | SF, TA | TB | TC | TD | TE | TF>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE, CF, SF, TF>(options: UnionOptions, A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>, F: IType<CF, SF, TF>): ITypeUnion<CA | CB | CC | CD | CE | CF, SA | SB | SC | SD | SE | SF, TA | TB | TC | TD | TE | TF>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE, CF, SF, TF, CG, SG, TG>(A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>, F: IType<CF, SF, TF>, G: IType<CG, SG, TG>): ITypeUnion<CA | CB | CC | CD | CE | CF | CG, SA | SB | SC | SD | SE | SF | SG, TA | TB | TC | TD |
    TE | TF | TG>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE, CF, SF, TF, CG, SG, TG>(options: UnionOptions, A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>, F: IType<CF, SF, TF>, G: IType<CG, SG, TG>): ITypeUnion<CA | CB | CC | CD | CE | CF | CG, SA | SB | SC | SD | SE | SF | SG, TA | TB | TC | TD | TE | TF | TG>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE, CF, SF, TF, CG, SG, TG, CH, SH, TH>(A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>, F: IType<CF, SF, TF>, G: IType<CG, SG, TG>, H: IType<CH, SH, TH>): ITypeUnion<CA | CB | CC | CD | CE | CF | CG | CH, SA | SB | SC |
    SD | SE | SF | SG | SH, TA | TB | TC | TD | TE | TF | TG | TH>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE, CF, SF, TF, CG, SG, TG, CH, SH, TH>(options: UnionOptions, A: IType<CA, SA, TA>, B: IType<CB, SB,
    TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>, F: IType<CF, SF, TF>, G: IType<CG, SG, TG>, H: IType<CH, SH, TH>): ITypeUnion<CA | CB | CC | CD | CE | CF | CG | CH, SA | SB | SC | SD | SE | SF | SG | SH, TA | TB | TC | TD | TE | TF | TG | TH>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE, CF, SF, TF, CG, SG, TG, CH, SH, TH, CI, SI, TI>(A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>, F: IType<CF, SF, TF>, G: IType<CG, SG, TG>, H: IType<CH, SH, TH>, I: IType<CI, SI, TI>): ITypeUnion<CA | CB | CC | CD |
    CE | CF | CG | CH | CI, SA | SB | SC | SD | SE | SF | SG | SH | SI, TA | TB | TC | TD | TE | TF | TG | TH | TI>
// prettier-ignore
export function union<CA, SA, TA, CB, SB, TB, CC, SC, TC, CD, SD, TD, CE, SE, TE, CF, SF, TF, CG, SG, TG, CH, SH, TH, CI, SI, TI>(options: UnionOptions, A: IType<CA, SA, TA>, B: IType<CB, SB, TB>, C: IType<CC, SC, TC>, D: IType<CD, SD, TD>, E: IType<CE, SE, TE>, F: IType<CF, SF, TF>, G: IType<CG, SG, TG>, H: IType<CH, SH, TH>, I: IType<CI, SI, TI>): ITypeUnion<CA | CB | CC | CD | CE | CF | CG | CH | CI, SA | SB | SC | SD | SE | SF | SG | SH | SI, TA | TB | TC | TD | TE | TF | TG | TH | TI>

// manually written
export function union(...types: IAnyType[]): IAnyType
export function union(
  dispatchOrType: UnionOptions | IAnyType,
  ...otherTypes: IAnyType[]
): IAnyType
/**
 * `types.union` - Create a union of multiple types. If the correct type cannot be inferred unambiguously from a snapshot, provide a dispatcher function of the form `(snapshot) => Type`.
 *
 * @param optionsOrType
 * @param otherTypes
 * @returns
 */
export function union(
  optionsOrType: UnionOptions | IAnyType,
  ...otherTypes: IAnyType[]
): IAnyType {
  const firstIsType = isType(optionsOrType)
  const options = firstIsType ? undefined : optionsOrType
  // Prepending into the rest array with `unshift` looks like it saves the second
  // allocation, and costs 3x instead: V8 inlines the spread but calls out to the
  // `unshift` builtin, which for the 2-member unions jbrowse builds per config
  // slot dominates this function. Measured at ~50ns per union, ~10% of the whole
  // config-schema workload. Allocate the second array.
  const types = firstIsType ? [optionsOrType, ...otherTypes] : otherTypes
  // the name is folded from the members on demand — see Union.computeName

  // check all options
  if (devMode()) {
    if (options) {
      assertArg(
        options,
        o => isPlainObject(o),
        "object { eager?: boolean, dispatcher?: Function }",
        1
      )
    }
    types.forEach((type, i) => {
      assertIsType(type, options ? i + 2 : i + 1)
    })
  }
  return new Union(types, options)
}

/**
 * Returns if a given value represents a union type.
 *
 * @param type
 * @returns
 */
export function isUnionType<IT extends IAnyType>(type: IT): type is IT {
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
