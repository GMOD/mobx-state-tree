import {
  type AnyObjectNode,
  type ISimpleType,
  type IValidationContext,
  type IValidationResult,
  type Primitives,
  SimpleType,
  TypeFlags,
  createScalarNode,
  isPrimitive,
  isType,
  typeCheckFailure,
  typeCheckSuccess
} from "../../internal.ts"
import { assertArg } from "../../utils.ts"

/**
 * @internal
 * @hidden
 */
export class Literal<T> extends SimpleType<T, T, T> {
  readonly value: T
  readonly flags = TypeFlags.Literal

  constructor(value: T) {
    super()
    this.value = value
  }

  protected override computeName(): string {
    return JSON.stringify(this.value)
  }

  instantiate(
    parent: AnyObjectNode | null,
    subpath: string,
    environment: any,
    initialValue: this["C"]
  ): this["N"] {
    return createScalarNode(this, parent, subpath, environment, initialValue)
  }

  isValidSnapshot(
    value: this["C"],
    context: IValidationContext
  ): IValidationResult {
    if (isPrimitive(value) && value === this.value) {
      return typeCheckSuccess()
    }
    return typeCheckFailure(
      context,
      value,
      `Value is not a literal ${JSON.stringify(this.value)}`
    )
  }
}

/**
 * `types.literal` - The literal type will return a type that will match only the exact given type.
 * The given value must be a primitive, in order to be serialized to a snapshot correctly.
 * You can use literal to match exact strings for example the exact male or female string.
 *
 * Example:
 * ```ts
 * const Person = types.model({
 *     name: types.string,
 *     gender: types.union(types.literal('male'), types.literal('female'))
 * })
 * ```
 *
 * @param value The value to use in the strict equal check
 * @returns
 */
export function literal<S extends Primitives>(value: S): ISimpleType<S> {
  // check that the given value is a primitive
  assertArg(value, isPrimitive, "primitive", 1)

  return new Literal<S>(value)
}

/**
 * Returns if a given value represents a literal type.
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
export function isLiteralType<IT extends ISimpleType<any>>(type: IT): boolean {
  return isType(type) && (type.flags & TypeFlags.Literal) > 0
}
