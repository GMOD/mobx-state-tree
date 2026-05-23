import { _getGlobalState, defineProperty as mobxDefineProperty, isObservableArray, isObservableObject } from "mobx";
const plainObjectString = Object.toString();
/**
 * @internal
 * @hidden
 */
export const EMPTY_ARRAY = Object.freeze([]);
/**
 * @internal
 * @hidden
 */
export const EMPTY_OBJECT = Object.freeze({});
/**
 * @internal
 * @hidden
 */
export const mobxShallow = _getGlobalState().useProxies
    ? { deep: false }
    : { deep: false, proxy: false };
Object.freeze(mobxShallow);
/**
 * @internal
 * @hidden
 */
export function fail(message = "Illegal state") {
    return new Error("[mobx-state-tree] " + message);
}
/**
 * @internal
 * @hidden
 */
export function identity(_) {
    return _;
}
/**
 * @internal
 * @hidden
 */
export function noop() { }
/**
 * @internal
 * @hidden
 */
export const isInteger = Number.isInteger;
/**
 * @internal
 * @hidden
 */
export function isFloat(val) {
    return Number(val) === val && val % 1 !== 0;
}
/**
 * @internal
 * @hidden
 */
export function isFinite(val) {
    return Number.isFinite(val);
}
/**
 * @internal
 * @hidden
 */
export function isArray(val) {
    return Array.isArray(val) || isObservableArray(val);
}
/**
 * @internal
 * @hidden
 */
export function asArray(val) {
    if (!val) {
        return EMPTY_ARRAY;
    }
    if (isArray(val)) {
        return val;
    }
    return [val];
}
/**
 * @internal
 * @hidden
 */
export function extend(a, ...b) {
    for (let i = 0; i < b.length; i++) {
        const current = b[i];
        for (const key in current) {
            a[key] = current[key];
        }
    }
    return a;
}
/**
 * @internal
 * @hidden
 */
export function isPlainObject(value) {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto == null) {
        return true;
    }
    return proto.constructor?.toString() === plainObjectString;
}
/**
 * @internal
 * @hidden
 */
export function isMutable(value) {
    return (value !== null &&
        typeof value === "object" &&
        !(value instanceof Date) &&
        !(value instanceof RegExp));
}
/**
 * @internal
 * @hidden
 */
export function isPrimitive(value, includeDate = true) {
    return (value === null ||
        value === undefined ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        (includeDate && value instanceof Date));
}
/**
 * @internal
 * @hidden
 * Freeze a value and return it (if not in production)
 */
export function freeze(value) {
    if (!devMode()) {
        return value;
    }
    return isPrimitive(value) || isObservableArray(value)
        ? value
        : Object.freeze(value);
}
/**
 * @internal
 * @hidden
 * Recursively freeze a value (if not in production)
 */
export function deepFreeze(value) {
    if (!devMode()) {
        return value;
    }
    freeze(value);
    if (isPlainObject(value)) {
        Object.keys(value).forEach(propKey => {
            if (!isPrimitive(value[propKey]) &&
                !Object.isFrozen(value[propKey])) {
                deepFreeze(value[propKey]);
            }
        });
    }
    return value;
}
/**
 * @internal
 * @hidden
 */
export function isSerializable(value) {
    return typeof value !== "function";
}
/**
 * @internal
 * @hidden
 */
export function defineProperty(object, key, descriptor) {
    if (isObservableObject(object)) {
        mobxDefineProperty(object, key, descriptor);
    }
    else {
        Object.defineProperty(object, key, descriptor);
    }
}
/**
 * @internal
 * @hidden
 */
export function addHiddenFinalProp(object, propName, value) {
    defineProperty(object, propName, {
        enumerable: false,
        writable: false,
        configurable: true,
        value
    });
}
/**
 * @internal
 * @hidden
 */
export function addHiddenWritableProp(object, propName, value) {
    defineProperty(object, propName, {
        enumerable: false,
        writable: true,
        configurable: true,
        value
    });
}
/**
 * @internal
 * @hidden
 */
class EventHandler {
    handlers = [];
    emitting = false;
    pendingUnregisters = null;
    get hasSubscribers() {
        return this.handlers.length > 0;
    }
    register(fn, atTheBeginning = false) {
        if (atTheBeginning) {
            this.handlers.unshift(fn);
        }
        else {
            this.handlers.push(fn);
        }
        return () => {
            this.unregister(fn);
        };
    }
    has(fn) {
        return this.handlers.indexOf(fn) >= 0;
    }
    unregister(fn) {
        if (this.emitting) {
            // defer unregistration until emit is done
            if (!this.pendingUnregisters) {
                this.pendingUnregisters = [];
            }
            this.pendingUnregisters.push(fn);
            return;
        }
        const index = this.handlers.indexOf(fn);
        if (index >= 0) {
            this.handlers.splice(index, 1);
        }
    }
    clear() {
        this.handlers.length = 0;
    }
    emit(...args) {
        // use emitting flag to defer unregistrations instead of copying array
        this.emitting = true;
        try {
            for (const f of this.handlers) {
                f(...args);
            }
        }
        finally {
            this.emitting = false;
            // process any deferred unregistrations
            if (this.pendingUnregisters) {
                for (const fn of this.pendingUnregisters) {
                    const index = this.handlers.indexOf(fn);
                    if (index >= 0) {
                        this.handlers.splice(index, 1);
                    }
                }
                this.pendingUnregisters = null;
            }
        }
    }
}
/**
 * @internal
 * @hidden
 */
export class EventHandlers {
    eventHandlers;
    hasSubscribers(event) {
        const handler = this.eventHandlers && this.eventHandlers[event];
        return !!handler && handler.hasSubscribers;
    }
    register(event, fn, atTheBeginning = false) {
        if (!this.eventHandlers) {
            this.eventHandlers = {};
        }
        let handler = this.eventHandlers[event];
        if (!handler) {
            handler = this.eventHandlers[event] = new EventHandler();
        }
        return handler.register(fn, atTheBeginning);
    }
    has(event, fn) {
        const handler = this.eventHandlers && this.eventHandlers[event];
        return !!handler && handler.has(fn);
    }
    unregister(event, fn) {
        const handler = this.eventHandlers && this.eventHandlers[event];
        if (handler) {
            handler.unregister(fn);
        }
    }
    clear(event) {
        if (this.eventHandlers) {
            delete this.eventHandlers[event];
        }
    }
    clearAll() {
        this.eventHandlers = undefined;
    }
    emit(event, ...args) {
        const handler = this.eventHandlers && this.eventHandlers[event];
        if (handler) {
            ;
            handler.emit(...args);
        }
    }
}
const prototypeHasOwnProperty = Object.prototype.hasOwnProperty;
/**
 * @internal
 * @hidden
 */
export function hasOwnProperty(object, propName) {
    return prototypeHasOwnProperty.call(object, propName);
}
/**
 * @internal
 * @hidden
 */
export function argsToArray(args) {
    const res = new Array(args.length);
    for (let i = 0; i < args.length; i++) {
        res[i] = args[i];
    }
    return res;
}
/**
 * @internal
 * @hidden
 */
export function stringStartsWith(str, beginning) {
    return str.indexOf(beginning) === 0;
}
/**
 * @internal
 * @hidden
 */
export const deprecated = function (id, message) {
    // skip if running production
    if (!devMode()) {
        return;
    }
    // warn if hasn't been warned before
    if (deprecated.ids && !deprecated.ids.hasOwnProperty(id)) {
        warnError("Deprecation warning: " + message);
    }
    // mark as warned to avoid duplicate warn message
    if (deprecated.ids) {
        deprecated.ids[id] = true;
    }
};
deprecated.ids = {};
/**
 * @internal
 * @hidden
 */
export function warnError(msg) {
    console.warn(new Error(`[mobx-state-tree] ${msg}`));
}
/**
 * @internal
 * @hidden
 */
export function isTypeCheckingEnabled() {
    return (devMode() ||
        (typeof process !== "undefined" &&
            process.env &&
            process.env.ENABLE_TYPE_CHECK === "true"));
}
let _devMode = process.env.NODE_ENV !== "production";
/**
 * @internal
 * @hidden
 */
export function devMode() {
    return _devMode;
}
/**
 * @internal
 * @hidden
 */
export function setDevMode(value) {
    _devMode = value;
}
/**
 * @internal
 * @hidden
 */
export function assertArg(value, fn, typeName, argNumber) {
    if (devMode()) {
        if (!fn(value)) {
            // istanbul ignore next
            throw fail(`expected ${typeName} as argument ${asArray(argNumber).join(" or ")}, got ${value} instead`);
        }
    }
}
/**
 * @internal
 * @hidden
 */
export function assertIsFunction(value, argNumber) {
    assertArg(value, fn => typeof fn === "function", "function", argNumber);
}
/**
 * @internal
 * @hidden
 */
export function assertIsNumber(value, argNumber, min, max) {
    assertArg(value, n => typeof n === "number", "number", argNumber);
    if (min !== undefined) {
        assertArg(value, n => n >= min, `number greater than ${min}`, argNumber);
    }
    if (max !== undefined) {
        assertArg(value, n => n <= max, `number lesser than ${max}`, argNumber);
    }
}
/**
 * @internal
 * @hidden
 */
export function assertIsString(value, argNumber, canBeEmpty = true) {
    assertArg(value, s => typeof s === "string", "string", argNumber);
    if (!canBeEmpty) {
        assertArg(value, s => s !== "", "not empty string", argNumber);
    }
}
/**
 * @internal
 * @hidden
 */
export function setImmediateWithFallback(fn) {
    if (typeof queueMicrotask === "function") {
        queueMicrotask(fn);
    }
    else if (typeof setImmediate === "function") {
        setImmediate(fn);
    }
    else {
        setTimeout(fn, 1);
    }
}
//# sourceMappingURL=utils.js.map