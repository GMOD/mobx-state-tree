import {
  type IAnyType,
  type IType,
  assertIsType,
  nullType,
  optional,
  undefinedType,
  union
} from "../../internal.ts"

const optionalUndefinedType = optional(undefinedType, undefined)
const optionalNullType = optional(nullType, null)

/** @hidden */
export interface IMaybeIType<IT extends IAnyType, C, O> extends IType<
  IT["CreationType"] | C,
  IT["SnapshotType"] | O,
  IT["TypeWithoutSTN"] | O
> {}

/** @hidden */
export interface IMaybe<IT extends IAnyType> extends IMaybeIType<
  IT,
  undefined,
  undefined
> {}

/** @hidden */
export interface IMaybeNull<IT extends IAnyType> extends IMaybeIType<
  IT,
  null | undefined,
  null
> {}

/**
 * `types.maybe` - Maybe will make a type nullable, and also optional.
 * The value `undefined` will be used to represent nullability.
 *
 * @param type
 * @returns
 */
export function maybe<IT extends IAnyType>(type: IT): IMaybe<IT> {
  assertIsType(type, 1)

  // `union`'s variadic signature reports `(IT | typeof optionalUndefinedType)`
  // indexed by "CreationType" & co. TypeScript cannot reduce that indexed
  // access while `IT` is still an unresolved type parameter, so it cannot see
  // it as the `IT["CreationType"] | undefined` that IMaybe spells out. The two
  // are the same type once IT is known.
  return union(type, optionalUndefinedType) as IMaybe<IT>
}

/**
 * `types.maybeNull` - Maybe will make a type nullable, and also optional.
 * The value `null` will be used to represent no value.
 *
 * @param type
 * @returns
 */
export function maybeNull<IT extends IAnyType>(type: IT): IMaybeNull<IT> {
  assertIsType(type, 1)

  // see the note in `maybe` above
  return union(type, optionalNullType) as IMaybeNull<IT>
}
