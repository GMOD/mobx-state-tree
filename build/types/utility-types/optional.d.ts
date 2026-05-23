import { BaseType } from "../../core/type/type.ts";
import type { AnyObjectNode } from "../../core/node/object-node.ts";
import { type IValidationContext, type IValidationResult } from "../../core/type/type-checker.ts";
import { type ExtractCSTWithSTN, type IAnyType, type IType } from "../../core/type/type.ts";
type IFunctionReturn<T> = () => T;
type IOptionalValue<C, T> = C | IFunctionReturn<C | T>;
/** @hidden */
export type ValidOptionalValue = string | boolean | number | null | undefined;
/** @hidden */
export type ValidOptionalValues = [ValidOptionalValue, ...ValidOptionalValue[]];
/**
 * @hidden
 * @internal
 */
export declare class OptionalValue<IT extends IAnyType, OptionalVals extends ValidOptionalValues> extends BaseType<IT["CreationType"] | OptionalVals[number], IT["SnapshotType"], IT["TypeWithoutSTN"]> {
    private readonly _subtype;
    private readonly _defaultValue;
    readonly optionalValues: OptionalVals;
    get flags(): number;
    constructor(_subtype: IT, _defaultValue: IOptionalValue<IT["CreationType"], IT["Type"]>, optionalValues: OptionalVals);
    describe(): string;
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: this["C"] | this["T"]): this["N"];
    reconcile(current: this["N"], newValue: this["C"] | this["T"], parent: AnyObjectNode, subpath: string): this["N"];
    getDefaultInstanceOrSnapshot(): this["C"] | this["T"];
    isValidSnapshot(value: this["C"], context: IValidationContext): IValidationResult;
    isAssignableFrom(type: IAnyType): boolean;
    getSubTypes(): IT;
}
/** @hidden */
export type OptionalDefaultValueOrFunction<IT extends IAnyType> = IT["CreationType"] | IT["SnapshotType"] | (() => ExtractCSTWithSTN<IT>);
/** @hidden */
export interface IOptionalIType<IT extends IAnyType, OptionalVals extends ValidOptionalValues> extends IType<IT["CreationType"] | OptionalVals[number], IT["SnapshotType"], IT["TypeWithoutSTN"]> {
}
export declare function optional<IT extends IAnyType>(type: IT, defaultValueOrFunction: OptionalDefaultValueOrFunction<IT>): IOptionalIType<IT, [undefined]>;
export declare function optional<IT extends IAnyType, OptionalVals extends ValidOptionalValues>(type: IT, defaultValueOrFunction: OptionalDefaultValueOrFunction<IT>, optionalValues: OptionalVals): IOptionalIType<IT, OptionalVals>;
/**
 * Returns if a value represents an optional type.
 *
 * @template IT
 * @param type
 * @returns
 */
export declare function isOptionalType<IT extends IAnyType>(type: IT): type is IT;
export {};
