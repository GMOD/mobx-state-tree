import { BaseNode } from "./BaseNode.ts";
import { SimpleType } from "../type/type.ts";
import { Hook } from "./Hook.ts";
import type { AnyObjectNode } from "./object-node.ts";
/**
 * @internal
 * @hidden
 */
export declare class ScalarNode<C, S, T> extends BaseNode<C, S, T> {
    readonly type: SimpleType<C, S, T>;
    constructor(simpleType: SimpleType<C, S, T>, parent: AnyObjectNode | null, subpath: string, environment: any, initialSnapshot: C);
    get root(): AnyObjectNode;
    setParent(newParent: AnyObjectNode, subpath: string): void;
    get snapshot(): S;
    getSnapshot(): S;
    toString(): string;
    die(): void;
    finalizeCreation(): void;
    aboutToDie(): void;
    finalizeDeath(): void;
    protected fireHook(name: Hook): void;
}
