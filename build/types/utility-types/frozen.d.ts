import { SimpleType } from "../../core/type/type.ts";
import type { AnyObjectNode } from "../../core/node/object-node.ts";
import { type IValidationContext, type IValidationResult } from "../../core/type/type-checker.ts";
import { type IAnyType, type IType, TypeFlags } from "../../core/type/type.ts";
/**
 * @internal
 * @hidden
 */
export declare class Frozen<T> extends SimpleType<T, T, T> {
    private subType?;
    flags: TypeFlags;
    constructor(subType?: IAnyType | undefined);
    describe(): string;
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, value: this["C"]): this["N"];
    isValidSnapshot(value: this["C"], context: IValidationContext): IValidationResult;
}
export declare function frozen<C>(subType: IType<C, any, any>): IType<C, C, C>;
export declare function frozen<T>(defaultValue: T): IType<T | undefined | null, T, T>;
export declare function frozen<T = any>(): IType<T, T, T>;
/**
 * Returns if a given value represents a frozen type.
 *
 * @param type
 * @returns
 */
export declare function isFrozenType<IT extends IType<T | any, T, T>, T = any>(type: IT): type is IT;
