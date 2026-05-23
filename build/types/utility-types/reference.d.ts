import { SimpleType } from "../../core/type/type.ts";
import { type IAnyStateTreeNode, type IStateTreeNode } from "../../core/node/node-utils.ts";
import type { AnyObjectNode } from "../../core/node/object-node.ts";
import { type IValidationContext, type IValidationResult } from "../../core/type/type-checker.ts";
import { type IAnyComplexType, type IAnyType, type IType, TypeFlags } from "../../core/type/type.ts";
import { type ReferenceIdentifier } from "./identifier-utils.ts";
import { type IMaybe } from "./maybe.ts";
export type OnReferenceInvalidatedEvent<STN extends IAnyStateTreeNode> = {
    parent: IAnyStateTreeNode;
    invalidTarget: STN | undefined;
    invalidId: ReferenceIdentifier;
    replaceRef: (newRef: STN | null | undefined) => void;
    removeRef: () => void;
    cause: "detach" | "destroy" | "invalidSnapshotReference";
};
export type OnReferenceInvalidated<STN extends IAnyStateTreeNode> = (event: OnReferenceInvalidatedEvent<STN>) => void;
/** @hidden */
export type ReferenceT<IT extends IAnyType> = IT["TypeWithoutSTN"] & IStateTreeNode<IReferenceType<IT>>;
/**
 * @internal
 * @hidden
 */
export declare class InvalidReferenceError extends Error {
    constructor(m: string);
}
/**
 * @internal
 * @hidden
 */
export declare abstract class BaseReferenceType<IT extends IAnyComplexType> extends SimpleType<ReferenceIdentifier, ReferenceIdentifier, IT["TypeWithoutSTN"]> {
    protected readonly targetType: IT;
    private readonly onInvalidated?;
    readonly flags = TypeFlags.Reference;
    constructor(targetType: IT, onInvalidated?: OnReferenceInvalidated<ReferenceT<IT>> | undefined);
    describe(): string;
    isAssignableFrom(type: IAnyType): boolean;
    isValidSnapshot(value: this["C"], context: IValidationContext): IValidationResult;
    private fireInvalidated;
    private addTargetNodeWatcher;
    protected watchTargetNodeForInvalidations(storedRefNode: this["N"], identifier: ReferenceIdentifier, customGetSet: ReferenceOptionsGetSet<IT> | undefined): void;
}
/**
 * @internal
 * @hidden
 */
export declare class IdentifierReferenceType<IT extends IAnyComplexType> extends BaseReferenceType<IT> {
    constructor(targetType: IT, onInvalidated?: OnReferenceInvalidated<ReferenceT<IT>>);
    getValue(storedRefNode: this["N"]): any;
    getSnapshot(storedRefNode: this["N"]): ReferenceIdentifier;
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: this["C"] | this["T"]): this["N"];
    reconcile(current: this["N"], newValue: this["C"] | this["T"], parent: AnyObjectNode, subpath: string): this["N"];
}
/**
 * @internal
 * @hidden
 */
export declare class CustomReferenceType<IT extends IAnyComplexType> extends BaseReferenceType<IT> {
    private readonly options;
    constructor(targetType: IT, options: ReferenceOptionsGetSet<IT>, onInvalidated?: OnReferenceInvalidated<ReferenceT<IT>>);
    getValue(storedRefNode: this["N"]): any;
    getSnapshot(storedRefNode: this["N"]): any;
    instantiate(parent: AnyObjectNode | null, subpath: string, environment: any, newValue: this["C"] | this["T"]): this["N"];
    reconcile(current: this["N"], newValue: this["C"] | this["T"], parent: AnyObjectNode, subpath: string): this["N"];
}
export interface ReferenceOptionsGetSet<IT extends IAnyComplexType> {
    get(identifier: ReferenceIdentifier, parent: IAnyStateTreeNode | null): ReferenceT<IT>;
    set(value: ReferenceT<IT>, parent: IAnyStateTreeNode | null): ReferenceIdentifier;
}
export interface ReferenceOptionsOnInvalidated<IT extends IAnyComplexType> {
    onInvalidated: OnReferenceInvalidated<ReferenceT<IT>>;
}
export type ReferenceOptions<IT extends IAnyComplexType> = ReferenceOptionsGetSet<IT> | ReferenceOptionsOnInvalidated<IT> | (ReferenceOptionsGetSet<IT> & ReferenceOptionsOnInvalidated<IT>);
/** @hidden */
export interface IReferenceType<IT extends IAnyComplexType> extends IType<ReferenceIdentifier, ReferenceIdentifier, IT["TypeWithoutSTN"]> {
}
/**
 * `types.reference` - Creates a reference to another type, which should have defined an identifier.
 * See also the [reference and identifiers](https://github.com/mobxjs/mobx-state-tree#references-and-identifiers) section.
 */
export declare function reference<IT extends IAnyComplexType>(subType: IT, options?: ReferenceOptions<IT>): IReferenceType<IT>;
/**
 * Returns if a given value represents a reference type.
 *
 * @param type
 * @returns
 */
export declare function isReferenceType<IT extends IReferenceType<any>>(type: IT): type is IT;
export declare function safeReference<IT extends IAnyComplexType>(subType: IT, options: (ReferenceOptionsGetSet<IT> | object) & {
    acceptsUndefined: false;
    onInvalidated?: OnReferenceInvalidated<ReferenceT<IT>>;
}): IReferenceType<IT>;
export declare function safeReference<IT extends IAnyComplexType>(subType: IT, options?: (ReferenceOptionsGetSet<IT> | object) & {
    acceptsUndefined?: boolean;
    onInvalidated?: OnReferenceInvalidated<ReferenceT<IT>>;
}): IMaybe<IReferenceType<IT>>;
