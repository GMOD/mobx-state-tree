import {
  type AnyObjectNode,
  BaseType,
  type ExtractCSTWithSTN,
  type IAnyType,
  type IType,
  type IValidationContext,
  type IValidationResult,
  ModelType,
  TypeFlags,
  assertIsType,
  devMode,
  fail,
  isStateTreeNode,
  isType,
  typeCheckSuccess,
  typecheckInternal
} from "../../internal.ts"

type IFunctionReturn<T> = () => T

type IOptionalValue<C, T> = C | IFunctionReturn<C | T>

/** @hidden */
export type ValidOptionalValue = string | boolean | number | null | undefined

/** @hidden */
export type ValidOptionalValues = [ValidOptionalValue, ...ValidOptionalValue[]]

/**
 * @hidden
 * @internal
 */
export class OptionalValue<
  IT extends IAnyType,
  OptionalVals extends ValidOptionalValues
> extends BaseType<
  IT["CreationType"] | OptionalVals[number],
  IT["SnapshotType"],
  IT["TypeWithoutSTN"]
> {
  private _flags?: TypeFlags

  // memoized once stable; see the same guard on Union.flags for why `Late` in
  // the folded result is the exact test for "may still change"
  get flags(): TypeFlags {
    const cached = this._flags
    if (cached !== undefined) {
      return cached
    }
    const result = this._subtype.flags | TypeFlags.Optional
    if (!(result & TypeFlags.Late)) {
      this._flags = result
    }
    return result
  }

  constructor(
    private readonly _subtype: IT,
    private readonly _defaultValue: IOptionalValue<
      IT["CreationType"],
      IT["Type"]
    >,
    readonly optionalValues: OptionalVals
  ) {
    // no name argument: reading `_subtype.name` here would force the name of
    // whatever is wrapped, and jbrowse wraps a union per config slot
    super()
  }

  protected override computeName(): string {
    return this._subtype.name
  }

  override describe() {
    return `${this._subtype.describe()}?`
  }

  instantiate(
    parent: AnyObjectNode | null,
    subpath: string,
    environment: any,
    initialValue: this["C"] | this["T"]
  ): this["N"] {
    if (this.optionalValues.includes(initialValue)) {
      const defaultInstanceOrSnapshot = this.getDefaultInstanceOrSnapshot()
      return this._subtype.instantiate(
        parent,
        subpath,
        environment,
        defaultInstanceOrSnapshot
      )
    }
    return this._subtype.instantiate(parent, subpath, environment, initialValue)
  }

  reconcile(
    current: this["N"],
    newValue: this["C"] | this["T"],
    parent: AnyObjectNode,
    subpath: string
  ): this["N"] {
    return this._subtype.reconcile(
      current,
      !this.optionalValues.includes(newValue) && this._subtype.is(newValue)
        ? newValue
        : this.getDefaultInstanceOrSnapshot(),
      parent,
      subpath
    )
  }

  getDefaultInstanceOrSnapshot(): this["C"] | this["T"] {
    const defaultValue = this._defaultValue
    if (typeof defaultValue !== "function") {
      // static values are already snapshots, checked once by types.optional
      return defaultValue
    }
    const generated = (defaultValue as IFunctionReturn<this["C"] | this["T"]>)()
    // generator functions must always be rechecked just in case
    typecheckInternal(this, generated)
    return generated
  }

  isValidSnapshot(
    value: this["C"],
    context: IValidationContext
  ): IValidationResult {
    // defaulted values can be skipped
    if (this.optionalValues.includes(value)) {
      return typeCheckSuccess()
    }
    // bounce validation to the sub-type
    return this._subtype.validate(value, context)
  }

  override isAssignableFrom(type: IAnyType) {
    return this._subtype.isAssignableFrom(type)
  }

  getSubTypes() {
    return this._subtype
  }
}

/** @hidden */
export type OptionalDefaultValueOrFunction<IT extends IAnyType> =
  | IT["CreationType"]
  | IT["SnapshotType"]
  | (() => ExtractCSTWithSTN<IT>)

/** @hidden */
export interface IOptionalIType<
  IT extends IAnyType,
  OptionalVals extends ValidOptionalValues
> extends IType<
  IT["CreationType"] | OptionalVals[number],
  IT["SnapshotType"],
  IT["TypeWithoutSTN"]
> {
  getDefaultInstanceOrSnapshot(): IT["CreationType"] | IT["SnapshotType"]
}

function checkOptionalPreconditions<IT extends IAnyType>(
  type: IAnyType,
  defaultValueOrFunction: OptionalDefaultValueOrFunction<IT>
) {
  // make sure we never pass direct instances. A node is always an object, so
  // the typeof narrows first: most defaults are primitives, and reading
  // `$treenode` off a string or a number is a megamorphic miss that this runs
  // once per config slot.
  if (
    typeof defaultValueOrFunction === "object" &&
    isStateTreeNode(defaultValueOrFunction)
  ) {
    throw fail(
      "default value cannot be an instance, pass a snapshot or a function that creates an instance/snapshot instead"
    )
  }
  assertIsType(type, 1)
  if (devMode()) {
    // we only check default values if they are passed directly
    // if they are generator functions they will be checked once they are generated
    // we don't check generator function results here to avoid generating a node just for type-checking purposes
    // which might generate side-effects
    if (typeof defaultValueOrFunction !== "function") {
      typecheckInternal(type, defaultValueOrFunction)
    }
  }
}

export function optional<IT extends IAnyType>(
  type: IT,
  defaultValueOrFunction: OptionalDefaultValueOrFunction<IT>
): IOptionalIType<IT, [undefined]>
export function optional<
  IT extends IAnyType,
  OptionalVals extends ValidOptionalValues
>(
  type: IT,
  defaultValueOrFunction: OptionalDefaultValueOrFunction<IT>,
  optionalValues: OptionalVals
): IOptionalIType<IT, OptionalVals>
/**
 * `types.optional` - Can be used to create a property with a default value.
 *
 * Depending on the third argument (`optionalValues`) there are two ways of operation:
 * - If the argument is not provided, then if a value is not provided in the snapshot (`undefined` or missing),
 *   it will default to the provided `defaultValue`
 * - If the argument is provided, then if the value in the snapshot matches one of the optional values inside the array then it will
 *   default to the provided `defaultValue`. Additionally, if one of the optional values inside the array is `undefined` then a missing
 *   property is also valid.
 *
 *   Note that it is also possible to include values of the same type as the intended subtype as optional values,
 *   in this case the optional value will be transformed into the `defaultValue` (e.g. `types.optional(types.string, "unnamed", [undefined, ""])`
 *   will transform the snapshot values `undefined` (and therefore missing) and empty strings into the string `"unnamed"` when it gets
 *   instantiated).
 *
 * If `defaultValue` is a function, the function will be invoked for every new instance.
 * Applying a snapshot in which the optional value is one of the optional values (or `undefined`/_not_ present if none are provided) causes the
 * value to be reset.
 *
 * Example:
 * ```ts
 * const Todo = types.model({
 *   title: types.string,
 *   subtitle1: types.optional(types.string, "", [null]),
 *   subtitle2: types.optional(types.string, "", [null, undefined]),
 *   done: types.optional(types.boolean, false),
 *   created: types.optional(types.Date, () => new Date()),
 * })
 *
 * // if done is missing / undefined it will become false
 * // if created is missing / undefined it will get a freshly generated timestamp
 * // if subtitle1 is null it will default to "", but it cannot be missing or undefined
 * // if subtitle2 is null or undefined it will default to ""; since it can be undefined it can also be missing
 * const todo = Todo.create({ title: "Get coffee", subtitle1: null })
 * ```
 *
 * @param type
 * @param defaultValueOrFunction
 * @param optionalValues an optional array with zero or more primitive values (string, number, boolean, null or undefined)
 *                       that will be converted into the default. `[ undefined ]` is assumed when none is provided
 * @returns
 */
export function optional<
  IT extends IAnyType,
  OptionalVals extends ValidOptionalValues
>(
  type: IT,
  defaultValueOrFunction: OptionalDefaultValueOrFunction<IT>,
  optionalValues?: OptionalVals
): IOptionalIType<IT, OptionalVals> {
  checkOptionalPreconditions(type, defaultValueOrFunction)

  return new OptionalValue(
    type,
    defaultValueOrFunction,
    optionalValues ? optionalValues : undefinedAsOptionalValues
  )
}

const undefinedAsOptionalValues: [undefined] = [undefined]

/**
 * Returns if a value represents an optional type.
 *
 * Returns a plain `boolean`, not a `type is IT` predicate: with the parameter
 * typed as `IT`, narrowing to `IT` was a no-op in the positive branch while
 * collapsing the negative one to `never`, so `if (!isX(t)) { t.name }` failed
 * to compile. Guards with a distinct narrowing target (`isArrayType`,
 * `isMapType`, `isModelType`) keep their predicate.
 *
 * @template IT
 * @param type
 * @returns
 */
export function isOptionalType<IT extends IAnyType>(type: IT): boolean {
  return isType(type) && (type.flags & TypeFlags.Optional) > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * The identifier attribute of the model a stripDefault ultimately wraps, or
 * `null` when there is none. Drills through the single-subtype wrappers the way
 * `resolveModelType` in union.ts does — that one is module-private there, and
 * this file may not reach into it.
 *
 * `null` is also the answer for an unresolved `types.late`, which only costs the
 * short-circuit, never correctness: the full structural walk still runs.
 */
function resolveIdentifierAttribute(type: IAnyType): string | null {
  let current: IAnyType | undefined = type
  for (let depth = 0; current && depth < 20; depth++) {
    if (current instanceof ModelType) {
      return current.identifierAttribute ? current.identifierAttribute : null
    }
    const wrapper = current as {
      _subtype?: IAnyType
      getSubType?: (mustSucceed: boolean) => IAnyType | undefined
    }
    current = wrapper._subtype ?? wrapper.getSubType?.(false)
  }
  return null
}

/**
 * Compare a child snapshot to a stripped-default's reference snapshot: identity
 * for primitives, structural for objects/arrays.
 *
 * Walks the two snapshots in parallel and bails at the first difference. The
 * previous implementation compared `JSON.stringify(a) === JSON.stringify(b)`
 * behind a size guard, which is O(whole snapshot) on both sides — plus two
 * string allocations — even when the very first key differs. That is the normal
 * case for an identified sub-model: its snapshot has exactly the same shape as
 * the default and differs only in the identifier, so the size guard never fires
 * and every `getSnapshot` of the parent serialized both trees just to answer
 * "no".
 *
 * Snapshots are frozen, acyclic, JSON-ish plain data, so a plain recursive walk
 * is safe. Key order is compared too, matching what stringify comparison did:
 * the point is to answer "is this still the default", and the only unsafe answer
 * is a false positive (a key gets dropped from the snapshot that shouldn't be),
 * so where this can't reproduce stringify exactly — `{a: undefined}` vs
 * `{b: undefined}`, or `NaN` nested in a frozen value, both of which stringify
 * flattened into equal text — it errs toward "not equal" and simply keeps the
 * key. Neither shape is reachable from a model snapshot, whose key set and order
 * are fixed by its type.
 */
function defaultSnapshotEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false
  }
  const aIsArray = Array.isArray(a)
  if (aIsArray !== Array.isArray(b)) {
    return false
  }
  if (aIsArray) {
    const arrayA = a as unknown[]
    const arrayB = b as unknown[]
    if (arrayA.length !== arrayB.length) {
      return false
    }
    for (let i = 0; i < arrayA.length; i++) {
      if (!defaultSnapshotEquals(arrayA[i], arrayB[i])) {
        return false
      }
    }
    return true
  }
  const objectA = a as Record<string, unknown>
  const objectB = b as Record<string, unknown>
  const keysA = Object.keys(objectA)
  const keysB = Object.keys(objectB)
  if (keysA.length !== keysB.length) {
    return false
  }
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!
    if (
      key !== keysB[i] ||
      !defaultSnapshotEquals(objectA[key], objectB[key])
    ) {
      return false
    }
  }
  return true
}

/**
 * An optional type that additionally omits its key from a parent model's
 * snapshot when the value equals the (snapshotted) default. The comparison is
 * against the default *snapshot* — i.e. the subtype is instantiated with the
 * default once and its post-processed snapshot is cached — so a default whose
 * normalized form gains fields (e.g. a fileLocation gaining `locationType`)
 * still strips correctly.
 *
 * @hidden
 * @internal
 */
export class StripDefaultValue<
  IT extends IAnyType,
  OptionalVals extends ValidOptionalValues
> extends OptionalValue<IT, OptionalVals> {
  // all three live on the prototype until a strip actually happens; jbrowse
  // builds one of these per config slot and most are never serialized. See
  // `BaseType.isType`.
  declare private _defaultSnapshot?: { value: IT["SnapshotType"] }
  declare private _identifierAttribute?: string | null
  declare private _equalsDefaultCache?: WeakMap<object, boolean>

  private equalsDefault(snapshot: unknown, defaultSnapshot: unknown): boolean {
    let identifierAttribute = this._identifierAttribute
    if (identifierAttribute === undefined) {
      identifierAttribute = resolveIdentifierAttribute(this.getSubTypes())
      this._identifierAttribute = identifierAttribute
    }
    // an identified model's snapshot normally has the same shape as the default
    // and differs only here, so answering from one key beats walking every key
    // (including nested objects) until the walk reaches it
    return identifierAttribute !== null &&
      isRecord(snapshot) &&
      isRecord(defaultSnapshot) &&
      snapshot[identifierAttribute] !== defaultSnapshot[identifierAttribute]
      ? false
      : defaultSnapshotEquals(snapshot, defaultSnapshot)
  }

  shouldStripFromSnapshot(snapshot: IT["SnapshotType"]): boolean {
    if (!this._defaultSnapshot) {
      // instantiate the subtype detached with the default and read the node's
      // snapshot, which normalizes (fills model defaults, applies the subtype's
      // own postProcess). Cached on the (singleton) type after first use.
      const node = this.getSubTypes().instantiate(
        null,
        "",
        undefined,
        this.getDefaultInstanceOrSnapshot()
      )
      this._defaultSnapshot = { value: node.snapshot }
    }
    const defaultSnapshot = this._defaultSnapshot.value
    let result: boolean
    if (isRecord(snapshot)) {
      // a child node's snapshot is a keepAlive computed, so a stable reference
      // means unchanged content: the same object always gets the same answer
      let cache = this._equalsDefaultCache
      if (!cache) {
        cache = new WeakMap()
        this._equalsDefaultCache = cache
      }
      const cached = cache.get(snapshot)
      if (cached === undefined) {
        result = this.equalsDefault(snapshot, defaultSnapshot)
        cache.set(snapshot, result)
      } else {
        result = cached
      }
    } else {
      result = defaultSnapshotEquals(snapshot, defaultSnapshot)
    }
    return result
  }
}

Object.assign(StripDefaultValue.prototype as object, {
  _defaultSnapshot: undefined,
  _identifierAttribute: undefined,
  _equalsDefaultCache: undefined
})

/**
 * Whether `type` is a strip-default optional whose current child `snapshot`
 * equals its default and should therefore be omitted from the parent model's
 * snapshot. Used by `ModelType.getSnapshot`.
 *
 * @hidden
 * @internal
 */
export function shouldStripChildFromSnapshot(
  type: IAnyType,
  snapshot: unknown
): boolean {
  return (
    type instanceof StripDefaultValue && type.shouldStripFromSnapshot(snapshot)
  )
}

/**
 * `types.stripDefault` - Like `types.optional`, but the property is omitted from
 * a parent model's snapshot entirely when its value equals the default (instead
 * of being serialized with the default value). Lets a model produce minimal
 * snapshots without a bespoke `postProcessSnapshot`.
 *
 * @param type
 * @param defaultValueOrFunction
 * @returns
 */
export function stripDefault<IT extends IAnyType>(
  type: IT,
  defaultValueOrFunction: OptionalDefaultValueOrFunction<IT>
): IOptionalIType<IT, [undefined]> {
  checkOptionalPreconditions(type, defaultValueOrFunction)
  return new StripDefaultValue(
    type,
    defaultValueOrFunction,
    undefinedAsOptionalValues
  )
}
