import {
  EMPTY_ARRAY,
  type ExtractCSTWithSTN,
  type IAnyType,
  fail,
  getStateTreeNode,
  isPrimitive,
  isPrimitiveType,
  isStateTreeNode,
  isTypeCheckingEnabled
} from "../../internal.ts"

/** Validation context entry, this is, where the validation should run against which type */
export interface IValidationContextEntry {
  /** Subpath where the validation should be run, or an empty string to validate it all */
  path: string
  /** Type to validate the subpath against */
  type: IAnyType
}

/** Array of validation context entries */
export type IValidationContext = IValidationContextEntry[]

/** Type validation error */
export interface IValidationError {
  /** Validation context */
  context: IValidationContext
  /** Value that was being validated, either a snapshot or an instance */
  value: any
  /** Error message */
  message?: string
}

/** Type validation result, which is an array of type validation errors */
export type IValidationResult = IValidationError[]

const MAX_STRINGIFY_DEPTH = 3
const MAX_STRINGIFY_ARRAY_ITEMS = 10
const MAX_STRINGIFY_OBJECT_KEYS = 20
const MAX_STRINGIFY_STRING_LENGTH = 100

// Recursively cap depth, array length, object key count, and string length so a
// huge offending snapshot degrades into readable, bounded context instead of a
// wall of text that then gets sliced mid-structure. The depth cap also bounds
// recursion on circular structures.
function truncateForStringify(value: any, depth: number): any {
  if (typeof value === "string") {
    return value.length > MAX_STRINGIFY_STRING_LENGTH
      ? `${value.substring(0, MAX_STRINGIFY_STRING_LENGTH)}… (${value.length - MAX_STRINGIFY_STRING_LENGTH} more characters)`
      : value
  }
  if (value === null || typeof value !== "object") {
    return value
  }
  if (depth >= MAX_STRINGIFY_DEPTH) {
    return Array.isArray(value) ? "[…]" : "{…}"
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_STRINGIFY_ARRAY_ITEMS)
      .map(item => truncateForStringify(item, depth + 1))
    if (value.length > MAX_STRINGIFY_ARRAY_ITEMS) {
      items.push(`… ${value.length - MAX_STRINGIFY_ARRAY_ITEMS} more items`)
    }
    return items
  }
  const keys = Object.keys(value)
  const result: Record<string, any> = {}
  for (const key of keys.slice(0, MAX_STRINGIFY_OBJECT_KEYS)) {
    result[key] = truncateForStringify(value[key], depth + 1)
  }
  if (keys.length > MAX_STRINGIFY_OBJECT_KEYS) {
    result["…"] = `${keys.length - MAX_STRINGIFY_OBJECT_KEYS} more keys`
  }
  return result
}

function safeStringify(value: any) {
  try {
    return JSON.stringify(truncateForStringify(value, 0))
  } catch (e) {
    // istanbul ignore next
    return `<Unserializable: ${e}>`
  }
}

/**
 * @internal
 * @hidden
 */
export function prettyPrintValue(value: any) {
  return typeof value === "function"
    ? `<function${value.name ? ` ${value.name}` : ""}>`
    : isStateTreeNode(value)
      ? `<${value}>`
      : `\`${safeStringify(value)}\``
}

function shortenPrintValue(valueInString: string) {
  return valueInString.length < 280
    ? valueInString
    : `${valueInString.substring(0, 272)}......${valueInString.substring(valueInString.length - 8)}`
}

function toErrorString(error: IValidationError): string {
  const { value } = error
  const type = error.context[error.context.length - 1]!.type!
  const fullPath = error.context
    .map(({ path }) => path)
    .filter(path => path.length > 0)
    .join("/")

  const pathPrefix = fullPath.length > 0 ? `at path "/${fullPath}" ` : ``

  const currentTypename = isStateTreeNode(value)
    ? `value of type ${getStateTreeNode(value).type.name}:`
    : isPrimitive(value)
      ? "value"
      : "snapshot"
  const isSnapshotCompatible =
    type && isStateTreeNode(value) && type.is(getStateTreeNode(value).snapshot)

  return `${pathPrefix}${currentTypename} ${shortenPrintValue(prettyPrintValue(value))} is not assignable ${
    type ? `to type: \`${type.name}\`` : ``
  }${error.message ? ` (${error.message})` : ""}${
    type
      ? isPrimitiveType(type) || isPrimitive(value)
        ? `.`
        : `, expected an instance of \`${(type as IAnyType).name}\` or a snapshot like \`${shortenPrintValue(
            (type as IAnyType).describe()
          )}\` instead.${
            isSnapshotCompatible
              ? " (Note that a snapshot of the provided value is compatible with the targeted type)"
              : ""
          }`
      : `.`
  }`
}

/**
 * @internal
 * @hidden
 * Pushes a new entry onto the context array (mutates in place for performance).
 * Returns the same context array for chaining.
 */
export function getContextForPath(
  context: IValidationContext,
  path: string,
  type: IAnyType
): IValidationContext {
  context.push({ path, type })
  return context
}

/**
 * @internal
 * @hidden
 * Pops the last entry from the context array (mutates in place).
 * Must be called after validation to restore context state.
 */
export function popContext(context: IValidationContext): void {
  context.pop()
}

/**
 * @internal
 * @hidden
 */
export function typeCheckSuccess(): IValidationResult {
  return EMPTY_ARRAY as any
}

/**
 * @internal
 * @hidden
 */
export function typeCheckFailure(
  context: IValidationContext,
  value: any,
  message?: string
): IValidationResult {
  // Clone context since it may be mutated after this error is created
  return [{ context: context.slice(), value, message }]
}

/**
 * @internal
 * @hidden
 */
export function flattenTypeErrors(
  errors: IValidationResult[]
): IValidationResult {
  return errors.flat()
}

// TODO; doublecheck: typecheck should only needed to be invoked from: type.create and array / map / value.property will change
/**
 * @internal
 * @hidden
 */
export function typecheckInternal<IT extends IAnyType>(
  type: IAnyType,
  value: ExtractCSTWithSTN<IT>
): void {
  // runs typeChecking if it is in dev-mode or through a process.env.ENABLE_TYPE_CHECK flag
  if (isTypeCheckingEnabled()) {
    typecheck(type, value)
  }
}

/**
 * Run's the typechecker for the given type on the given value, which can be a snapshot or an instance.
 * Throws if the given value is not according the provided type specification.
 * Use this if you need typechecks even in a production build (by default all automatic runtime type checks will be skipped in production builds)
 *
 * @param type Type to check against.
 * @param value Value to be checked, either a snapshot or an instance.
 */
export function typecheck<IT extends IAnyType>(
  type: IT,
  value: ExtractCSTWithSTN<IT>
): void {
  const errors = type.validate(value, [{ path: "", type }])

  if (errors.length > 0) {
    throw fail(validationErrorsToString(type, value, errors))
  }
}

const MAX_ERRORS_REPORTED = 10

/**
 * @internal
 * @hidden
 * Format a list of validation errors as bullet-style lines, capped at
 * MAX_ERRORS_REPORTED entries with an overflow suffix. Shared by typecheck()
 * and union's `noMatchMessage` so prod-build union failures can include
 * candidate validation errors using the same formatting.
 */
export function formatValidationErrorLines(
  errors: IValidationError[]
): string[] {
  const shown = errors.slice(0, MAX_ERRORS_REPORTED).map(toErrorString)
  const overflow = errors.length - shown.length
  if (overflow > 0) {
    shown.push(`(… and ${overflow} more error${overflow === 1 ? "" : "s"})`)
  }
  return shown
}

function validationErrorsToString<IT extends IAnyType>(
  type: IT,
  value: ExtractCSTWithSTN<IT>,
  errors: IValidationError[]
): string | undefined {
  if (errors.length === 0) {
    return undefined
  }
  return `Error while converting ${shortenPrintValue(prettyPrintValue(value))} to \`${
    type.name
  }\`:\n\n    ${formatValidationErrorLines(errors).join("\n    ")}`
}
