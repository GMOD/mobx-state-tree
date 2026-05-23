import { SimpleType } from "../core/type/type.js";
import { createScalarNode } from "../core/node/create-node.js";
import { typeCheckFailure, typeCheckSuccess } from "../core/type/type-checker.js";
import { isType, TypeFlags } from "../core/type/type.js";
import { fail, identity, isFinite, isFloat, isInteger, isPrimitive } from "../utils.js";
// TODO: implement CoreType using types.custom ?
/**
 * @internal
 * @hidden
 */
export class CoreType extends SimpleType {
    flags;
    checker;
    initializer;
    constructor(name, flags, checker, initializer = identity) {
        super(name);
        this.flags = flags;
        this.checker = checker;
        this.initializer = initializer;
        this.flags = flags;
    }
    describe() {
        return this.name;
    }
    instantiate(parent, subpath, environment, initialValue) {
        return createScalarNode(this, parent, subpath, environment, initialValue);
    }
    createNewInstance(snapshot) {
        return this.initializer(snapshot);
    }
    isValidSnapshot(value, context) {
        if (isPrimitive(value) && this.checker(value)) {
            return typeCheckSuccess();
        }
        const typeName = this.name === "Date" ? "Date or a unix milliseconds timestamp" : this.name;
        return typeCheckFailure(context, value, `Value is not a ${typeName}`);
    }
}
/**
 * `types.string` - Creates a type that can only contain a string value.
 * This type is used for string values by default
 *
 * Example:
 * ```ts
 * const Person = types.model({
 *   firstName: types.string,
 *   lastName: "Doe"
 * })
 * ```
 */
// tslint:disable-next-line:variable-name
export const string = new CoreType("string", TypeFlags.String, v => typeof v === "string");
/**
 * `types.number` - Creates a type that can only contain a numeric value.
 * This type is used for numeric values by default
 *
 * Example:
 * ```ts
 * const Vector = types.model({
 *   x: types.number,
 *   y: 1.5
 * })
 * ```
 */
// tslint:disable-next-line:variable-name
export const number = new CoreType("number", TypeFlags.Number, v => typeof v === "number");
/**
 * `types.integer` - Creates a type that can only contain an integer value.
 *
 * Example:
 * ```ts
 * const Size = types.model({
 *   width: types.integer,
 *   height: 10
 * })
 * ```
 */
// tslint:disable-next-line:variable-name
export const integer = new CoreType("integer", TypeFlags.Integer, v => isInteger(v));
/**
 * `types.float` - Creates a type that can only contain an float value.
 *
 * Example:
 * ```ts
 * const Size = types.model({
 *   width: types.float,
 *   height: 10
 * })
 * ```
 */
// tslint:disable-next-line:variable-name
export const float = new CoreType("float", TypeFlags.Float, v => isFloat(v));
/**
 * `types.finite` - Creates a type that can only contain an finite value.
 *
 * Example:
 * ```ts
 * const Size = types.model({
 *   width: types.finite,
 *   height: 10
 * })
 * ```
 */
// tslint:disable-next-line:variable-name
export const finite = new CoreType("finite", TypeFlags.Finite, v => isFinite(v));
/**
 * `types.boolean` - Creates a type that can only contain a boolean value.
 * This type is used for boolean values by default
 *
 * Example:
 * ```ts
 * const Thing = types.model({
 *   isCool: types.boolean,
 *   isAwesome: false
 * })
 * ```
 */
// tslint:disable-next-line:variable-name
export const boolean = new CoreType("boolean", TypeFlags.Boolean, v => typeof v === "boolean");
/**
 * `types.null` - The type of the value `null`
 */
export const nullType = new CoreType("null", TypeFlags.Null, v => v === null);
/**
 * `types.undefined` - The type of the value `undefined`
 */
export const undefinedType = new CoreType("undefined", TypeFlags.Undefined, v => v === undefined);
const _DatePrimitive = new CoreType("Date", TypeFlags.Date, v => typeof v === "number" || v instanceof Date, v => (v instanceof Date ? v : new Date(v)));
_DatePrimitive.getSnapshot = function (node) {
    return node.storedValue.getTime();
};
/**
 * `types.Date` - Creates a type that can only contain a javascript Date value.
 *
 * Example:
 * ```ts
 * const LogLine = types.model({
 *   timestamp: types.Date,
 * })
 *
 * LogLine.create({ timestamp: new Date() })
 * ```
 */
export const DatePrimitive = _DatePrimitive;
/**
 * @internal
 * @hidden
 */
export function getPrimitiveFactoryFromValue(value) {
    switch (typeof value) {
        case "string":
            return string;
        case "number":
            return number; // In the future, isInteger(value) ? integer : number would be interesting, but would be too breaking for now
        case "boolean":
            return boolean;
        case "object":
            if (value instanceof Date) {
                return DatePrimitive;
            }
    }
    throw fail("Cannot determine primitive type from value " + value);
}
/**
 * Returns if a given value represents a primitive type.
 *
 * @param type
 * @returns
 */
export function isPrimitiveType(type) {
    return (isType(type) &&
        (type.flags &
            (TypeFlags.String |
                TypeFlags.Number |
                TypeFlags.Integer |
                TypeFlags.Boolean |
                TypeFlags.Date)) >
            0);
}
//# sourceMappingURL=primitives.js.map