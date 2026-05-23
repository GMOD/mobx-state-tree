import { BaseType } from "../../core/type/type.js";
import { getStateTreeNode, isStateTreeNode } from "../../core/node/node-utils.js";
import { typeCheckFailure, typeCheckSuccess } from "../../core/type/type-checker.js";
import { assertIsType, isType, TypeFlags } from "../../core/type/type.js";
import { assertIsFunction, assertIsString } from "../../utils.js";
class Refinement extends BaseType {
    _subtype;
    _predicate;
    _message;
    get flags() {
        return this._subtype.flags | TypeFlags.Refinement;
    }
    constructor(name, _subtype, _predicate, _message) {
        super(name);
        this._subtype = _subtype;
        this._predicate = _predicate;
        this._message = _message;
    }
    describe() {
        return this.name;
    }
    instantiate(parent, subpath, environment, initialValue) {
        // create the child type
        return this._subtype.instantiate(parent, subpath, environment, initialValue);
    }
    isAssignableFrom(type) {
        return this._subtype.isAssignableFrom(type);
    }
    isValidSnapshot(value, context) {
        const subtypeErrors = this._subtype.validate(value, context);
        if (subtypeErrors.length > 0) {
            return subtypeErrors;
        }
        const snapshot = isStateTreeNode(value)
            ? getStateTreeNode(value).snapshot
            : value;
        if (!this._predicate(snapshot)) {
            return typeCheckFailure(context, value, this._message(value));
        }
        return typeCheckSuccess();
    }
    reconcile(current, newValue, parent, subpath) {
        return this._subtype.reconcile(current, newValue, parent, subpath);
    }
    getSubTypes() {
        return this._subtype;
    }
}
/**
 * `types.refinement` - Creates a type that is more specific than the base type, e.g. `types.refinement(types.string, value => value.length > 5)` to create a type of strings that can only be longer then 5.
 *
 * @param name
 * @param type
 * @param predicate
 * @returns
 */
export function refinement(...args) {
    const name = typeof args[0] === "string"
        ? args.shift()
        : isType(args[0])
            ? args[0].name
            : null;
    const type = args[0];
    const predicate = args[1];
    const message = args[2]
        ? args[2]
        : (_v) => "Value does not respect the refinement predicate";
    // ensures all parameters are correct
    assertIsType(type, [1, 2]);
    assertIsString(name, 1);
    assertIsFunction(predicate, [2, 3]);
    assertIsFunction(message, [3, 4]);
    return new Refinement(name, type, predicate, message);
}
/**
 * Returns if a given value is a refinement type.
 *
 * @param type
 * @returns
 */
export function isRefinementType(type) {
    return (type.flags & TypeFlags.Refinement) > 0;
}
//# sourceMappingURL=refinement.js.map