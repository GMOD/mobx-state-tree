import { SimpleType } from "../../core/type/type.js";
import { createScalarNode } from "../../core/node/create-node.js";
import { typeCheckFailure, typeCheckSuccess } from "../../core/type/type-checker.js";
import { isType, TypeFlags } from "../../core/type/type.js";
import { fail } from "../../utils.js";
import { ModelType } from "../complex-types/model.js";
class BaseIdentifierType extends SimpleType {
    validType;
    flags = TypeFlags.Identifier;
    constructor(name, validType) {
        super(name);
        this.validType = validType;
    }
    instantiate(parent, subpath, environment, initialValue) {
        if (!parent || !(parent.type instanceof ModelType)) {
            throw fail(`Identifier types can only be instantiated as direct child of a model type`);
        }
        return createScalarNode(this, parent, subpath, environment, initialValue);
    }
    reconcile(current, newValue, parent, subpath) {
        // we don't consider detaching here since identifier are scalar nodes, and scalar nodes cannot be detached
        if (current.storedValue !== newValue) {
            throw fail(`Tried to change identifier from '${current.storedValue}' to '${newValue}'. Changing identifiers is not allowed.`);
        }
        current.setParent(parent, subpath);
        return current;
    }
    isValidSnapshot(value, context) {
        if (typeof value !== this.validType) {
            return typeCheckFailure(context, value, `Value is not a valid ${this.describe()}, expected a ${this.validType}`);
        }
        return typeCheckSuccess();
    }
}
/**
 * @internal
 * @hidden
 */
export class IdentifierType extends BaseIdentifierType {
    flags = TypeFlags.Identifier;
    constructor() {
        super(`identifier`, "string");
    }
    describe() {
        return `identifier`;
    }
}
/**
 * @internal
 * @hidden
 */
export class IdentifierNumberType extends BaseIdentifierType {
    constructor() {
        super("identifierNumber", "number");
    }
    getSnapshot(node) {
        return node.storedValue;
    }
    describe() {
        return `identifierNumber`;
    }
}
/**
 * `types.identifier` - Identifiers are used to make references, lifecycle events and reconciling works.
 * Inside a state tree, for each type can exist only one instance for each given identifier.
 * For example there couldn't be 2 instances of user with id 1. If you need more, consider using references.
 * Identifier can be used only as type property of a model.
 * This type accepts as parameter the value type of the identifier field that can be either string or number.
 *
 * Example:
 * ```ts
 *  const Todo = types.model("Todo", {
 *      id: types.identifier,
 *      title: types.string
 *  })
 * ```
 *
 * @returns
 */
export const identifier = new IdentifierType();
/**
 * `types.identifierNumber` - Similar to `types.identifier`. This one will serialize from / to a number when applying snapshots
 *
 * Example:
 * ```ts
 *  const Todo = types.model("Todo", {
 *      id: types.identifierNumber,
 *      title: types.string
 *  })
 * ```
 *
 * @returns
 */
export const identifierNumber = new IdentifierNumberType();
/**
 * Returns if a given value represents an identifier type.
 *
 * @param type
 * @returns
 */
export function isIdentifierType(type) {
    return isType(type) && (type.flags & TypeFlags.Identifier) > 0;
}
export { assertIsValidIdentifier, isValidIdentifier, normalizeIdentifier } from "./identifier-utils.js";
//# sourceMappingURL=identifier.js.map