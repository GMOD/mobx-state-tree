import { BaseType } from "../../core/type/type.ts"
import {
  type AnyObjectNode,
  type ExtractNodeType,
  type IAnyType,
  type IType,
  type IValidationContext,
  type IValidationResult,
  assertIsType,
  fail,
  isStateTreeNode,
  isType,
  typeCheckSuccess
} from "../../internal.ts"

class Resilient<IT extends IAnyType, FT extends IAnyType> extends BaseType<
  IT["CreationType"] | FT["CreationType"],
  IT["SnapshotType"] | FT["SnapshotType"],
  IT["TypeWithoutSTN"] | FT["TypeWithoutSTN"],
  ExtractNodeType<IT> | ExtractNodeType<FT>
> {
  get flags() {
    return this._subtype.flags
  }

  constructor(
    private readonly _subtype: IT,
    private readonly _fallbackType: FT,
    private readonly _createFallbackSnapshot: (
      error: unknown,
      snapshot: any
    ) => FT["CreationType"]
  ) {
    super(`resilient(${_subtype.name})`)
  }

  describe() {
    return `resilient(${this._subtype.describe()})`
  }

  private _instantiateFallback(
    parent: AnyObjectNode | null,
    subpath: string,
    environment: any,
    originalSnapshot: any,
    originalError: unknown
  ): this["N"] {
    let fallbackSnapshot: FT["CreationType"]
    try {
      fallbackSnapshot = this._createFallbackSnapshot(
        originalError,
        originalSnapshot
      )
    } catch (e) {
      throw fail(
        `resilient: createFallbackSnapshot threw while handling error for '${this._subtype.name}': ${originalError}. createFallbackSnapshot error: ${e}`
      )
    }
    try {
      return this._fallbackType.instantiate(
        parent,
        subpath,
        environment,
        fallbackSnapshot
      ) as this["N"]
    } catch (e) {
      throw fail(
        `resilient: fallback type '${this._fallbackType.name}' failed to instantiate while handling error for '${this._subtype.name}': ${originalError}. Fallback error: ${e}`
      )
    }
  }

  instantiate(
    parent: AnyObjectNode | null,
    subpath: string,
    environment: any,
    initialValue: this["C"] | this["T"]
  ): this["N"] {
    if (isStateTreeNode(initialValue)) {
      return this._subtype.instantiate(
        parent,
        subpath,
        environment,
        initialValue
      ) as this["N"]
    }
    try {
      return this._subtype.instantiate(
        parent,
        subpath,
        environment,
        initialValue
      ) as this["N"]
    } catch (e) {
      return this._instantiateFallback(
        parent,
        subpath,
        environment,
        initialValue,
        e
      )
    }
  }

  reconcile(
    current: this["N"],
    newValue: this["C"] | this["T"],
    parent: AnyObjectNode,
    subpath: string
  ): this["N"] {
    if (isStateTreeNode(newValue)) {
      return this._subtype.reconcile(
        current,
        newValue,
        parent,
        subpath
      ) as this["N"]
    }
    if (this._fallbackType.isAssignableFrom(current.type)) {
      try {
        return this._subtype.instantiate(
          parent,
          subpath,
          undefined,
          newValue
        ) as this["N"]
      } catch (e) {
        return this._fallbackType.reconcile(
          current,
          this._createFallbackSnapshot(e, newValue),
          parent,
          subpath
        ) as this["N"]
      }
    }
    try {
      return this._subtype.reconcile(
        current,
        newValue,
        parent,
        subpath
      ) as this["N"]
    } catch (e) {
      current.die()
      return this._instantiateFallback(parent, subpath, undefined, newValue, e)
    }
  }

  isValidSnapshot(
    _value: this["C"],
    _context: IValidationContext
  ): IValidationResult {
    return typeCheckSuccess()
  }

  is(thing: any): thing is any {
    if (isType(thing)) {
      return (
        this._subtype.isAssignableFrom(thing) ||
        this._fallbackType.isAssignableFrom(thing)
      )
    }
    try {
      if (this._subtype.is(thing)) {
        return true
      }
    } catch (_e) {
      // subtype.is() may throw (e.g. union dispatcher)
    }
    try {
      return this._fallbackType.is(thing)
    } catch (_e) {
      return false
    }
  }

  isAssignableFrom(type: IAnyType) {
    return (
      this._subtype.isAssignableFrom(type) ||
      this._fallbackType.isAssignableFrom(type)
    )
  }

  getSubTypes() {
    return [this._subtype, this._fallbackType]
  }

  getSnapshot(node: this["N"]): this["S"] {
    return node.snapshot
  }
}

export interface IResilientType<
  IT extends IAnyType,
  FT extends IAnyType
> extends IType<
  IT["CreationType"] | FT["CreationType"],
  IT["SnapshotType"] | FT["SnapshotType"],
  IT["TypeWithoutSTN"] | FT["TypeWithoutSTN"]
> {}

/**
 * `types.resilient` - Wraps a type so that instantiation errors are caught
 * and a fallback type is used instead. This is useful for loading data that
 * may contain unknown or invalid subtrees (e.g., plugin types that are not
 * installed) without crashing the entire state tree.
 *
 * The `createFallbackSnapshot` callback receives the caught error and the
 * original snapshot, and must return a valid snapshot for the fallback type.
 *
 * @param type The type to wrap.
 * @param fallbackType The fallback type to use when instantiation fails.
 * @param createFallbackSnapshot Callback that produces a fallback snapshot from the error and original snapshot.
 * @returns A resilient type.
 */
export function resilient<IT extends IAnyType, FT extends IAnyType>(
  type: IT,
  fallbackType: FT,
  createFallbackSnapshot: (error: unknown, snapshot: any) => FT["CreationType"]
): IResilientType<IT, FT> {
  assertIsType(type, 1)
  assertIsType(fallbackType, 2)
  return new Resilient(type, fallbackType, createFallbackSnapshot)
}
