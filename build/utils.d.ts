import type { Primitives } from "./core/type/type.ts";
/**
 * @internal
 * @hidden
 */
export declare const EMPTY_ARRAY: ReadonlyArray<any>;
/**
 * @internal
 * @hidden
 */
export declare const EMPTY_OBJECT: {};
/**
 * @internal
 * @hidden
 */
export declare const mobxShallow: {
    deep: boolean;
    proxy?: undefined;
} | {
    deep: boolean;
    proxy: boolean;
};
/**
 * A generic disposer.
 */
export type IDisposer = () => void;
/**
 * @internal
 * @hidden
 */
export declare function fail(message?: string): Error;
/**
 * @internal
 * @hidden
 */
export declare function identity(_: any): any;
/**
 * @internal
 * @hidden
 */
export declare function noop(): void;
/**
 * @internal
 * @hidden
 */
export declare const isInteger: (number: unknown) => boolean;
/**
 * @internal
 * @hidden
 */
export declare function isFloat(val: any): boolean;
/**
 * @internal
 * @hidden
 */
export declare function isFinite(val: any): boolean;
/**
 * @internal
 * @hidden
 */
export declare function isArray(val: any): val is any[];
/**
 * @internal
 * @hidden
 */
export declare function asArray<T>(val: undefined | null | T | T[] | ReadonlyArray<T>): T[];
/**
 * @internal
 * @hidden
 */
export declare function extend<A, B>(a: A, b: B): A & B;
/**
 * @internal
 * @hidden
 */
export declare function extend<A, B, C>(a: A, b: B, c: C): A & B & C;
/**
 * @internal
 * @hidden
 */
export declare function extend<A, B, C, D>(a: A, b: B, c: C, d: D): A & B & C & D;
/**
 * @internal
 * @hidden
 */
export declare function extend(a: any, ...b: any[]): any;
/**
 * @internal
 * @hidden
 */
export declare function isPlainObject(value: any): value is {
    [k: string]: any;
};
/**
 * @internal
 * @hidden
 */
export declare function isMutable(value: any): boolean;
/**
 * @internal
 * @hidden
 */
export declare function isPrimitive(value: any, includeDate?: boolean): value is Primitives;
/**
 * @internal
 * @hidden
 * Freeze a value and return it (if not in production)
 */
export declare function freeze<T>(value: T): T;
/**
 * @internal
 * @hidden
 * Recursively freeze a value (if not in production)
 */
export declare function deepFreeze<T>(value: T): T;
/**
 * @internal
 * @hidden
 */
export declare function isSerializable(value: any): boolean;
/**
 * @internal
 * @hidden
 */
export declare function defineProperty(object: any, key: PropertyKey, descriptor: PropertyDescriptor): void;
/**
 * @internal
 * @hidden
 */
export declare function addHiddenFinalProp(object: any, propName: string, value: any): void;
/**
 * @internal
 * @hidden
 */
export declare function addHiddenWritableProp(object: any, propName: string, value: any): void;
/**
 * @internal
 * @hidden
 */
export type ArgumentTypes<F extends Function> = F extends (...args: infer A) => any ? A : never;
/**
 * @internal
 * @hidden
 */
export declare class EventHandlers<E extends {
    [k: string]: Function;
}> {
    private eventHandlers?;
    hasSubscribers(event: keyof E): boolean;
    register<N extends keyof E>(event: N, fn: E[N], atTheBeginning?: boolean): IDisposer;
    has<N extends keyof E>(event: N, fn: E[N]): boolean;
    unregister<N extends keyof E>(event: N, fn: E[N]): void;
    clear<N extends keyof E>(event: N): void;
    clearAll(): void;
    emit<N extends keyof E>(event: N, ...args: ArgumentTypes<E[N]>): void;
}
/**
 * @internal
 * @hidden
 */
export declare function hasOwnProperty(object: object, propName: string): boolean;
/**
 * @internal
 * @hidden
 */
export declare function argsToArray(args: IArguments): any[];
/**
 * @internal
 * @hidden
 */
export declare function stringStartsWith(str: string, beginning: string): boolean;
/**
 * @internal
 * @hidden
 */
export type DeprecatedFunction = Function & {
    ids?: {
        [id: string]: true;
    };
};
/**
 * @internal
 * @hidden
 */
export declare const deprecated: DeprecatedFunction;
/**
 * @internal
 * @hidden
 */
export declare function warnError(msg: string): void;
/**
 * @internal
 * @hidden
 */
export declare function isTypeCheckingEnabled(): boolean;
/**
 * @internal
 * @hidden
 */
export declare function devMode(): boolean;
/**
 * @internal
 * @hidden
 */
export declare function setDevMode(value: boolean): void;
/**
 * @internal
 * @hidden
 */
export declare function assertArg<T>(value: T, fn: (value: T) => boolean, typeName: string, argNumber: number | number[]): void;
/**
 * @internal
 * @hidden
 */
export declare function assertIsFunction(value: Function, argNumber: number | number[]): void;
/**
 * @internal
 * @hidden
 */
export declare function assertIsNumber(value: number, argNumber: number | number[], min?: number, max?: number): void;
/**
 * @internal
 * @hidden
 */
export declare function assertIsString(value: string, argNumber: number | number[], canBeEmpty?: boolean): void;
/**
 * @internal
 * @hidden
 */
export declare function setImmediateWithFallback(fn: (...args: any[]) => void): void;
