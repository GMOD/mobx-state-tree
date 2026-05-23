import { BaseNode } from "./BaseNode.ts";
import { ComplexType } from "../type/type.ts";
import { type ReferenceIdentifier } from "../../types/utility-types/identifier-utils.ts";
import { type IDisposer } from "../../utils.ts";
import { type IMiddleware, type IMiddlewareEvent, type IMiddlewareHandler } from "../action.ts";
import { type IJsonPatch, type IReversibleJsonPatch } from "../json-patch.ts";
import type { IAnyType, IType } from "../type/type.ts";
import type { AnyNode } from "./BaseNode.ts";
import { Hook } from "./Hook.ts";
import { IdentifierCache } from "./identifier-cache.ts";
import { type IStateTreeNode } from "./node-utils.ts";
/**
 * @internal
 * @hidden
 */
export interface IChildNodesMap {
    [key: string]: AnyNode;
}
/**
 * @internal
 * @hidden
 */
export declare class ObjectNode<C, S, T> extends BaseNode<C, S, T> {
    readonly type: ComplexType<C, S, T>;
    storedValue: T & IStateTreeNode<IType<C, S, T>>;
    readonly nodeId: number;
    readonly identifierAttribute?: string;
    readonly identifier: string | null;
    readonly unnormalizedIdentifier: ReferenceIdentifier | null;
    identifierCache?: IdentifierCache;
    isProtectionEnabled: boolean;
    middlewares?: IMiddleware[];
    hasSnapshotPostProcessor: boolean;
    private _applyPatches?;
    applyPatches(patches: IJsonPatch[]): void;
    private _applySnapshot?;
    applySnapshot(snapshot: C): void;
    private _autoUnbox;
    _isRunningAction: boolean;
    private _hasSnapshotReaction;
    private _observableInstanceState;
    private _childNodes;
    private _initialSnapshot;
    private _cachedInitialSnapshot?;
    private _cachedInitialSnapshotCreated;
    private _snapshotComputed;
    constructor(complexType: ComplexType<C, S, T>, parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: C);
    createObservableInstanceIfNeeded(fireHooks?: boolean): void;
    createObservableInstance(fireHooks?: boolean): void;
    get root(): AnyObjectNode;
    clearParent(): void;
    setParent(newParent: AnyObjectNode, subpath: string): void;
    protected fireHook(name: Hook): void;
    private _snapshotUponDeath?;
    get snapshot(): S;
    getSnapshot(): S;
    private _getActualSnapshot;
    private _getCachedInitialSnapshot;
    private isRunningAction;
    assertAlive(context: AssertAliveContext): void;
    private _getAssertAliveError;
    getChildNode(subpath: string): AnyNode;
    getChildren(): ReadonlyArray<AnyNode>;
    getChildType(propertyName?: string): IAnyType;
    get isProtected(): boolean;
    assertWritable(context: AssertAliveContext): void;
    removeChild(subpath: string): void;
    unbox(childNode: AnyNode | undefined): AnyNode | undefined;
    toString(): string;
    finalizeCreation(): void;
    detach(): void;
    private preboot;
    die(): void;
    aboutToDie(): void;
    finalizeDeath(): void;
    onSnapshot(onChange: (snapshot: S) => void): IDisposer;
    protected emitSnapshot(snapshot: S): void;
    onPatch(handler: (patch: IJsonPatch, reversePatch: IJsonPatch) => void): IDisposer;
    emitPatch(basePatch: IReversibleJsonPatch, source: AnyNode): void;
    hasDisposer(disposer: () => void): boolean;
    addDisposer(disposer: () => void): void;
    removeDisposer(disposer: () => void): void;
    private removeMiddleware;
    addMiddleWare(handler: IMiddlewareHandler, includeHooks?: boolean): IDisposer;
    applyPatchLocally(subpath: string, patch: IJsonPatch): void;
    private _addSnapshotReaction;
    private _internalEvents?;
    private _internalEventsHasSubscribers;
    private _internalEventsRegister;
    private _internalEventsHas;
    private _internalEventsUnregister;
    private _internalEventsEmit;
    private _internalEventsClear;
    private _internalEventsClearAll;
}
/**
 * @internal
 * @hidden
 */
export type AnyObjectNode = ObjectNode<any, any, any>;
/**
 * @internal
 * @hidden
 */
export interface AssertAliveContext {
    subpath?: string;
    actionContext?: IMiddlewareEvent;
}
