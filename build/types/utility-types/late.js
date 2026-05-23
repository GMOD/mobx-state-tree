import { BaseType } from "../../core/type/type.js";
import { typeCheckSuccess } from "../../core/type/type-checker.js";
import { cannotDetermineSubtype, isType, TypeFlags } from "../../core/type/type.js";
import { devMode, fail } from "../../utils.js";
class Late extends BaseType {
    _definition;
    _subType;
    get flags() {
        return (this._subType ? this._subType.flags : 0) | TypeFlags.Late;
    }
    getSubType(mustSucceed) {
        if (!this._subType) {
            let t = undefined;
            try {
                t = this._definition();
            }
            catch (e) {
                if (e instanceof ReferenceError) // can happen in strict ES5 code when a definition is self refering
                 {
                    t = undefined;
                }
                else {
                    throw e;
                }
            }
            if (mustSucceed && t === undefined) {
                throw fail("Late type seems to be used too early, the definition (still) returns undefined");
            }
            if (t) {
                if (devMode() && !isType(t)) {
                    throw fail("Failed to determine subtype, make sure types.late returns a type definition.");
                }
                this._subType = t;
            }
        }
        return this._subType;
    }
    constructor(name, _definition) {
        super(name);
        this._definition = _definition;
    }
    instantiate(parent, subpath, environment, initialValue) {
        return this.getSubType(true).instantiate(parent, subpath, environment, initialValue);
    }
    reconcile(current, newValue, parent, subpath) {
        return this.getSubType(true).reconcile(current, newValue, parent, subpath);
    }
    describe() {
        const t = this.getSubType(false);
        return t ? t.name : "<uknown late type>";
    }
    isValidSnapshot(value, context) {
        const t = this.getSubType(false);
        if (!t) {
            // See #916; the variable the definition closure is pointing to wasn't defined yet, so can't be evaluted yet here
            return typeCheckSuccess();
        }
        return t.validate(value, context);
    }
    isAssignableFrom(type) {
        const t = this.getSubType(false);
        return t ? t.isAssignableFrom(type) : false;
    }
    getSubTypes() {
        const subtype = this.getSubType(false);
        return subtype ? subtype : cannotDetermineSubtype;
    }
}
/**
 * `types.late` - Defines a type that gets implemented later. This is useful when you have to deal with circular dependencies.
 * Please notice that when defining circular dependencies TypeScript isn't smart enough to inference them.
 *
 * Example:
 * ```ts
 *   // TypeScript isn't smart enough to infer self referencing types.
 *  const Node = types.model({
 *       children: types.array(types.late((): IAnyModelType => Node)) // then typecast each array element to Instance<typeof Node>
 *  })
 * ```
 *
 * @param name The name to use for the type that will be returned.
 * @param type A function that returns the type that will be defined.
 * @returns
 */
export function late(nameOrType, maybeType) {
    const name = typeof nameOrType === "string"
        ? nameOrType
        : `late(${nameOrType.toString()})`;
    const type = typeof nameOrType === "string" ? maybeType : nameOrType;
    // checks that the type is actually a late type
    if (devMode()) {
        if (!(typeof type === "function" && type.length === 0)) {
            throw fail("Invalid late type, expected a function with zero arguments that returns a type, got: " +
                type);
        }
    }
    return new Late(name, type);
}
/**
 * Returns if a given value represents a late type.
 *
 * @param type
 * @returns
 */
export function isLateType(type) {
    return isType(type) && (type.flags & TypeFlags.Late) > 0;
}
//# sourceMappingURL=late.js.map