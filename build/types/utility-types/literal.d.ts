import { SimpleType } from "../../core/type/type.ts";
import type { AnyObjectNode } from "../../core/node/object-node.ts";
import { type IValidationContext, type IValidationResult } from "../../core/type/type-checker.ts";
import { type ISimpleType, type Primitives, TypeFlags } from "../../core/type/type.ts";
/**
 * @internal
 * @hidden
 */
export declare class Literal<T> extends SimpleType<T, T, T> {
    readonly value: T;
    readonly flags = TypeFlags.Literal;
    constructor(value: T);
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: this["C"]): this["N"];
    describe(): string;
    isValidSnapshot(value: this["C"], context: IValidationContext): IValidationResult;
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
export declare function literal<S extends Primitives>(value: S): ISimpleType<S>;
/**
 * Returns if a given value represents a literal type.
 *
 * @param type
 * @returns
 */
export declare function isLiteralType<IT extends ISimpleType<any>>(type: IT): type is IT;
