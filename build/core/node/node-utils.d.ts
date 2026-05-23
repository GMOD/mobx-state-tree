import type { IAnyComplexType, IAnyType, Instance, IType, STNValue } from "../type/type.ts";
import type { AnyNode } from "./BaseNode.ts";
import { type AnyObjectNode, type IChildNodesMap } from "./object-node.ts";
export { NodeLifeCycle } from "./NodeLifeCycle.ts";
/** @hidden */
declare const $stateTreeNodeType: unique symbol;
/**
 * Common interface that represents a node instance.
 * @hidden
 */
export interface IStateTreeNode<IT extends IAnyType = IAnyType> {
    /**
     * @internal
     */
    readonly $treenode?: any;
    readonly [$stateTreeNodeType]?: [IT] | [any];
}
/** @hidden */
export type TypeOfValue<T extends IAnyStateTreeNode> = T extends IStateTreeNode<infer IT> ? IT : never;
/**
 * Represents any state tree node instance.
 * @hidden
 */
export interface IAnyStateTreeNode extends STNValue<any, IAnyType> {
}
/**
 * Returns true if the given value is a node in a state tree.
 * More precisely, that is, if the value is an instance of a
 * `types.model`, `types.array` or `types.map`.
 *
 * @param value
 * @returns true if the value is a state tree node.
 */
export declare function isStateTreeNode<IT extends IAnyComplexType = IAnyComplexType>(value: any): value is STNValue<Instance<IT>, IT>;
/**
 * @internal
 * @hidden
 */
export declare function assertIsStateTreeNode(value: IAnyStateTreeNode, argNumber: number | number[]): void;
/**
 * @internal
 * @hidden
 */
export declare function getStateTreeNode(value: IAnyStateTreeNode): AnyObjectNode;
/**
 * @internal
 * @hidden
 */
export declare function getStateTreeNodeSafe(value: IAnyStateTreeNode): AnyObjectNode | null;
/**
 * @internal
 * @hidden
 */
export declare function toJSON<S>(this: IStateTreeNode<IType<any, S, any>>): S;
/**
 * @internal
 * @hidden
 */
export declare function getRelativePathBetweenNodes(base: AnyObjectNode, target: AnyObjectNode): string;
/**
 * @internal
 * @hidden
 */
export declare function resolveNodeByPath(base: AnyObjectNode, path: string, failIfResolveFails?: boolean): AnyNode | undefined;
/**
 * @internal
 * @hidden
 */
export declare function resolveNodeByPathParts(base: AnyObjectNode, pathParts: string[], failIfResolveFails?: boolean): AnyNode | undefined;
/**
 * @internal
 * @hidden
 */
export declare function convertChildNodesToArray(childNodes: IChildNodesMap | null): AnyNode[];
