import {
  type ISimpleType,
  Union,
  assertIsString,
  devMode,
  literal
} from "../../internal.ts"

/** @hidden */
export type UnionStringArray<T extends readonly string[]> = T[number]

export function enumeration<T extends string>(
  options: readonly T[]
): ISimpleType<T>
export function enumeration<T extends string>(
  name: string,
  options: readonly T[]
): ISimpleType<T>

/**
 * `types.enumeration` - Can be used to create an string based enumeration.
 * (note: this methods is just sugar for a union of string literals)
 *
 * The member type is inferred from the options, so a literal array, an
 * `as const` array and `Object.values(SomeStringEnum)` all produce the exact
 * union; only an array already typed `string[]` falls back to `string`.
 *
 * Example:
 * ```ts
 * const TrafficLight = types.model({
 *   color: types.enumeration("Color", ["Red", "Orange", "Green"])
 * })
 * ```
 *
 * @param name descriptive name of the enumeration (optional)
 * @param options possible values this enumeration can have
 * @returns
 */
export function enumeration(
  nameOrOptions: string | readonly string[],
  maybeOptions?: readonly string[]
): ISimpleType<string> {
  const name = typeof nameOrOptions === "string" ? nameOrOptions : undefined
  const options =
    typeof nameOrOptions === "string" ? maybeOptions! : nameOrOptions
  if (devMode()) {
    options.forEach((option, i) => {
      assertIsString(option, i + 1)
    })
  }
  // built directly rather than through union(): its members are fresh
  // literals, so interning could never share it, and the name belongs to this
  // union alone
  return new Union(
    options.map(option => literal(`${option}`)),
    name === undefined ? undefined : { name }
  )
}
