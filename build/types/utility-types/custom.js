import { SimpleType } from "../../core/type/type.js";
import { createScalarNode } from "../../core/node/create-node.js";
import { typeCheckFailure, typeCheckSuccess } from "../../core/type/type-checker.js";
import { TypeFlags } from "../../core/type/type.js";
/**
 * `types.custom` - Creates a custom type. Custom types can be used for arbitrary immutable values, that have a serializable representation. For example, to create your own Date representation, Decimal type etc.
 *
 * The signature of the options is:
 * ```ts
 * export interface CustomTypeOptions<S, T> {
 *     // Friendly name
 *     name: string
 *     // given a serialized value and environment, how to turn it into the target type
 *     fromSnapshot(snapshot: S, env: any): T
 *     // return the serialization of the current value
 *     toSnapshot(value: T): S
 *     // if true, this is a converted value, if false, it's a snapshot
 *     isTargetType(value: T | S): value is T
 *     // a non empty string is assumed to be a validation error
 *     getValidationMessage?(snapshot: S): string
 * }
 * ```
 *
 * Example:
 * ```ts
 * const DecimalPrimitive = types.custom<string, Decimal>({
 *     name: "Decimal",
 *     fromSnapshot(value: string) {
 *         return new Decimal(value)
 *     },
 *     toSnapshot(value: Decimal) {
 *         return value.toString()
 *     },
 *     isTargetType(value: string | Decimal): boolean {
 *         return value instanceof Decimal
 *     },
 *     getValidationMessage(value: string): string {
 *         if (/^-?\d+\.\d+$/.test(value)) return "" // OK
 *         return `'${value}' doesn't look like a valid decimal number`
 *     }
 * })
 *
 * const Wallet = types.model({
 *     balance: DecimalPrimitive
 * })
 * ```
 *
 * @param options
 * @returns
 */
export function custom(options) {
    return new CustomType(options);
}
/**
 * @internal
 * @hidden
 */
export class CustomType extends SimpleType {
    options;
    flags = TypeFlags.Custom;
    constructor(options) {
        super(options.name);
        this.options = options;
    }
    describe() {
        return this.name;
    }
    isValidSnapshot(value, context) {
        if (this.options.isTargetType(value)) {
            return typeCheckSuccess();
        }
        const typeError = this.options.getValidationMessage(value);
        if (typeError) {
            return typeCheckFailure(context, value, `Invalid value for type '${this.name}': ${typeError}`);
        }
        return typeCheckSuccess();
    }
    getSnapshot(node) {
        return this.options.toSnapshot(node.storedValue);
    }
    instantiate(parent, subpath, environment, initialValue) {
        const valueToStore = this.options.isTargetType(initialValue)
            ? initialValue
            : this.options.fromSnapshot(initialValue, parent && parent.root.environment);
        return createScalarNode(this, parent, subpath, environment, valueToStore);
    }
    reconcile(current, value, parent, subpath) {
        const isSnapshot = !this.options.isTargetType(value);
        // in theory customs use scalar nodes which cannot be detached, but still...
        if (!current.isDetaching) {
            const unchanged = current.type === this &&
                (isSnapshot
                    ? value === current.snapshot
                    : value === current.storedValue);
            if (unchanged) {
                current.setParent(parent, subpath);
                return current;
            }
        }
        const valueToStore = isSnapshot
            ? this.options.fromSnapshot(value, parent.root.environment)
            : value;
        const newNode = this.instantiate(parent, subpath, undefined, valueToStore);
        current.die(); // noop if detaching
        return newNode;
    }
}
//# sourceMappingURL=custom.js.map