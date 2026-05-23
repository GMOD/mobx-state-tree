import { ComplexType, SimpleType } from "../type/type.ts";
import type { AnyNode } from "./BaseNode.ts";
import { type AnyObjectNode, ObjectNode } from "./object-node.ts";
import { ScalarNode } from "./scalar-node.ts";
/**
 * @internal
 * @hidden
 */
export declare function createObjectNode<C, S, T>(type: ComplexType<C, S, T>, parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: C | T): ObjectNode<C, S, T>;
/**
 * @internal
 * @hidden
 */
export declare function createScalarNode<C, S, T>(type: SimpleType<C, S, T>, parent: AnyObjectNode | null, subpath: string, environment: any, initialValue: C): ScalarNode<C, S, T>;
/**
 * @internal
 * @hidden
 */
export declare function isNode(value: any): value is AnyNode;
