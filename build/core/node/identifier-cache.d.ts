import type { IAnyComplexType } from "../type/type.ts";
import { type AnyObjectNode, ObjectNode } from "./object-node.ts";
/**
 * @internal
 * @hidden
 */
export declare class IdentifierCache {
    private cacheId;
    private cache;
    private lastCacheModificationPerId;
    constructor();
    private updateLastCacheModificationPerId;
    getLastCacheModificationPerId(identifier: string): string;
    addNodeToCache(node: AnyObjectNode, lastCacheUpdate?: boolean): void;
    mergeCache(node: AnyObjectNode): void;
    notifyDied(node: AnyObjectNode): void;
    splitCache(splitNode: AnyObjectNode): IdentifierCache;
    has(type: IAnyComplexType, identifier: string): boolean;
    resolve<IT extends IAnyComplexType>(type: IT, identifier: string): ObjectNode<IT["CreationType"], IT["SnapshotType"], IT["TypeWithoutSTN"]> | null;
}
