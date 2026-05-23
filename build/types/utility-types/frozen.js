import { SimpleType } from "../../core/type/type.js";
import { createScalarNode } from "../../core/node/create-node.js";
import { typeCheckFailure, typeCheckSuccess } from "../../core/type/type-checker.js";
import { isType, TypeFlags } from "../../core/type/type.js";
import { deepFreeze, isSerializable } from "../../utils.js";
import { optional } from "./optional.js";
/**
 * @internal
 * @hidden
 */
export class Frozen extends SimpleType {
    subType;
    flags = TypeFlags.Frozen;
    constructor(subType) {
        super(subType ? `frozen(${subType.name})` : "frozen");
        this.subType = subType;
    }
    describe() {
        return "<any immutable value>";
    }
    instantiate(parent, subpath, environment, value) {
        // create the node
        return createScalarNode(this, parent, subpath, environment, deepFreeze(value));
    }
    isValidSnapshot(value, context) {
        if (!isSerializable(value)) {
            return typeCheckFailure(context, value, "Value is not serializable and cannot be frozen");
        }
        if (this.subType) {
            return this.subType.validate(value, context);
        }
        return typeCheckSuccess();
    }
}
const untypedFrozenInstance = new Frozen();
/**
 * `types.frozen` - Frozen can be used to store any value that is serializable in itself (that is valid JSON).
 * Frozen values need to be immutable or treated as if immutable. They need be serializable as well.
 * Values stored in frozen will snapshotted as-is by MST, and internal changes will not be tracked.
 *
 * This is useful to store complex, but immutable values like vectors etc. It can form a powerful bridge to parts of your application that should be immutable, or that assume data to be immutable.
 *
 * Note: if you want to store free-form state that is mutable, or not serializeable, consider using volatile state instead.
 *
 * Frozen properties can be defined in three different ways
 * 1. `types.frozen(SubType)` - provide a valid MST type and frozen will check if the provided data conforms the snapshot for that type
 * 2. `types.frozen({ someDefaultValue: true})` - provide a primitive value, object or array, and MST will infer the type from that object, and also make it the default value for the field
 * 3. `types.frozen<TypeScriptType>()` - provide a typescript type, to help in strongly typing the field (design time only)
 *
 * Example:
 * ```ts
 * const GameCharacter = types.model({
 *   name: string,
 *   location: types.frozen({ x: 0, y: 0})
 * })
 *
 * const hero = GameCharacter.create({
 *   name: "Mario",
 *   location: { x: 7, y: 4 }
 * })
 *
 * hero.location = { x: 10, y: 2 } // OK
 * hero.location.x = 7 // Not ok!
 * ```
 *
 * ```ts
 * type Point = { x: number, y: number }
 *    const Mouse = types.model({
 *         loc: types.frozen<Point>()
 *    })
 * ```
 *
 * @param defaultValueOrType
 * @returns
 */
export function frozen(arg) {
    if (arguments.length === 0) {
        return untypedFrozenInstance;
    }
    else if (isType(arg)) {
        return new Frozen(arg);
    }
    else {
        return optional(untypedFrozenInstance, arg);
    }
}
/**
 * Returns if a given value represents a frozen type.
 *
 * @param type
 * @returns
 */
export function isFrozenType(type) {
    return isType(type) && (type.flags & TypeFlags.Frozen) > 0;
}
//# sourceMappingURL=frozen.js.map