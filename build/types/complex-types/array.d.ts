import { type IArrayDidChange, type IArraySplice, type IArrayWillChange, type IArrayWillSplice, type IObservableArray } from "mobx";
import { ComplexType } from "../../core/type/type.ts";
import type { IJsonPatch } from "../../core/json-patch.ts";
import type { AnyNode } from "../../core/node/BaseNode.ts";
import type { IHooksGetter } from "../../core/node/Hook.ts";
import { type AnyObjectNode, type IChildNodesMap } from "../../core/node/object-node.ts";
import { type IValidationContext, type IValidationResult } from "../../core/type/type-checker.ts";
import { type ExtractCSTWithSTN, type IAnyType, type IType, TypeFlags } from "../../core/type/type.ts";
/** @hidden */
export interface IMSTArray<IT extends IAnyType> extends IObservableArray<IT["Type"]> {
    push(...items: IT["Type"][]): number;
    push(...items: ExtractCSTWithSTN<IT>[]): number;
    concat(...items: ConcatArray<IT["Type"]>[]): IT["Type"][];
    concat(...items: ConcatArray<ExtractCSTWithSTN<IT>>[]): IT["Type"][];
    concat(...items: (IT["Type"] | ConcatArray<IT["Type"]>)[]): IT["Type"][];
    concat(...items: (ExtractCSTWithSTN<IT> | ConcatArray<ExtractCSTWithSTN<IT>>)[]): IT["Type"][];
    splice(start: number, deleteCount?: number): IT["Type"][];
    splice(start: number, deleteCount: number, ...items: IT["Type"][]): IT["Type"][];
    splice(start: number, deleteCount: number, ...items: ExtractCSTWithSTN<IT>[]): IT["Type"][];
    unshift(...items: IT["Type"][]): number;
    unshift(...items: ExtractCSTWithSTN<IT>[]): number;
}
/** @hidden */
export interface IArrayType<IT extends IAnyType> extends IType<readonly IT["CreationType"][] | undefined, IT["SnapshotType"][], IMSTArray<IT>> {
    hooks(hooks: IHooksGetter<IMSTArray<IAnyType>>): IArrayType<IT>;
}
/**
 * @internal
 * @hidden
 */
export declare class ArrayType<IT extends IAnyType> extends ComplexType<readonly IT["CreationType"][] | undefined, IT["SnapshotType"][], IMSTArray<IT>> {
    private readonly _subType;
    readonly flags = TypeFlags.Array;
    private readonly hookInitializers;
    constructor(name: string, _subType: IT, hookInitializers?: Array<IHooksGetter<IMSTArray<IT>>>);
    hooks(hooks: IHooksGetter<IMSTArray<IT>>): ArrayType<IT>;
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: this["C"] | this["T"]): this["N"];
    initializeChildNodes(objNode: this["N"], snapshot?: this["C"]): IChildNodesMap;
    createNewInstance(childNodes: IChildNodesMap): this["T"];
    finalizeNewInstance(node: this["N"], instance: this["T"]): void;
    describe(): string;
    getChildren(node: this["N"]): AnyNode[];
    getChildNode(node: this["N"], key: string): AnyNode;
    willChange(change: IArrayWillChange<AnyNode> | IArrayWillSplice<AnyNode>): IArrayWillChange<AnyNode> | IArrayWillSplice<AnyNode> | null;
    getSnapshot(node: this["N"]): this["S"];
    processInitialSnapshot(childNodes: IChildNodesMap): this["S"];
    didChange(change: IArrayDidChange<AnyNode> | IArraySplice<AnyNode>): void;
    applyPatchLocally(node: this["N"], subpath: string, patch: IJsonPatch): void;
    applySnapshot(node: this["N"], snapshot: this["C"]): void;
    getChildType(): IAnyType;
    isValidSnapshot(value: this["C"], context: IValidationContext): IValidationResult;
    getDefaultSnapshot(): this["C"];
    removeChild(node: this["N"], subpath: string): void;
}
/**
 * `types.array` - Creates an index based collection type who's children are all of a uniform declared type.
 *
 * This type will always produce [observable arrays](https://mobx.js.org/api.html#observablearray)
 *
 * Example:
 * ```ts
 * const Todo = types.model({
 *   task: types.string
 * })
 *
 * const TodoStore = types.model({
 *   todos: types.array(Todo)
 * })
 *
 * const s = TodoStore.create({ todos: [] })
 * unprotect(s) // needed to allow modifying outside of an action
 * s.todos.push({ task: "Grab coffee" })
 * console.log(s.todos[0]) // prints: "Grab coffee"
 * ```
 *
 * @param subtype
 * @returns
 */
export declare function array<IT extends IAnyType>(subtype: IT): IArrayType<IT>;
/**
 * Returns if a given value represents an array type.
 *
 * @param type
 * @returns `true` if the type is an array type.
 */
export declare function isArrayType<Items extends IAnyType = IAnyType>(type: IAnyType): type is IArrayType<Items>;
