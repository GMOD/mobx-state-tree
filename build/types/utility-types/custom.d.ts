import { SimpleType } from "../../core/type/type.ts";
import type { AnyObjectNode } from "../../core/node/object-node.ts";
import { type IValidationContext, type IValidationResult } from "../../core/type/type-checker.ts";
import { type IType, TypeFlags } from "../../core/type/type.ts";
export interface CustomTypeOptions<S, T> {
    /** Friendly name */
    name: string;
    /** given a serialized value and environment, how to turn it into the target type */
    fromSnapshot(snapshot: S, env?: any): T;
    /** return the serialization of the current value */
    toSnapshot(value: T): S;
    /** if true, this is a converted value, if false, it's a snapshot */
    isTargetType(value: T | S): boolean;
    /** a non empty string is assumed to be a validation error */
    getValidationMessage(snapshot: S): string;
}
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
export declare function custom<S, T>(options: CustomTypeOptions<S, T>): IType<S | T, S, T>;
/**
 * @internal
 * @hidden
 */
export declare class CustomType<S, T> extends SimpleType<S | T, S, T> {
    protected readonly options: CustomTypeOptions<S, T>;
    readonly flags = TypeFlags.Custom;
    constructor(options: CustomTypeOptions<S, T>);
    describe(): string;
    isValidSnapshot(value: this["C"], context: IValidationContext): IValidationResult;
    getSnapshot(node: this["N"]): S;
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: S | T): this["N"];
    reconcile(current: this["N"], value: S | T, parent: AnyObjectNode, subpath: string): this["N"];
}
