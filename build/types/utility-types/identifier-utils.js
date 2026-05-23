import { assertArg } from "../../utils.js";
/**
 * @internal
 * @hidden
 */
export function normalizeIdentifier(id) {
    return "" + id;
}
/**
 * @internal
 * @hidden
 */
export function isValidIdentifier(id) {
    return typeof id === "string" || typeof id === "number";
}
/**
 * @internal
 * @hidden
 */
export function assertIsValidIdentifier(id, argNumber) {
    assertArg(id, isValidIdentifier, "string or number (identifier)", argNumber);
}
//# sourceMappingURL=identifier-utils.js.map