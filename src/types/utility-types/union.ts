import {
  type AnyObjectNode,
  BaseType,
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
  flattenTypeErrors,
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

/**
 * @internal
 * @hidden
 */
export class Union extends BaseType<any, any, any> {
  private readonly _dispatcher?: ITypeDispatcher
  private readonly _eager: boolean = true

  get flags() {
    let result: TypeFlags = TypeFlags.Union

    this._types.forEach(type => {
      result |= type.flags
    })

    return result
  }

  constructor(
    name: string,
    private readonly _types: IAnyType[],
    options?: UnionOptions
  ) {
    super(name)
    options = {
      eager: true,
      dispatcher: undefined,
      ...options
    }
    this._dispatcher = options.dispatcher
    if (!options.eager) {
      this._eager = false
    }
  }

  isAssignableFrom(type: IAnyType) {
    return this._types.some(subType => subType.isAssignableFrom(type))
  }

  describe() {
    return (
      "(" + this._types.map(factory => factory.describe()).join(" | ") + ")"
    )
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
    const discriminator =
      isPlainObject(value) && typeof (value as any).type === "string"
        ? ` for snapshot with type "${(value as any).type}"`
        : ""
    return `No matching type for union ${this.name}${discriminator}`
  }

  determineType(
    value: this["C"] | this["T"],
    reconcileCurrentType: IAnyType | undefined
  ): IAnyType | undefined {
    // try the dispatcher, if defined
    if (this._dispatcher) {
      return this._dispatcher(value)
    }

    // fast path: when type checking is disabled, try quick structural matching first
    if (!isTypeCheckingEnabled()) {
      const quickMatch = this.tryQuickMatch(value, reconcileCurrentType)
      if (quickMatch) {
        return quickMatch
      }
      // for plain object snapshots that didn't match via quick path, try all types
      // with quick matching before falling back to full validation
      // (state tree nodes must go through full validation for type identity checks)
      if (isPlainObject(value) && !isStateTreeNode(value)) {
        for (const type of this._types) {
          if (this.snapshotLooksLikeType(value, type)) {
            return type
          }
        }
      }
    }

    // find the most accomodating type
    // if we are using reconciliation try the current node type first (fix for #1045)
    if (reconcileCurrentType) {
      if (reconcileCurrentType.is(value)) {
        return reconcileCurrentType
      }
      return this._types
        .filter(t => t !== reconcileCurrentType)
        .find(type => type.is(value))
    } else {
      return this._types.find(type => type.is(value))
    }
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

    // for objects, try structural matching against model types
    const typesToCheck = reconcileCurrentType
      ? [
          reconcileCurrentType,
          ...this._types.filter(t => t !== reconcileCurrentType)
        ]
      : this._types

    for (const type of typesToCheck) {
      if (this.snapshotLooksLikeType(value, type)) {
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
    // and that any literal-typed properties match exactly
    if (type instanceof ModelType) {
      const props = type.properties
      // use cached propertyNames from ModelType instead of Object.keys()
      for (const key of type.propertyNames) {
        const propType = props[key]!
        const isOptional = propType.flags & TypeFlags.Optional
        const propValue = value[key]

        // check required properties exist and are not undefined
        // (unless the type accepts undefined, which Optional types do)
        if (!isOptional) {
          if (!(key in value) || propValue === undefined) {
            return false
          }
        }

        // for literal types, verify the value matches exactly
        // this is critical for discriminated unions
        if (propType.flags & TypeFlags.Literal) {
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
    ).concat(flattenTypeErrors(allErrors))
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
  const options = isType(optionsOrType) ? undefined : optionsOrType
  const types = isType(optionsOrType)
    ? [optionsOrType, ...otherTypes]
    : otherTypes
  const name = "(" + types.map(type => type.name).join(" | ") + ")"

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
  return new Union(name, types, options)
}

/**
 * Returns if a given value represents a union type.
 *
 * @param type
 * @returns
 */
export function isUnionType<IT extends IAnyType>(type: IT): type is IT {
  return (type.flags & TypeFlags.Union) > 0
}
