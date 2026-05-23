import { assertIsType } from "../../core/type/type.js";
import { nullType, undefinedType } from "../primitives.js";
import { optional } from "./optional.js";
import { union } from "./union.js";
const optionalUndefinedType = optional(undefinedType, undefined);
const optionalNullType = optional(nullType, null);
/**
 * `types.maybe` - Maybe will make a type nullable, and also optional.
 * The value `undefined` will be used to represent nullability.
 *
 * @param type
 * @returns
 */
export function maybe(type) {
    assertIsType(type, 1);
    return union(type, optionalUndefinedType);
}
/**
 * `types.maybeNull` - Maybe will make a type nullable, and also optional.
 * The value `null` will be used to represent no value.
 *
 * @param type
 * @returns
 */
export function maybeNull(type) {
    assertIsType(type, 1);
    return union(type, optionalNullType);
}
//# sourceMappingURL=maybe.js.map