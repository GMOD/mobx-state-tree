import { SimpleType } from "../../core/type/type.js";
import { createScalarNode } from "../../core/node/create-node.js";
import { typeCheckFailure, typeCheckSuccess } from "../../core/type/type-checker.js";
import { isType, TypeFlags } from "../../core/type/type.js";
import { isPrimitive } from "../../utils.js";
import { assertArg } from "../../utils.js";
/**
 * @internal
 * @hidden
 */
export class Literal extends SimpleType {
    value;
    flags = TypeFlags.Literal;
    constructor(value) {
        super(JSON.stringify(value));
        this.value = value;
    }
    instantiate(parent, subpath, environment, initialValue) {
        return createScalarNode(this, parent, subpath, environment, initialValue);
    }
    describe() {
        return JSON.stringify(this.value);
    }
    isValidSnapshot(value, context) {
        if (isPrimitive(value) && value === this.value) {
            return typeCheckSuccess();
        }
        return typeCheckFailure(context, value, `Value is not a literal ${JSON.stringify(this.value)}`);
    }
}
/**
 * `types.literal` - The literal type will return a type that will match only the exact given type.
 * The given value must be a primitive, in order to be serialized to a snapshot correctly.
 * You can use literal to match exact strings for example the exact male or female string.
 *
 * Example:
 * ```ts
 * const Person = types.model({
 *     name: types.string,
 *     gender: types.union(types.literal('male'), types.literal('female'))
 * })
 * ```
 *
 * @param value The value to use in the strict equal check
 * @returns
 */
export function literal(value) {
    // check that the given value is a primitive
    assertArg(value, isPrimitive, "primitive", 1);
    return new Literal(value);
}
/**
 * Returns if a given value represents a literal type.
 *
 * @param type
 * @returns
 */
export function isLiteralType(type) {
    return isType(type) && (type.flags & TypeFlags.Literal) > 0;
}
//# sourceMappingURL=literal.js.map