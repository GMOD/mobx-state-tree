import type { ModelPrimitive } from "../../types/complex-types/model.ts";
import type { IJsonPatch } from "../json-patch.ts";
import { type AnyNode, BaseNode } from "../node/BaseNode.ts";
import { type IStateTreeNode } from "../node/node-utils.ts";
import type { AnyObjectNode, IChildNodesMap, ObjectNode } from "../node/object-node.ts";
import type { ScalarNode } from "../node/scalar-node.ts";
import { type IValidationContext, type IValidationResult } from "./type-checker.ts";
/**
 * @internal
 * @hidden
 */
export declare enum TypeFlags {
    String = 1,
    Number = 2,
    Boolean = 4,
    Date = 8,
    Literal = 16,
    Array = 32,
    Map = 64,
    Object = 128,
    Frozen = 256,
    Optional = 512,
    Reference = 1024,
    Identifier = 2048,
    Late = 4096,
    Refinement = 8192,
    Union = 16384,
    Null = 32768,
    Undefined = 65536,
    Integer = 131072,
    Custom = 262144,
    SnapshotProcessor = 524288,
    Lazy = 1048576,
    Finite = 2097152,
    Float = 4194304
}
/**
 * @internal
 * @hidden
 */
export declare const cannotDetermineSubtype = "cannotDetermine";
/**
 * A state tree node value.
 * @hidden
 */
export type STNValue<T, IT extends IAnyType> = T extends object ? T & IStateTreeNode<IT> : T;
/** @hidden */
declare const $type: unique symbol;
/**
 * A type, either complex or simple.
 */
export interface IType<C, S, T> {
    /** @hidden */
    readonly [$type]: undefined;
    /**
     * Friendly type name.
     */
    name: string;
    /**
     * Name of the identifier attribute or null if none.
     */
    readonly identifierAttribute?: string;
    /**
     * Creates an instance for the type given an snapshot input.
     *
     * @returns An instance of that type.
     */
    create(snapshot?: C, env?: any): this["Type"];
    /**
     * Checks if a given snapshot / instance is of the given type.
     *
     * @param thing Snapshot or instance to be checked.
     * @returns true if the value is of the current type, false otherwise.
     */
    is(thing: any): thing is C | this["Type"];
    /**
     * Run's the type's typechecker on the given value with the given validation context.
     *
     * @param thing Value to be checked, either a snapshot or an instance.
     * @param context Validation context, an array of { subpaths, subtypes } that should be validated
     * @returns The validation result, an array with the list of validation errors.
     */
    validate(thing: C, context: IValidationContext): IValidationResult;
    /**
     * Gets the textual representation of the type as a string.
     */
    describe(): string;
    /**
     * @deprecated use `Instance<typeof MyType>` instead.
     * @hidden
     */
    readonly Type: STNValue<T, this>;
    /**
     * @deprecated do not use.
     * @hidden
     */
    readonly TypeWithoutSTN: T;
    /**
     * @deprecated use `SnapshotOut<typeof MyType>` instead.
     * @hidden
     */
    readonly SnapshotType: S;
    /**
     * @deprecated use `SnapshotIn<typeof MyType>` instead.
     * @hidden
     */
    readonly CreationType: C;
    /**
     * @internal
     * @hidden
     */
    flags: TypeFlags;
    /**
     * @internal
     * @hidden
     */
    isType: true;
    /**
     * @internal
     * @hidden
     */
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: C | T): BaseNode<C, S, T>;
    /**
     * @internal
     * @hidden
     */
    reconcile(current: BaseNode<C, S, T>, newValue: C | T, parent: AnyObjectNode, subpath: string): BaseNode<C, S, T>;
    /**
     * @internal
     * @hidden
     */
    getSnapshot(node: BaseNode<C, S, T>, applyPostProcess?: boolean): S;
    /**
     * @internal
     * @hidden
     */
    isAssignableFrom(type: IAnyType): boolean;
    /**
     * @internal
     * @hidden
     */
    getSubTypes(): IAnyType[] | IAnyType | null | typeof cannotDetermineSubtype;
}
/**
 * Any kind of type.
 */
export interface IAnyType extends IType<any, any, any> {
}
/**
 * A simple type, this is, a type where the instance and the snapshot representation are the same.
 */
export interface ISimpleType<T> extends IType<T, T, T> {
}
/** @hidden */
export type Primitives = ModelPrimitive | null | undefined;
/**
 * A complex type.
 * @deprecated just for compatibility with old versions, could be deprecated on the next major version
 * @hidden
 */
export interface IComplexType<C, S, T> extends IType<C, S, T & object> {
}
/**
 * Any kind of complex type.
 */
export interface IAnyComplexType extends IType<any, any, object> {
}
/** @hidden */
export type ExtractCSTWithoutSTN<IT extends {
    [$type]: undefined;
    CreationType: any;
    SnapshotType: any;
    TypeWithoutSTN: any;
}> = IT["CreationType"] | IT["SnapshotType"] | IT["TypeWithoutSTN"];
/** @hidden */
export type ExtractCSTWithSTN<IT extends {
    [$type]: undefined;
    CreationType: any;
    SnapshotType: any;
    Type: any;
}> = IT["CreationType"] | IT["SnapshotType"] | IT["Type"];
/**
 * The instance representation of a given type.
 */
export type Instance<T> = T extends {
    [$type]: undefined;
    Type: any;
} ? T["Type"] : T;
/**
 * The input (creation) snapshot representation of a given type.
 */
export type SnapshotIn<T> = T extends {
    [$type]: undefined;
    CreationType: any;
} ? T["CreationType"] : T extends IStateTreeNode<infer IT> ? IT["CreationType"] : T;
/**
 * The output snapshot representation of a given type.
 */
export type SnapshotOut<T> = T extends {
    [$type]: undefined;
    SnapshotType: any;
} ? T["SnapshotType"] : T extends IStateTreeNode<infer IT> ? IT["SnapshotType"] : T;
/**
 * A type which is equivalent to the union of SnapshotIn and Instance types of a given typeof TYPE or typeof VARIABLE.
 * For primitives it defaults to the primitive itself.
 *
 * For example:
 * - `SnapshotOrInstance<typeof ModelA> = SnapshotIn<typeof ModelA> | Instance<typeof ModelA>`
 * - `SnapshotOrInstance<typeof self.a (where self.a is a ModelA)> = SnapshotIn<typeof ModelA> | Instance<typeof ModelA>`
 *
 * Usually you might want to use this when your model has a setter action that sets a property.
 *
 * Example:
 * ```ts
 * const ModelA = types.model({
 *   n: types.number
 * })
 *
 * const ModelB = types.model({
 *   innerModel: ModelA
 * }).actions(self => ({
 *   // this will accept as property both the snapshot and the instance, whichever is preferred
 *   setInnerModel(m: SnapshotOrInstance<typeof self.innerModel>) {
 *     self.innerModel = cast(m)
 *   }
 * }))
 * ```
 */
export type SnapshotOrInstance<T> = SnapshotIn<T> | Instance<T>;
/**
 * A base type produces a MST node (Node in the state tree)
 *
 * @internal
 * @hidden
 */
export declare abstract class BaseType<C, S, T, N extends BaseNode<any, any, any> = BaseNode<C, S, T>> implements IType<C, S, T> {
    [$type]: undefined;
    readonly C: C;
    readonly S: S;
    readonly T: T;
    readonly N: N;
    readonly isType = true;
    readonly name: string;
    constructor(name: string);
    create(snapshot?: C, environment?: any): any;
    getSnapshot(_node: N, _applyPostProcess?: boolean): S;
    abstract reconcile(current: N, newValue: C | T, parent: AnyObjectNode, subpath: string): N;
    abstract instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: C | T): N;
    abstract flags: TypeFlags;
    abstract describe(): string;
    abstract isValidSnapshot(value: C, context: IValidationContext): IValidationResult;
    isAssignableFrom(type: IAnyType): boolean;
    validate(value: C | T, context: IValidationContext): IValidationResult;
    is(thing: any): thing is any;
    get Type(): any;
    get TypeWithoutSTN(): any;
    get SnapshotType(): any;
    get CreationType(): any;
    abstract getSubTypes(): IAnyType[] | IAnyType | null | typeof cannotDetermineSubtype;
}
/**
 * @internal
 * @hidden
 */
export type AnyBaseType = BaseType<any, any, any, any>;
/**
 * @internal
 * @hidden
 */
export type ExtractNodeType<IT extends IAnyType> = IT extends BaseType<any, any, any, infer N> ? N : never;
/**
 * A complex type produces a MST node (Node in the state tree)
 *
 * @internal
 * @hidden
 */
export declare abstract class ComplexType<C, S, T> extends BaseType<C, S, T, ObjectNode<C, S, T>> {
    identifierAttribute?: string;
    constructor(name: string);
    create(snapshot?: C, environment?: any): any;
    getValue(node: this["N"]): T;
    abstract getDefaultSnapshot(): C;
    abstract createNewInstance(childNodes: IChildNodesMap): T;
    abstract finalizeNewInstance(node: this["N"], instance: any): void;
    abstract applySnapshot(node: this["N"], snapshot: C): void;
    abstract applyPatchLocally(node: this["N"], subpath: string, patch: IJsonPatch): void;
    abstract processInitialSnapshot(childNodes: IChildNodesMap, snapshot: C): S;
    abstract getChildren(node: this["N"]): ReadonlyArray<AnyNode>;
    abstract getChildNode(node: this["N"], key: string): AnyNode;
    abstract getChildType(propertyName?: string): IAnyType;
    abstract initializeChildNodes(node: this["N"], snapshot: any): IChildNodesMap;
    abstract removeChild(node: this["N"], subpath: string): void;
    isMatchingSnapshotId(current: this["N"], snapshot: C): boolean;
    private tryToReconcileNode;
    reconcile(current: this["N"], newValue: C | T, parent: AnyObjectNode, subpath: string): this["N"];
    getSubTypes(): null;
}
/**
 * @internal
 * @hidden
 */
export declare abstract class SimpleType<C, S, T> extends BaseType<C, S, T, ScalarNode<C, S, T>> {
    abstract instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: C): this["N"];
    createNewInstance(snapshot: C): T;
    getValue(node: this["N"]): T;
    getSnapshot(node: this["N"]): S;
    reconcile(current: this["N"], newValue: C, parent: AnyObjectNode, subpath: string): this["N"];
    getSubTypes(): null;
}
/**
 * Returns if a given value represents a type.
 *
 * @param value Value to check.
 * @returns `true` if the value is a type.
 */
export declare function isType(value: any): value is IAnyType;
/**
 * @internal
 * @hidden
 */
export declare function assertIsType(type: IAnyType, argNumber: number | number[]): void;
export {};
