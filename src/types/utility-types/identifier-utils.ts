import { assertArg } from "../../utils.ts"

/**
 * Valid types for identifiers.
 */
export type ReferenceIdentifier = string | number

/**
 * @internal
 * @hidden
 */
export function normalizeIdentifier(id: ReferenceIdentifier): string {
  return "" + id
}

/**
 * @internal
 * @hidden
 */
export function isValidIdentifier(id: any): id is ReferenceIdentifier {
  return typeof id === "string" || typeof id === "number"
}

/**
 * @internal
 * @hidden
 */
export function assertIsValidIdentifier(
  id: ReferenceIdentifier,
  argNumber: number | number[]
) {
  assertArg(id, isValidIdentifier, "string or number (identifier)", argNumber)
}
