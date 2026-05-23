import { BaseType } from "../../core/type/type.js";
import { isStateTreeNode } from "../../core/node/node-utils.js";
import { typeCheckSuccess } from "../../core/type/type-checker.js";
import { assertIsType, isType } from "../../core/type/type.js";
import { fail } from "../../utils.js";
class Resilient extends BaseType {
    _subtype;
    _fallbackType;
    _createFallbackSnapshot;
    get flags() {
        return this._subtype.flags;
    }
    constructor(_subtype, _fallbackType, _createFallbackSnapshot) {
        super(`resilient(${_subtype.name})`);
        this._subtype = _subtype;
        this._fallbackType = _fallbackType;
        this._createFallbackSnapshot = _createFallbackSnapshot;
    }
    describe() {
        return `resilient(${this._subtype.describe()})`;
    }
    _instantiateFallback(parent, subpath, environment, originalSnapshot, originalError) {
        let fallbackSnapshot;
        try {
            fallbackSnapshot = this._createFallbackSnapshot(originalError, originalSnapshot);
        }
        catch (e) {
            throw fail(`resilient: createFallbackSnapshot threw while handling error for '${this._subtype.name}': ${originalError}. createFallbackSnapshot error: ${e}`);
        }
        try {
            return this._fallbackType.instantiate(parent, subpath, environment, fallbackSnapshot);
        }
        catch (e) {
            throw fail(`resilient: fallback type '${this._fallbackType.name}' failed to instantiate while handling error for '${this._subtype.name}': ${originalError}. Fallback error: ${e}`);
        }
    }
    instantiate(parent, subpath, environment, initialValue) {
        if (isStateTreeNode(initialValue)) {
            return this._subtype.instantiate(parent, subpath, environment, initialValue);
        }
        try {
            return this._subtype.instantiate(parent, subpath, environment, initialValue);
        }
        catch (e) {
            return this._instantiateFallback(parent, subpath, environment, initialValue, e);
        }
    }
    reconcile(current, newValue, parent, subpath) {
        if (isStateTreeNode(newValue)) {
            return this._subtype.reconcile(current, newValue, parent, subpath);
        }
        if (this._fallbackType.isAssignableFrom(current.type)) {
            try {
                return this._subtype.instantiate(parent, subpath, undefined, newValue);
            }
            catch (e) {
                return this._fallbackType.reconcile(current, this._createFallbackSnapshot(e, newValue), parent, subpath);
            }
        }
        try {
            return this._subtype.reconcile(current, newValue, parent, subpath);
        }
        catch (e) {
            current.die();
            return this._instantiateFallback(parent, subpath, undefined, newValue, e);
        }
    }
    isValidSnapshot(_value, _context) {
        return typeCheckSuccess();
    }
    is(thing) {
        if (isType(thing)) {
            return (this._subtype.isAssignableFrom(thing) ||
                this._fallbackType.isAssignableFrom(thing));
        }
        try {
            if (this._subtype.is(thing)) {
                return true;
            }
        }
        catch (_e) {
            // subtype.is() may throw (e.g. union dispatcher)
        }
        try {
            return this._fallbackType.is(thing);
        }
        catch (_e) {
            return false;
        }
    }
    isAssignableFrom(type) {
        return (this._subtype.isAssignableFrom(type) ||
            this._fallbackType.isAssignableFrom(type));
    }
    getSubTypes() {
        return [this._subtype, this._fallbackType];
    }
    getSnapshot(node) {
        return node.snapshot;
    }
}
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
export function resilient(type, fallbackType, createFallbackSnapshot) {
    assertIsType(type, 1);
    assertIsType(fallbackType, 2);
    return new Resilient(type, fallbackType, createFallbackSnapshot);
}
//# sourceMappingURL=resilient.js.map