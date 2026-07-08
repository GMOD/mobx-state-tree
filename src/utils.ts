import {
  _getGlobalState,
  defineProperty as mobxDefineProperty,
  isObservableArray,
  isObservableObject
} from "mobx"

import type { Primitives } from "./core/type/type.ts"

const plainObjectString = Object.toString()

/**
 * @internal
 * @hidden
 */
export const EMPTY_ARRAY: ReadonlyArray<any> = Object.freeze([])

/**
 * @internal
 * @hidden
 */

export const EMPTY_OBJECT: {} = Object.freeze({})

/**
 * @internal
 * @hidden
 */
export const mobxShallow = _getGlobalState().useProxies
  ? { deep: false }
  : { deep: false, proxy: false }
Object.freeze(mobxShallow)

/**
 * A generic disposer.
 */
export type IDisposer = () => void

/**
 * @internal
 * @hidden
 */
export function fail(message = "Illegal state"): Error {
  return new Error(`[mobx-state-tree] ${message}`)
}

/**
 * @internal
 * @hidden
 */
export function identity(_: any): any {
  return _
}

/**
 * @internal
 * @hidden
 */
export function noop() {}

/**
 * @internal
 * @hidden
 */
export const isInteger = Number.isInteger

/**
 * @internal
 * @hidden
 */
export function isFloat(val: any) {
  return Number(val) === val && val % 1 !== 0
}

/**
 * @internal
 * @hidden
 */
export function isFinite(val: any) {
  return Number.isFinite(val)
}

/**
 * @internal
 * @hidden
 */
export function isArray(val: any): val is any[] {
  return Array.isArray(val) || isObservableArray(val)
}

/**
 * @internal
 * @hidden
 */
export function asArray<T>(
  val: undefined | null | T | T[] | ReadonlyArray<T>
): T[] {
  if (!val) {
    return EMPTY_ARRAY as any as T[]
  }
  if (isArray(val)) {
    return val as T[]
  }
  return [val] as T[]
}

/**
 * @internal
 * @hidden
 */
export function isPlainObject(value: any): value is { [k: string]: any } {
  if (value === null || typeof value !== "object") {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  if (proto == null) {
    return true
  }
  return proto.constructor?.toString() === plainObjectString
}

/**
 * @internal
 * @hidden
 */
export function isMutable(value: any) {
  return (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !(value instanceof RegExp)
  )
}

/**
 * @internal
 * @hidden
 */
export function isPrimitive(
  value: any,
  includeDate = true
): value is Primitives {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (includeDate && value instanceof Date)
  )
}

/**
 * @internal
 * @hidden
 * Freeze a value and return it (if not in production)
 */
export function freeze<T>(value: T): T {
  if (!devMode()) {
    return value
  }
  return isPrimitive(value) || isObservableArray(value)
    ? value
    : Object.freeze(value)
}

/**
 * @internal
 * @hidden
 * Recursively freeze a value (if not in production)
 */
export function deepFreeze<T>(value: T): T {
  if (devMode()) {
    freeze(value)
    if (isPlainObject(value)) {
      for (const v of Object.values(value as Record<string, unknown>)) {
        if (!isPrimitive(v) && !Object.isFrozen(v)) {
          deepFreeze(v)
        }
      }
    }
  }
  return value
}

/**
 * @internal
 * @hidden
 */
export function isSerializable(value: any) {
  return typeof value !== "function"
}

/**
 * @internal
 * @hidden
 */
export function defineProperty(
  object: any,
  key: PropertyKey,
  descriptor: PropertyDescriptor
) {
  if (isObservableObject(object)) {
    mobxDefineProperty(object, key, descriptor)
  } else {
    Object.defineProperty(object, key, descriptor)
  }
}

/**
 * @internal
 * @hidden
 */
export function addHiddenFinalProp(object: any, propName: string, value: any) {
  defineProperty(object, propName, {
    enumerable: false,
    writable: false,
    configurable: true,
    value
  })
}

/**
 * @internal
 * @hidden
 */
export function addHiddenWritableProp(
  object: any,
  propName: string,
  value: any
) {
  defineProperty(object, propName, {
    enumerable: false,
    writable: true,
    configurable: true,
    value
  })
}

/**
 * @internal
 * @hidden
 */
export type ArgumentTypes<F extends (...args: any[]) => any> = F extends (
  ...args: infer A
) => any
  ? A
  : never

/**
 * @internal
 * @hidden
 */
class EventHandler<F extends (...args: any[]) => any> {
  private handlers: F[] = []

  get hasSubscribers(): boolean {
    return this.handlers.length > 0
  }

  register(fn: F, atTheBeginning = false): IDisposer {
    if (atTheBeginning) {
      this.handlers.unshift(fn)
    } else {
      this.handlers.push(fn)
    }
    return () => {
      this.unregister(fn)
    }
  }

  has(fn: F): boolean {
    return this.handlers.includes(fn)
  }

  unregister(fn: F) {
    const index = this.handlers.indexOf(fn)
    if (index >= 0) {
      this.handlers.splice(index, 1)
    }
  }

  clear() {
    this.handlers.length = 0
  }

  emit(...args: ArgumentTypes<F>) {
    // iterate a copy so (un)registrations during emit don't disturb this pass
    // and reentrant emits stay correct
    const handlers = this.handlers.slice()
    handlers.forEach(f => f(...args))
  }
}

/**
 * @internal
 * @hidden
 */
export class EventHandlers<E extends { [k: string]: (...args: any[]) => any }> {
  private eventHandlers?: {
    [k in keyof E]?: EventHandler<E[k]>
  }

  hasSubscribers(event: keyof E): boolean {
    return this.eventHandlers?.[event]?.hasSubscribers ?? false
  }

  register<N extends keyof E>(
    event: N,
    fn: E[N],
    atTheBeginning = false
  ): IDisposer {
    if (!this.eventHandlers) {
      this.eventHandlers = {}
    }
    let handler = this.eventHandlers[event]
    if (!handler) {
      handler = this.eventHandlers[event] = new EventHandler()
    }
    return handler.register(fn, atTheBeginning)
  }

  has<N extends keyof E>(event: N, fn: E[N]): boolean {
    return this.eventHandlers?.[event]?.has(fn) ?? false
  }

  unregister<N extends keyof E>(event: N, fn: E[N]) {
    const handler = this.eventHandlers?.[event]
    if (handler) {
      handler.unregister(fn)
    }
  }

  clear<N extends keyof E>(event: N) {
    if (this.eventHandlers) {
      delete this.eventHandlers[event]
    }
  }

  clearAll() {
    this.eventHandlers = undefined
  }

  emit<N extends keyof E>(event: N, ...args: ArgumentTypes<E[N]>) {
    const handler = this.eventHandlers?.[event]
    if (handler) {
      handler.emit(...args)
    }
  }
}

const prototypeHasOwnProperty = Object.prototype.hasOwnProperty

/**
 * @internal
 * @hidden
 */
export function hasOwnProperty(object: object, propName: string) {
  return prototypeHasOwnProperty.call(object, propName)
}

/**
 * @internal
 * @hidden
 */
export type DeprecatedFunction = ((id: string, message: string) => void) & {
  ids?: { [id: string]: true }
}

/**
 * @internal
 * @hidden
 */
export const deprecated: DeprecatedFunction = function (
  id: string,
  message: string
): void {
  // skip if running production
  if (!devMode()) {
    return
  }
  // warn if hasn't been warned before
  if (deprecated.ids && !Object.hasOwn(deprecated.ids, id)) {
    warnError(`Deprecation warning: ${message}`)
  }
  // mark as warned to avoid duplicate warn message
  if (deprecated.ids) {
    deprecated.ids[id] = true
  }
}
deprecated.ids = {}

/**
 * @internal
 * @hidden
 */
export function warnError(msg: string) {
  console.warn(new Error(`[mobx-state-tree] ${msg}`))
}
let _typeChecking: boolean | undefined

/**
 * Forces full run-time type-checking on or off, overriding the dev-mode and
 * `ENABLE_TYPE_CHECK` env-var defaults. Pass `true` to get better error messages
 * in production builds without relying on an environment variable, `false` to
 * force it off, or `undefined` to restore the default behavior.
 */
export function setTypeChecking(enabled: boolean | undefined) {
  _typeChecking = enabled
}

/**
 * @internal
 * @hidden
 */
export function isTypeCheckingEnabled() {
  // an explicit setTypeChecking() override (incl. `false`) wins over the
  // dev-mode / env-var default, hence ?? rather than ||
  return (
    _typeChecking ??
    (devMode() ||
      (typeof process !== "undefined" &&
        process.env?.ENABLE_TYPE_CHECK === "true"))
  )
}

let _devMode = process.env.NODE_ENV !== "production"

/**
 * @internal
 * @hidden
 */
export function devMode() {
  return _devMode
}

/**
 * @internal
 * @hidden
 */
export function setDevMode(value: boolean) {
  _devMode = value
}

/**
 * @internal
 * @hidden
 */
export function assertArg<T>(
  value: T,
  fn: (value: T) => boolean,
  typeName: string,
  argNumber: number | number[]
) {
  if (devMode()) {
    if (!fn(value)) {
      // istanbul ignore next
      throw fail(
        `expected ${typeName} as argument ${asArray(argNumber).join(" or ")}, got ${value} instead`
      )
    }
  }
}

/**
 * @internal
 * @hidden
 */
export function assertIsFunction(
  value: (...args: any[]) => any,
  argNumber: number | number[]
) {
  assertArg(value, fn => typeof fn === "function", "function", argNumber)
}

/**
 * @internal
 * @hidden
 */
export function assertIsNumber(
  value: number,
  argNumber: number | number[],
  min?: number,
  max?: number
) {
  assertArg(value, n => typeof n === "number", "number", argNumber)
  if (min !== undefined) {
    assertArg(value, n => n >= min, `number greater than ${min}`, argNumber)
  }
  if (max !== undefined) {
    assertArg(value, n => n <= max, `number lesser than ${max}`, argNumber)
  }
}

/**
 * @internal
 * @hidden
 */
export function assertIsString(
  value: string,
  argNumber: number | number[],
  canBeEmpty = true
) {
  assertArg(value, s => typeof s === "string", "string", argNumber)
  if (!canBeEmpty) {
    assertArg(value, s => s !== "", "not empty string", argNumber)
  }
}

/**
 * @internal
 * @hidden
 */
export function setImmediateWithFallback(fn: (...args: any[]) => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn)
  } else if (typeof setImmediate === "function") {
    setImmediate(fn)
  } else {
    setTimeout(fn, 1)
  }
}
