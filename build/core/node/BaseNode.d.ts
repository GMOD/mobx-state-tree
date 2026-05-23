import { type IDisposer } from "../../utils.ts";
import type { IAnyType } from "../type/type.ts";
import { Hook } from "./Hook.ts";
import { NodeLifeCycle } from "./NodeLifeCycle.ts";
import type { AnyObjectNode } from "./object-node.ts";
type HookSubscribers = {
    [Hook.afterAttach]: (node: AnyNode, hook: Hook) => void;
    [Hook.afterCreate]: (node: AnyNode, hook: Hook) => void;
    [Hook.afterCreationFinalization]: (node: AnyNode, hook: Hook) => void;
    [Hook.beforeDestroy]: (node: AnyNode, hook: Hook) => void;
    [Hook.beforeDetach]: (node: AnyNode, hook: Hook) => void;
};
/**
 * @internal
 * @hidden
 */
export declare abstract class BaseNode<C, S, T> {
    readonly type: IAnyType;
    environment: any;
    private _escapedSubpath?;
    private _subpath;
    get subpath(): string;
    private _subpathUponDeath?;
    get subpathUponDeath(): string | undefined;
    private _pathUponDeath?;
    protected get pathUponDeath(): string | undefined;
    storedValue: any;
    get value(): T;
    private aliveAtom?;
    private _state;
    get state(): NodeLifeCycle;
    set state(val: NodeLifeCycle);
    private _hookSubscribers?;
    protected abstract fireHook(name: Hook): void;
    protected fireInternalHook(name: Hook): void;
    registerHook<H extends Hook>(hook: H, hookHandler: HookSubscribers[H]): IDisposer;
    private _parent;
    get parent(): AnyObjectNode | null;
    constructor(type: IAnyType, parent: AnyObjectNode | null, subpath: string, environment: any);
    getReconciliationType(): IAnyType;
    private pathAtom?;
    protected baseSetParent(parent: AnyObjectNode | null, subpath: string): void;
    get path(): string;
    protected getEscapedPath(reportObserved: boolean): string;
    get isRoot(): boolean;
    abstract get root(): AnyObjectNode;
    abstract setParent(newParent: AnyObjectNode | null, subpath: string | null): void;
    abstract get snapshot(): S;
    abstract getSnapshot(): S;
    get isAlive(): boolean;
    get isDetaching(): boolean;
    get observableIsAlive(): boolean;
    abstract die(): void;
    abstract finalizeCreation(): void;
    protected baseFinalizeCreation(whenFinalized?: () => void): void;
    abstract finalizeDeath(): void;
    protected baseFinalizeDeath(): void;
    abstract aboutToDie(): void;
    protected baseAboutToDie(): void;
}
/**
 * @internal
 * @hidden
 */
export type AnyNode = BaseNode<any, any, any>;
export {};
