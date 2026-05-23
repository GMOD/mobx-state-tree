import { type ExtractCSTWithSTN, type IAnyType } from "./type.ts";
/** Validation context entry, this is, where the validation should run against which type */
export interface IValidationContextEntry {
    /** Subpath where the validation should be run, or an empty string to validate it all */
    path: string;
    /** Type to validate the subpath against */
    type: IAnyType;
}
/** Array of validation context entries */
export type IValidationContext = IValidationContextEntry[];
/** Type validation error */
export interface IValidationError {
    /** Validation context */
    context: IValidationContext;
    /** Value that was being validated, either a snapshot or an instance */
    value: any;
    /** Error message */
    message?: string;
}
/** Type validation result, which is an array of type validation errors */
export type IValidationResult = IValidationError[];
/**
 * @internal
 * @hidden
 */
export declare function prettyPrintValue(value: any): string;
/**
 * @internal
 * @hidden
 * Pushes a new entry onto the context array (mutates in place for performance).
 * Returns the same context array for chaining.
 */
export declare function getContextForPath(context: IValidationContext, path: string, type: IAnyType): IValidationContext;
/**
 * @internal
 * @hidden
 * Pops the last entry from the context array (mutates in place).
 * Must be called after validation to restore context state.
 */
export declare function popContext(context: IValidationContext): void;
/**
 * @internal
 * @hidden
 */
export declare function typeCheckSuccess(): IValidationResult;
/**
 * @internal
 * @hidden
 */
export declare function typeCheckFailure(context: IValidationContext, value: any, message?: string): IValidationResult;
/**
 * @internal
 * @hidden
 */
export declare function flattenTypeErrors(errors: IValidationResult[]): IValidationResult;
/**
 * @internal
 * @hidden
 */
export declare function typecheckInternal<IT extends IAnyType>(type: IAnyType, value: ExtractCSTWithSTN<IT>): void;
/**
 * Run's the typechecker for the given type on the given value, which can be a snapshot or an instance.
 * Throws if the given value is not according the provided type specification.
 * Use this if you need typechecks even in a production build (by default all automatic runtime type checks will be skipped in production builds)
 *
 * @param type Type to check against.
 * @param value Value to be checked, either a snapshot or an instance.
 */
export declare function typecheck<IT extends IAnyType>(type: IT, value: ExtractCSTWithSTN<IT>): void;
