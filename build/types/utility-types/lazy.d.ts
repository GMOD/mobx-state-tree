import { SimpleType } from "../../core/type/type.ts";
import type { AnyObjectNode } from "../../core/node/object-node.ts";
import { type IValidationContext, type IValidationResult } from "../../core/type/type-checker.ts";
import { type IType, TypeFlags } from "../../core/type/type.ts";
interface LazyOptions<T extends IType<any, any, any>, U> {
    loadType: () => Promise<T>;
    shouldLoadPredicate: (parent: U) => boolean;
}
export declare function lazy<T extends IType<any, any, any>, U>(name: string, options: LazyOptions<T, U>): T;
/**
 * @internal
 * @hidden
 */
export declare class Lazy<T extends IType<any, any, any>, U> extends SimpleType<T, T, T> {
    private readonly options;
    flags: TypeFlags;
    private loadedType;
    private pendingNodeList;
    constructor(name: string, options: LazyOptions<T, U>);
    describe(): string;
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, value: this["C"]): this["N"];
    isValidSnapshot(value: this["C"], context: IValidationContext): IValidationResult;
    reconcile(current: this["N"], value: T, parent: AnyObjectNode, subpath: string): this["N"];
}
export {};
