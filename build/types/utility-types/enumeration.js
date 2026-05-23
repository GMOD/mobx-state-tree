import { assertIsString, devMode } from "../../utils.js";
import { literal } from "./literal.js";
import { union } from "./union.js";
/**
 * `types.enumeration` - Can be used to create an string based enumeration.
 * (note: this methods is just sugar for a union of string literals)
 *
 * Example:
 * ```ts
 * const TrafficLight = types.model({
 *   color: types.enumeration("Color", ["Red", "Orange", "Green"])
 * })
 * ```
 *
 * @param name descriptive name of the enumeration (optional)
 * @param options possible values this enumeration can have
 * @returns
 */
export function enumeration(name, options) {
    const realOptions = typeof name === "string" ? options : name;
    // check all options
    if (devMode()) {
        realOptions.forEach((option, i) => {
            assertIsString(option, i + 1);
        });
    }
    const type = union(...realOptions.map(option => literal("" + option)));
    if (typeof name === "string") {
        type.name = name;
    }
    return type;
}
//# sourceMappingURL=enumeration.js.map